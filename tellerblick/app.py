"""Tellerblick – calorie & protein tracking by photo. Run: uvicorn app:app --port 8300"""
from __future__ import annotations

import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import date, timedelta
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import foods
import nutrition

ROOT = Path(__file__).parent
DATA = ROOT / "data"
PHOTOS = DATA / "photos"
PHOTOS.mkdir(parents=True, exist_ok=True)
DB = DATA / "tellerblick.db"

app = FastAPI(title="Tellerblick")


@contextmanager
def conn():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()


with conn() as c:
    c.executescript("""
    CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY, day TEXT NOT NULL, meal TEXT NOT NULL, name TEXT NOT NULL, grams REAL NOT NULL,
      kcal REAL NOT NULL, protein REAL NOT NULL, carbs REAL NOT NULL, fat REAL NOT NULL, photo TEXT DEFAULT '',
      source TEXT DEFAULT 'manuell', created TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS idx_entries_day ON entries(day);
    CREATE TABLE IF NOT EXISTS weights (day TEXT PRIMARY KEY, kg REAL NOT NULL);
    """)

MEALS = ("Frühstück", "Mittagessen", "Abendessen", "Snack")


class Profile(BaseModel):
    sex: str = Field(pattern="^(m|w)$")
    age: int = Field(ge=14, le=100)
    height_cm: float = Field(ge=120, le=230)
    weight_kg: float = Field(ge=35, le=300)
    activity: str = Field(pattern="^(sitzend|leicht|mittel|aktiv|sehr_aktiv)$")
    goal: str = Field(pattern="^(abnehmen|halten|zunehmen)$")
    rate_kg_week: float = Field(ge=0, le=1.0, default=0.5)
    protein_g_per_kg: float = Field(ge=0.8, le=2.5, default=1.8)


class Entry(BaseModel):
    day: str
    meal: str
    name: str = Field(min_length=1)
    grams: float = Field(gt=0)
    kcal: float = Field(ge=0)
    protein: float = Field(ge=0)
    carbs: float = Field(ge=0)
    fat: float = Field(ge=0)
    photo: str = ""
    source: str = "manuell"


class Weight(BaseModel):
    day: str
    kg: float = Field(ge=30, le=300)


def get_profile() -> dict | None:
    with conn() as c:
        r = c.execute("SELECT data FROM profile WHERE id = 1").fetchone()
    return json.loads(r["data"]) if r else None


@app.get("/api/profile")
def read_profile():
    p = get_profile()
    return {"profile": p, "targets": nutrition.targets(p) if p else None, "ai": bool(
        os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))}


@app.put("/api/profile")
def write_profile(p: Profile):
    with conn() as c:
        c.execute("INSERT INTO profile (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
                  (p.model_dump_json(),))
        c.execute("INSERT OR IGNORE INTO weights (day, kg) VALUES (?, ?)", (date.today().isoformat(), p.weight_kg))
    return read_profile()


@app.get("/api/foods")
def search_foods(q: str = ""):
    return foods.search(q)


@app.post("/api/analyze")
async def analyze(photo: UploadFile = File(...), hint: str = Form("")):
    raw = await photo.read()
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(413, "Foto zu groß (max. 15 MB)")
    try:
        jpeg, _ = nutrition.shrink(raw)
    except Exception:
        raise HTTPException(400, "Datei ist kein lesbares Bild")
    photo_id = uuid.uuid4().hex[:12] + ".jpg"
    (PHOTOS / photo_id).write_bytes(jpeg)
    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        return {"photo": photo_id, "ai": False, "items": [], "meal_name": "",
                "notes": "KI-Analyse ist nicht aktiv (kein ANTHROPIC_API_KEY). Bitte Lebensmittel unten suchen und hinzufügen."}
    try:
        res = nutrition.analyze_photo(jpeg, hint)
    except Exception as e:
        return {"photo": photo_id, "ai": False, "items": [], "meal_name": "",
                "notes": f"Analyse fehlgeschlagen ({type(e).__name__}). Bitte manuell eintragen."}
    return {"photo": photo_id, "ai": True, **res}


@app.get("/photos/{name}")
def get_photo(name: str):
    p = PHOTOS / name
    if "/" in name or not p.exists():
        raise HTTPException(404)
    return FileResponse(p)


@app.post("/api/entries")
def add_entries(entries: list[Entry]):
    for e in entries:
        if e.meal not in MEALS:
            raise HTTPException(400, f"meal muss einer von {MEALS} sein")
        date.fromisoformat(e.day)
    with conn() as c:
        c.executemany(
            "INSERT INTO entries (day, meal, name, grams, kcal, protein, carbs, fat, photo, source) VALUES (?,?,?,?,?,?,?,?,?,?)",
            [(e.day, e.meal, e.name, e.grams, round(e.kcal), round(e.protein, 1), round(e.carbs, 1), round(e.fat, 1),
              e.photo, e.source) for e in entries])
    return day_view(entries[0].day if entries else date.today().isoformat())


@app.delete("/api/entries/{eid}")
def delete_entry(eid: int):
    with conn() as c:
        r = c.execute("SELECT day FROM entries WHERE id = ?", (eid,)).fetchone()
        if not r:
            raise HTTPException(404)
        c.execute("DELETE FROM entries WHERE id = ?", (eid,))
    return day_view(r["day"])


def _totals(rows) -> dict:
    return {k: round(sum(r[k] for r in rows), 1) for k in ("kcal", "protein", "carbs", "fat")}


@app.get("/api/day/{day}")
def day_view(day: str):
    with conn() as c:
        rows = [dict(r) for r in c.execute("SELECT * FROM entries WHERE day = ? ORDER BY id", (day,))]
    p = get_profile()
    return {"day": day, "entries": rows, "totals": _totals(rows), "targets": nutrition.targets(p) if p else None}


@app.post("/api/weights")
def add_weight(w: Weight):
    date.fromisoformat(w.day)
    with conn() as c:
        c.execute("INSERT INTO weights (day, kg) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET kg = excluded.kg", (w.day, w.kg))
        if w.day >= max(r["day"] for r in c.execute("SELECT day FROM weights")):
            p = get_profile()
            if p:  # targets follow the newest weight
                p["weight_kg"] = w.kg
                c.execute("UPDATE profile SET data = ? WHERE id = 1", (json.dumps(p),))
    return stats()


@app.get("/api/stats")
def stats():
    today = date.today()
    with conn() as c:
        weights = [dict(r) for r in c.execute("SELECT day, kg FROM weights ORDER BY day")]
        per_day = {r["day"]: dict(r) for r in c.execute(
            "SELECT day, SUM(kcal) kcal, SUM(protein) protein FROM entries GROUP BY day")}
    p = get_profile()
    t = nutrition.targets(p) if p else None
    last7 = [per_day.get((today - timedelta(days=i)).isoformat()) for i in range(7)]
    logged = [d for d in last7 if d]
    streak = 0
    d = today if today.isoformat() in per_day else today - timedelta(days=1)
    while d.isoformat() in per_day:
        streak += 1
        d -= timedelta(days=1)
    # 7-day moving average smooths daily water-weight noise
    trend = []
    for i, w in enumerate(weights):
        lo = date.fromisoformat(w["day"]) - timedelta(days=6)
        win = [x["kg"] for x in weights[: i + 1] if date.fromisoformat(x["day"]) >= lo]
        trend.append({"day": w["day"], "kg": w["kg"], "avg": round(sum(win) / len(win), 2)})
    return {
        "streak": streak,
        "avg_kcal_7d": round(sum(d["kcal"] for d in logged) / len(logged)) if logged else None,
        "protein_days_7d": sum(1 for d in logged if t and d["protein"] >= 0.9 * t["protein"]),
        "logged_days_7d": len(logged),
        "weights": trend,
        "last14": [{"day": (today - timedelta(days=i)).isoformat(),
                    "kcal": round((per_day.get((today - timedelta(days=i)).isoformat()) or {}).get("kcal") or 0)}
                   for i in range(13, -1, -1)],
        "targets": t,
    }


app.mount("/", StaticFiles(directory=ROOT / "static", html=True), name="static")

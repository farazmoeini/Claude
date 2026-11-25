"""Tellerblick API – calorie & protein tracking by photo.

Run locally:  cd backend && uvicorn app:app --port 8300   → http://localhost:8300
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import secrets
import smtplib
import time
import uuid
from datetime import date, timedelta
from email.message import EmailMessage
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import auth
import billing
import config
import db
import foods
import nutrition

log = logging.getLogger("tellerblick")
ROOT = Path(__file__).resolve().parent.parent
db.init()
if config.SECRET_KEY_IS_RANDOM:
    log.warning("SECRET_KEY not set – using a random key; all logins end on restart.")

app = FastAPI(title="Tellerblick", docs_url="/api/docs" if config.DEBUG else None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"],
                   allow_headers=["Authorization", "Content-Type"], max_age=3600)

MEALS = ("Frühstück", "Mittagessen", "Abendessen", "Snack")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
User = dict


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    if request.url.path.startswith("/api/"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


# ================================================================ models
class Register(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=8, max_length=200)
    consent_health: bool          # explicit consent, Art. 9 (2)(a) GDPR
    consent_terms: bool


class Login(BaseModel):
    email: str
    password: str


class Forgot(BaseModel):
    email: str


class Reset(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=200)


class DeleteMe(BaseModel):
    password: str


class Profile(BaseModel):
    sex: str = Field(pattern="^(m|w)$")
    age: int = Field(ge=16, le=100)
    height_cm: float = Field(ge=120, le=230)
    weight_kg: float = Field(ge=35, le=300)
    activity: str = Field(pattern="^(sitzend|leicht|mittel|aktiv|sehr_aktiv)$")
    goal: str = Field(pattern="^(abnehmen|halten|zunehmen)$")
    rate_kg_week: float = Field(ge=0, le=1.0, default=0.5)
    protein_g_per_kg: float = Field(ge=0.8, le=2.5, default=1.8)


class Entry(BaseModel):
    day: str
    meal: str
    name: str = Field(min_length=1, max_length=120)
    grams: float = Field(gt=0, le=5000)
    kcal: float = Field(ge=0, le=10000)
    protein: float = Field(ge=0, le=1000)
    carbs: float = Field(ge=0, le=1000)
    fat: float = Field(ge=0, le=1000)
    photo: str = ""
    source: str = Field(default="manuell", pattern="^(manuell|suche|foto)$")


class Weight(BaseModel):
    day: str
    kg: float = Field(ge=30, le=300)


def _day(s: str) -> str:
    try:
        d = date.fromisoformat(s)
    except ValueError:
        raise HTTPException(400, "Ungültiges Datum")
    if d > date.today() + timedelta(days=1):
        raise HTTPException(400, "Datum liegt in der Zukunft")
    return d.isoformat()


# ================================================================ auth
@app.post("/api/auth/register")
def register(r: Register, request: Request):
    auth.rate_limit(request, "register", 5, 3600)
    email = r.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Bitte eine gültige E-Mail-Adresse angeben.")
    if not (r.consent_health and r.consent_terms):
        raise HTTPException(400, "Ohne Einwilligung kann die App deine Ernährungsdaten nicht verarbeiten.")
    if db.one("SELECT 1 FROM users WHERE email = ?", (email,)):
        raise HTTPException(409, "Für diese E-Mail gibt es schon ein Konto. Bitte anmelden.")
    uid = uuid.uuid4().hex
    db.run("INSERT INTO users (id, email, pw_hash, consent_at, consent_version) VALUES (?,?,?,datetime('now'),?)",
           (uid, email, auth.hash_password(r.password), config.CONSENT_VERSION))
    user = db.one("SELECT * FROM users WHERE id = ?", (uid,))
    return {"token": auth.login_token(user), "user_id": uid}


@app.post("/api/auth/login")
def login(r: Login, request: Request):
    auth.rate_limit(request, "login", 10, 600)
    user = db.one("SELECT * FROM users WHERE email = ?", (r.email.strip().lower(),))
    if not user or not auth.verify_password(r.password, user["pw_hash"]):
        raise HTTPException(401, "E-Mail oder Passwort falsch.")
    return {"token": auth.login_token(user), "user_id": user["id"]}


@app.post("/api/auth/logout-everywhere")
def logout_everywhere(user: User = Depends(auth.current_user)):
    db.run("UPDATE users SET token_version = token_version + 1 WHERE id = ?", (user["id"],))
    return {"ok": True}


@app.post("/api/auth/forgot")
def forgot(f: Forgot, request: Request):
    auth.rate_limit(request, "forgot", 5, 3600)
    if not config.SMTP_HOST:
        raise HTTPException(503, "Passwort-Zurücksetzen ist gerade nicht verfügbar. Bitte den Support kontaktieren.")
    user = db.one("SELECT * FROM users WHERE email = ?", (f.email.strip().lower(),))
    if user:  # same answer either way – don't reveal which e-mails exist
        tok = secrets.token_urlsafe(32)
        db.run("INSERT INTO reset_tokens (token_hash, user_id, expires) VALUES (?,?,?)",
               (hashlib.sha256(tok.encode()).hexdigest(), user["id"], time.time() + 3600))
        msg = EmailMessage()
        msg["Subject"], msg["From"], msg["To"] = "Tellerblick: Passwort zurücksetzen", config.MAIL_FROM, user["email"]
        msg.set_content(f"Hallo,\n\nüber diesen Link kannst du ein neues Passwort festlegen (1 Stunde gültig):\n"
                        f"{config.PUBLIC_URL}/reset.html#{tok}\n\nWenn du das nicht angefordert hast, ignoriere diese Mail.\n")
        try:
            with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15) as s:
                s.starttls()
                if config.SMTP_USER:
                    s.login(config.SMTP_USER, config.SMTP_PASSWORD)
                s.send_message(msg)
        except Exception:
            log.exception("reset mail failed")
            raise HTTPException(503, "E-Mail konnte nicht gesendet werden. Bitte später erneut versuchen.")
    return {"ok": True}


@app.post("/api/auth/reset")
def reset(r: Reset, request: Request):
    auth.rate_limit(request, "reset", 10, 3600)
    h = hashlib.sha256(r.token.encode()).hexdigest()
    row = db.one("SELECT * FROM reset_tokens WHERE token_hash = ?", (h,))
    if not row or row["expires"] < time.time():
        raise HTTPException(400, "Der Link ist abgelaufen. Bitte neu anfordern.")
    db.run("UPDATE users SET pw_hash = ?, token_version = token_version + 1 WHERE id = ?",
           (auth.hash_password(r.password), row["user_id"]))
    db.run("DELETE FROM reset_tokens WHERE user_id = ?", (row["user_id"],))
    return {"ok": True}


# ================================================================ account
def _scans_today(uid: str) -> int:
    r = db.one("SELECT n FROM scans WHERE user_id = ? AND day = ?", (uid, date.today().isoformat()))
    return r["n"] if r else 0


@app.get("/api/me")
def me(user: User = Depends(auth.current_user), refresh: bool = False):
    profile = json.loads(user["profile"]) if user["profile"] else None
    premium = billing.is_premium(user, force=refresh)
    return {
        "user_id": user["id"], "email": user["email"], "profile": profile,
        "targets": nutrition.targets(profile) if profile else None,
        "premium": premium, "ai": config.AI_ENABLED,
        "free_scans_left": max(0, config.FREE_SCANS - user["free_scans_used"]),
        "scans_left_today": max(0, config.DAILY_SCAN_LIMIT - _scans_today(user["id"])),
    }


@app.delete("/api/me")
def delete_me(d: DeleteMe, user: User = Depends(auth.current_user)):
    """Apple guideline 5.1.1(v): accounts must be deletable inside the app. Removes everything incl. photos."""
    if not auth.verify_password(d.password, user["pw_hash"]):
        raise HTTPException(403, "Passwort falsch.")
    for p in db.rows("SELECT name FROM photos WHERE user_id = ?", (user["id"],)):
        (config.PHOTO_DIR / p["name"]).unlink(missing_ok=True)
    db.run("DELETE FROM users WHERE id = ?", (user["id"],))  # cascades to entries, weights, photos, scans
    return {"deleted": True}


@app.get("/api/me/export")
def export_me(user: User = Depends(auth.current_user)):
    """GDPR Art. 15/20: all personal data as JSON."""
    data = {
        "exported_at": date.today().isoformat(),
        "account": {k: user[k] for k in ("email", "created", "consent_at", "consent_version")},
        "profile": json.loads(user["profile"]) if user["profile"] else None,
        "entries": db.rows("SELECT day, meal, name, grams, kcal, protein, carbs, fat, source, created FROM entries "
                           "WHERE user_id = ? ORDER BY day, id", (user["id"],)),
        "weights": db.rows("SELECT day, kg FROM weights WHERE user_id = ? ORDER BY day", (user["id"],)),
    }
    return JSONResponse(data, headers={"Content-Disposition": 'attachment; filename="tellerblick-export.json"'})


@app.put("/api/profile")
def write_profile(p: Profile, user: User = Depends(auth.current_user)):
    db.run("UPDATE users SET profile = ? WHERE id = ?", (p.model_dump_json(), user["id"]))
    db.run("INSERT OR IGNORE INTO weights (user_id, day, kg) VALUES (?,?,?)", (user["id"], date.today().isoformat(), p.weight_kg))
    return me(db.one("SELECT * FROM users WHERE id = ?", (user["id"],)))


# ================================================================ billing webhook
@app.post("/api/billing/webhook")
async def revenuecat_webhook(request: Request, authorization: str = Header(default="")):
    if not config.REVENUECAT_WEBHOOK_AUTH or authorization != config.REVENUECAT_WEBHOOK_AUTH:
        raise HTTPException(401)
    ev = (await request.json()).get("event", {})
    for uid in {ev.get("app_user_id"), *(ev.get("aliases") or [])} - {None}:
        billing.invalidate(uid)
    return {"ok": True}


# ================================================================ food & photos
@app.get("/api/foods")
def search_foods(q: str = "", user: User = Depends(auth.current_user)):
    return foods.search(q[:60])


@app.post("/api/analyze")
async def analyze(photo: UploadFile = File(...), hint: str = Form(""), user: User = Depends(auth.current_user)):
    premium = billing.is_premium(user)
    if not premium and user["free_scans_used"] >= config.FREE_SCANS:
        raise HTTPException(402, "Deine kostenlosen Foto-Analysen sind aufgebraucht. Mit Premium analysierst du jede Mahlzeit.")
    if _scans_today(user["id"]) >= config.DAILY_SCAN_LIMIT:
        raise HTTPException(429, "Tageslimit für Foto-Analysen erreicht. Morgen geht's weiter.")
    raw = await photo.read()
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(413, "Foto zu groß (max. 15 MB).")
    try:
        jpeg, _ = nutrition.shrink(raw)
    except Exception:
        raise HTTPException(400, "Die Datei ist kein lesbares Bild.")
    name = uuid.uuid4().hex + ".jpg"
    (config.PHOTO_DIR / name).write_bytes(jpeg)
    db.run("INSERT INTO photos (name, user_id) VALUES (?, ?)", (name, user["id"]))
    base = {"photo": name, "photo_url": auth.photo_url(name)}
    if not config.AI_ENABLED:
        return {**base, "ai": False, "items": [], "meal_name": "",
                "notes": "Die Foto-Analyse ist gerade nicht verfügbar. Bitte Lebensmittel über die Suche eintragen."}
    try:
        res = nutrition.analyze_photo(jpeg, hint[:200])
    except Exception:
        log.exception("analysis failed")
        return {**base, "ai": False, "items": [], "meal_name": "",
                "notes": "Die Analyse hat gerade nicht geklappt. Bitte erneut versuchen oder manuell eintragen."}
    # count only successful analyses
    db.run("INSERT INTO scans (user_id, day, n) VALUES (?,?,1) ON CONFLICT(user_id, day) DO UPDATE SET n = n + 1",
           (user["id"], date.today().isoformat()))
    if not premium:
        db.run("UPDATE users SET free_scans_used = free_scans_used + 1 WHERE id = ?", (user["id"],))
    return {**base, "ai": True, **res}


@app.get("/photos/{name}")
def get_photo(name: str, t: str = ""):
    if not re.fullmatch(r"[0-9a-f]{32}\.jpg", name) or not auth.check_photo(name, t):
        raise HTTPException(404)
    p = config.PHOTO_DIR / name
    if not p.exists():
        raise HTTPException(404)
    return FileResponse(p, headers={"Cache-Control": "private, max-age=86400"})


# ================================================================ diary
def _owned_photo(name: str, uid: str) -> str:
    if not name:
        return ""
    if not db.one("SELECT 1 FROM photos WHERE name = ? AND user_id = ?", (name, uid)):
        raise HTTPException(400, "Unbekanntes Foto")
    return name


@app.post("/api/entries")
def add_entries(entries: list[Entry], user: User = Depends(auth.current_user)):
    if not entries or len(entries) > 30:
        raise HTTPException(400, "1–30 Einträge pro Anfrage")
    vals = []
    for e in entries:
        if e.meal not in MEALS:
            raise HTTPException(400, f"meal muss einer von {MEALS} sein")
        vals.append((user["id"], _day(e.day), e.meal, e.name.strip(), e.grams, round(e.kcal), round(e.protein, 1),
                     round(e.carbs, 1), round(e.fat, 1), _owned_photo(e.photo, user["id"]), e.source))
    with db.conn() as c:
        c.executemany("INSERT INTO entries (user_id, day, meal, name, grams, kcal, protein, carbs, fat, photo, source) "
                      "VALUES (?,?,?,?,?,?,?,?,?,?,?)", vals)
    return day_view(vals[0][1], user)


@app.delete("/api/entries/{eid}")
def delete_entry(eid: int, user: User = Depends(auth.current_user)):
    r = db.one("SELECT day FROM entries WHERE id = ? AND user_id = ?", (eid, user["id"]))
    if not r:
        raise HTTPException(404)
    db.run("DELETE FROM entries WHERE id = ? AND user_id = ?", (eid, user["id"]))
    return day_view(r["day"], user)


def _totals(rows) -> dict:
    return {k: round(sum(r[k] for r in rows), 1) for k in ("kcal", "protein", "carbs", "fat")}


@app.get("/api/day/{day}")
def day_view(day: str, user: User = Depends(auth.current_user)):
    day = _day(day)
    rows = db.rows("SELECT id, day, meal, name, grams, kcal, protein, carbs, fat, photo, source FROM entries "
                   "WHERE user_id = ? AND day = ? ORDER BY id", (user["id"], day))
    for r in rows:
        r["photo_url"] = auth.photo_url(r["photo"])
    p = json.loads(user["profile"]) if user["profile"] else None
    return {"day": day, "entries": rows, "totals": _totals(rows), "targets": nutrition.targets(p) if p else None}


@app.get("/api/recent")
def recent_foods(user: User = Depends(auth.current_user)):
    """Most frequently logged foods (per 100 g) for one-tap re-logging."""
    rows = db.rows("SELECT name, COUNT(*) n, SUM(grams) g, SUM(kcal) k, SUM(protein) p, SUM(carbs) c, SUM(fat) f, "
                   "ROUND(AVG(grams)) avg_g FROM entries WHERE user_id = ? GROUP BY name ORDER BY n DESC, MAX(id) DESC LIMIT 12",
                   (user["id"],))
    return [{"name": r["name"], "kcal": round(100 * r["k"] / r["g"], 1), "protein": round(100 * r["p"] / r["g"], 1),
             "carbs": round(100 * r["c"] / r["g"], 1), "fat": round(100 * r["f"] / r["g"], 1),
             "portion_g": r["avg_g"], "portion_label": f"{r['n']}× gegessen"} for r in rows if r["g"]]


@app.post("/api/weights")
def add_weight(w: Weight, user: User = Depends(auth.current_user)):
    day = _day(w.day)
    db.run("INSERT INTO weights (user_id, day, kg) VALUES (?,?,?) ON CONFLICT(user_id, day) DO UPDATE SET kg = excluded.kg",
           (user["id"], day, w.kg))
    newest = db.one("SELECT MAX(day) d FROM weights WHERE user_id = ?", (user["id"],))["d"]
    if day >= newest and user["profile"]:  # targets follow the newest weight
        p = json.loads(user["profile"])
        p["weight_kg"] = w.kg
        db.run("UPDATE users SET profile = ? WHERE id = ?", (json.dumps(p), user["id"]))
    return stats(db.one("SELECT * FROM users WHERE id = ?", (user["id"],)))


@app.get("/api/stats")
def stats(user: User = Depends(auth.current_user)):
    today = date.today()
    weights = db.rows("SELECT day, kg FROM weights WHERE user_id = ? ORDER BY day", (user["id"],))
    per_day = {r["day"]: r for r in db.rows(
        "SELECT day, SUM(kcal) kcal, SUM(protein) protein FROM entries WHERE user_id = ? AND day >= ? GROUP BY day",
        (user["id"], (today - timedelta(days=400)).isoformat()))}
    p = json.loads(user["profile"]) if user["profile"] else None
    t = nutrition.targets(p) if p else None
    logged = [per_day[d] for d in ((today - timedelta(days=i)).isoformat() for i in range(7)) if d in per_day]
    streak, d = 0, (today if today.isoformat() in per_day else today - timedelta(days=1))
    while d.isoformat() in per_day:
        streak += 1
        d -= timedelta(days=1)
    trend = []
    for i, w in enumerate(weights):
        lo = (date.fromisoformat(w["day"]) - timedelta(days=6)).isoformat()
        win = [x["kg"] for x in weights[: i + 1] if x["day"] >= lo]
        trend.append({"day": w["day"], "kg": w["kg"], "avg": round(sum(win) / len(win), 2)})
    return {
        "streak": streak,
        "avg_kcal_7d": round(sum(x["kcal"] for x in logged) / len(logged)) if logged else None,
        "protein_days_7d": sum(1 for x in logged if t and x["protein"] >= 0.9 * t["protein"]),
        "logged_days_7d": len(logged),
        "weights": trend[-180:],
        "last14": [{"day": (today - timedelta(days=i)).isoformat(),
                    "kcal": round((per_day.get((today - timedelta(days=i)).isoformat()) or {"kcal": 0})["kcal"] or 0)}
                   for i in range(13, -1, -1)],
        "targets": t,
    }


@app.get("/healthz")
def healthz():
    db.one("SELECT 1 AS ok")
    return {"ok": True, "ai": config.AI_ENABLED, "billing": config.BILLING_MODE}


# legal pages + web app (the native apps bundle the same web/ folder)
app.mount("/legal", StaticFiles(directory=ROOT / "legal", html=True, check_dir=False), name="legal")
app.mount("/", StaticFiles(directory=ROOT / "web", html=True), name="web")

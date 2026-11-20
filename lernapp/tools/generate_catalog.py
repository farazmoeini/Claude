"""Generate a PrüfFit question catalog from your own learning material with Claude.

Usage:
  export ANTHROPIC_API_KEY=...
  python tools/generate_catalog.py skript.pdf  --id sportboot --title "Sportbootführerschein See" -n 40
  python tools/generate_catalog.py notizen.txt --id ausbilder --title "AEVO Ausbilderschein" -n 60

Only use material you have the rights to. The output is a draft: review every
question before you sell or publish a catalog.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from pathlib import Path

import anthropic
from pydantic import BaseModel, Field


class Question(BaseModel):
    topic: str = Field(description="Kurzes Themengebiet, 1-3 Wörter")
    q: str
    options: list[str] = Field(description="3-4 Antwortmöglichkeiten")
    correct: list[int] = Field(description="0-basierte Indizes der richtigen Antworten")
    explanation: str = Field(description="1-3 Sätze, warum die Antwort richtig ist")


class Batch(BaseModel):
    questions: list[Question]


def material_block(path: Path) -> dict:
    if path.suffix.lower() == ".pdf":
        data = base64.standard_b64encode(path.read_bytes()).decode()
        return {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": data}}
    return {"type": "text", "text": path.read_text(encoding="utf-8", errors="replace")}


def generate(client: anthropic.Anthropic, material: dict, title: str, n: int, avoid: list[str]) -> list[Question]:
    avoid_txt = "\n".join(f"- {a}" for a in avoid[-200:]) or "(keine)"
    resp = client.messages.parse(
        model=os.environ.get("PRUEFFIT_MODEL", "claude-opus-5-5"),
        max_tokens=16000,
        output_config={"effort": "medium"},
        system=(
            "Du erstellst Prüfungsfragen für eine Lern-App. Jede Frage muss eindeutig aus dem Material "
            "beantwortbar und fachlich korrekt sein. Falsche Antworten sollen plausibel, aber eindeutig falsch "
            "sein. Keine Fragen, deren Antwort im Material fehlt. Schreibe auf Deutsch."
        ),
        messages=[{
            "role": "user",
            "content": [
                material,
                {"type": "text", "text": (
                    f"Erstelle {n} neue Multiple-Choice-Fragen für den Katalog „{title}“. "
                    "Mische Fragen mit genau einer und mit mehreren richtigen Antworten (etwa 80/20). "
                    f"Diese Fragen gibt es schon, wiederhole sie nicht:\n{avoid_txt}"
                )},
            ],
        }],
        output_format=Batch,
    )
    if resp.stop_reason == "refusal" or resp.parsed_output is None:
        sys.exit(f"Claude hat keine Fragen geliefert (stop_reason={resp.stop_reason}).")
    return resp.parsed_output.questions


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("material", type=Path)
    ap.add_argument("--id", required=True, help="Kurzname, z. B. sportboot")
    ap.add_argument("--title", required=True)
    ap.add_argument("-n", type=int, default=40, help="Anzahl Fragen")
    ap.add_argument("--out", type=Path, help="Zieldatei (Standard: catalogs/<id>.json)")
    ap.add_argument("--exam-questions", type=int, default=30)
    ap.add_argument("--exam-minutes", type=int, default=45)
    ap.add_argument("--pass-percent", type=int, default=80)
    a = ap.parse_args()

    client = anthropic.Anthropic()
    material = material_block(a.material)
    out = a.out or Path(__file__).resolve().parent.parent / "catalogs" / f"{a.id}.json"
    existing = json.loads(out.read_text()) if out.exists() else None
    questions = existing["questions"] if existing else []

    while len(questions) < a.n:
        batch = generate(client, material, a.title, min(25, a.n - len(questions)), [q["q"] for q in questions])
        for q in batch:
            if len(q.options) < 2 or not q.correct or any(k < 0 or k >= len(q.options) for k in q.correct):
                continue  # skip malformed items
            questions.append({"id": f"{a.id}{len(questions) + 1:03d}", **q.model_dump()})
        print(f"{len(questions)}/{a.n} Fragen", file=sys.stderr)

    catalog = {
        "id": a.id, "title": a.title,
        "description": f"Erstellt aus {a.material.name}. Bitte vor Veröffentlichung prüfen.",
        "version": (existing or {}).get("version", 0) + 1,
        "exam": {"questions": a.exam_questions, "minutes": a.exam_minutes, "pass_percent": a.pass_percent},
        "questions": questions[: a.n],
    }
    out.write_text(json.dumps(catalog, ensure_ascii=False, indent=1), encoding="utf-8")
    idx = out.parent / "index.json"
    if idx.exists():
        files = json.loads(idx.read_text())
        if out.name not in files:
            idx.write_text(json.dumps(files + [out.name]))
    print(f"Gespeichert: {out}")


if __name__ == "__main__":
    main()

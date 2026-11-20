"""Turn a free-text job description into quote line items.

Two strategies:
  * Claude (if ANTHROPIC_API_KEY is set): understands context, maps to the price list,
    estimates quantities that follow from the text (e.g. skirting length from room area).
  * Rule-based fallback: splits the text into parts, finds quantities and the best
    matching price-list entry by keywords. Works offline and costs nothing.
"""
from __future__ import annotations

import difflib
import math
import os
import re

UNIT_ALIASES = {
    "m²": ["m²", "m2", "qm", "quadratmeter"],
    "lfm": ["lfm", "laufende meter", "laufmeter", "meter", "m"],
    "Stk": ["stk", "stück", "x"],
    "Std": ["std", "stunden", "stunde", "h"],
}
NUM = r"(\d+(?:[.,]\d+)?)"
SEP = r"(?<!\d),|,(?!\d)|;|\n"


def _num(s: str) -> float:
    return float(s.replace(",", "."))


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower().replace("ß", "ss")).strip()


def _find_qty(part: str) -> tuple[float | None, str | None]:
    p = _norm(part)
    p = re.sub(r"\b\d+\s*x\s*\d+\b", " ", p)  # tile formats like 60x60 are not quantities
    for unit, aliases in UNIT_ALIASES.items():
        for a in sorted(aliases, key=len, reverse=True):
            m = re.search(NUM + r"\s*" + re.escape(a) + r"(?![a-zäöü])", p)
            if m:
                return _num(m.group(1)), unit
    m = re.search(r"\b" + NUM + r"\b", p)
    return (_num(m.group(1)), None) if m else (None, None)


def _dims(text: str) -> tuple[float, float] | None:
    m = re.search(NUM + r"\s*m?\s*x\s*" + NUM + r"\s*m\b", _norm(text))
    return (_num(m.group(1)), _num(m.group(2))) if m else None


def _area_from_text(text: str) -> float | None:
    q, unit = None, None
    # room dimensions first ("3 x 2,5 m", "3m x 2,5m") = floor area
    m = re.search(NUM + r"\s*m?\s*x\s*" + NUM + r"\s*m\b", _norm(text))
    if m:
        return round(_num(m.group(1)) * _num(m.group(2)), 2)
    for part in re.split(SEP, text):
        q, unit = _find_qty(part)
        if unit == "m²":
            return q
    return None


def _score(part: str, price: dict) -> float:
    p = _norm(part)
    best = 0.0
    for kw in [price["name"]] + [k for k in price.get("keywords", "").split(",") if k.strip()]:
        kw = _norm(kw)
        if kw and kw in p:
            best = max(best, 1.0 + len(kw) / 40)  # exact phrase hit, longer phrase wins
        else:
            words = [w for w in re.findall(r"[a-zäöü0-9]+", p) if len(w) > 2]
            for w in words:
                for k in kw.split():
                    if len(k) > 3:
                        r = difflib.SequenceMatcher(None, w, k).ratio()
                        if r > 0.82:
                            best = max(best, 0.5 * r)
    return best


def draft_rules(text: str, prices: list[dict]) -> dict:
    area = _area_from_text(text)
    parts = [x.strip() for x in re.split(SEP + r"|\bund\b|\bplus\b|\bsowie\b|:", text) if x.strip()]
    items, unmatched, used = [], [], set()
    for part in parts:
        ranked = sorted(prices, key=lambda pr: _score(part, pr), reverse=True)
        best = ranked[0] if ranked else None
        if not best or _score(part, best) < 0.5:
            if not re.fullmatch(r"[\W\d\s]*(m²|m2|qm)?[\W\s]*", part, re.I) and not re.search(r"^(bad|küche|raum|zimmer|wohn|schlaf|flur|wc-raum)", _norm(part)):
                unmatched.append(part)
            continue
        if best["id"] in used:
            continue
        qty, unit = _find_qty(part)
        if qty is None or (unit and unit != best["unit"] and best["unit"] != "pauschal"):
            if best["unit"] == "m²" and area:
                qty = area
            elif best["unit"] == "lfm" and area:
                dims = _dims(text)
                qty = round(2 * (dims[0] + dims[1]), 2) if dims else round(4 * math.sqrt(area), 1)  # room perimeter
            elif best["unit"] in ("Stk", "pauschal"):
                qty = qty if qty and unit in (None, "Stk") else 1
            else:
                qty = qty or 1
        used.add(best["id"])
        items.append({"price_id": best["id"], "description": best["name"], "qty": round(qty, 2),
                      "unit": best["unit"], "price": best["price"], "note": ""})
    notes = []
    if unmatched:
        notes.append("Nicht zugeordnet (bitte manuell ergänzen): " + "; ".join(unmatched))
    return {"items": items, "notes": notes, "engine": "regeln"}


def draft_ai(text: str, prices: list[dict]) -> dict:
    import anthropic
    from pydantic import BaseModel

    class Item(BaseModel):
        price_id: int | None
        description: str
        qty: float
        unit: str
        price: float
        note: str

    class Draft(BaseModel):
        title: str
        items: list[Item]
        notes: list[str]

    plist = "\n".join(f"{p['id']} | {p['name']} | {p['unit']} | {p['price']:.2f} €" for p in prices)
    client = anthropic.Anthropic()
    resp = client.messages.parse(
        model=os.environ.get("ANGEBOT_MODEL", "claude-opus-5-5"),
        max_tokens=8000,
        output_config={"effort": "medium"},
        system=(
            "Du bist Kalkulator in einem deutschen Handwerksbetrieb. Erstelle aus der Auftragsbeschreibung "
            "Angebotspositionen. Nutze bevorzugt Positionen aus der Preisliste (price_id und deren Preis "
            "unverändert übernehmen). Leite fehlende Mengen sinnvoll ab (z. B. Silikonfugen aus dem Raumumfang) "
            "und erkläre Annahmen kurz in note. Für nötige Leistungen ohne passende Position: price_id null, "
            "realistischer Nettopreis und note 'Preis geschätzt – prüfen'. Erfinde keine Leistungen, die der "
            "Kunde nicht braucht. notes: offene Fragen an den Kunden."
        ),
        messages=[{"role": "user", "content": f"Preisliste (id | Leistung | Einheit | Netto):\n{plist}\n\nAuftrag:\n{text}"}],
        output_format=Draft,
    )
    if resp.stop_reason == "refusal" or resp.parsed_output is None:
        raise RuntimeError(f"stop_reason={resp.stop_reason}")
    d = resp.parsed_output
    valid = {p["id"]: p for p in prices}
    items = []
    for it in d.items:
        row = it.model_dump()
        if row["price_id"] not in valid:
            row["price_id"] = None
        items.append(row)
    return {"title": d.title, "items": items, "notes": d.notes, "engine": "claude"}


def draft(text: str, prices: list[dict]) -> dict:
    if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        try:
            return draft_ai(text, prices)
        except Exception as e:  # fall back, never block the user
            r = draft_rules(text, prices)
            r["notes"].insert(0, f"KI nicht verfügbar ({type(e).__name__}), Regel-Entwurf erstellt.")
            return r
    return draft_rules(text, prices)

"""Energy/macro targets and AI photo analysis."""
from __future__ import annotations

import base64
import io
import os

ACTIVITY = {"sitzend": 1.2, "leicht": 1.375, "mittel": 1.55, "aktiv": 1.725, "sehr_aktiv": 1.9}
KCAL_PER_KG_FAT = 7700


def targets(p: dict) -> dict:
    """Mifflin-St Jeor BMR × activity, then goal adjustment and macro split."""
    w, h, a = float(p["weight_kg"]), float(p["height_cm"]), int(p["age"])
    bmr = 10 * w + 6.25 * h - 5 * a + (5 if p["sex"] == "m" else -161)
    tdee = bmr * ACTIVITY.get(p.get("activity", "leicht"), 1.375)
    rate = float(p.get("rate_kg_week", 0.5))  # kg per week
    delta = {"abnehmen": -1, "halten": 0, "zunehmen": 1}[p.get("goal", "halten")] * rate * KCAL_PER_KG_FAT / 7
    floor = 1500 if p["sex"] == "m" else 1200
    kcal = max(floor, round((tdee + delta) / 10) * 10)
    protein = round(w * float(p.get("protein_g_per_kg", 1.8)))
    fat = round(kcal * 0.27 / 9)
    carbs = max(0, round((kcal - protein * 4 - fat * 9) / 4))
    return {"bmr": round(bmr), "tdee": round(tdee), "kcal": kcal, "protein": protein, "fat": fat, "carbs": carbs,
            "floor_applied": kcal == floor and tdee + delta < floor}


def shrink(data: bytes, max_side: int = 1280) -> tuple[bytes, str]:
    """Downscale large phone photos (faster + cheaper analysis). Returns (jpeg bytes, media type)."""
    from PIL import Image, ImageOps

    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img).convert("RGB")
    img.thumbnail((max_side, max_side))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=85)
    return out.getvalue(), "image/jpeg"


def analyze_photo(jpeg: bytes, hint: str = "") -> dict:
    import anthropic
    from pydantic import BaseModel, Field

    class Item(BaseModel):
        name: str = Field(description="Lebensmittel auf Deutsch, z. B. 'Spaghetti, gekocht'")
        grams: float = Field(description="geschätzte Menge in Gramm (Getränke: ml)")
        kcal: float
        protein: float
        carbs: float
        fat: float
        confidence: str = Field(description="hoch, mittel oder niedrig")

    class Meal(BaseModel):
        meal_name: str
        is_food: bool
        items: list[Item]
        notes: str = Field(description="Annahmen oder Rückfragen, max. 2 Sätze")

    client = anthropic.Anthropic()
    resp = client.messages.parse(
        model=os.environ.get("TELLERBLICK_MODEL", "claude-opus-5-5"),
        max_tokens=4000,
        output_config={"effort": "low"},
        system=(
            "Du schätzt Nährwerte von Mahlzeiten auf Fotos für eine Ernährungs-App. Erkenne jede Komponente "
            "einzeln, schätze Portionsgrößen anhand von Teller, Besteck und Verpackung und gib Werte für die "
            "gezeigte Menge an (nicht pro 100 g). Denke an versteckte Fette (Öl, Butter, Soßen). Typisch deutsche "
            "Portionen. Ist kein Essen zu sehen: is_food=false und leere items."
        ),
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                         "data": base64.standard_b64encode(jpeg).decode()}},
            {"type": "text", "text": "Analysiere diese Mahlzeit." + (f" Hinweis vom Nutzer: {hint}" if hint else "")},
        ]}],
        output_format=Meal,
    )
    if resp.stop_reason == "refusal" or resp.parsed_output is None:
        raise RuntimeError(f"Analyse nicht möglich (stop_reason={resp.stop_reason})")
    return resp.parsed_output.model_dump()

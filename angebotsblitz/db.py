"""SQLite storage for AngebotsBlitz (single company, single file)."""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "angebotsblitz.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS prices (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL, price REAL NOT NULL,
  category TEXT DEFAULT '', keywords TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, address TEXT DEFAULT '', email TEXT DEFAULT '', phone TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('quote','invoice')), number TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id), date TEXT NOT NULL, service_date TEXT DEFAULT '',
  due_date TEXT DEFAULT '', title TEXT DEFAULT '', intro TEXT DEFAULT '', items TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'entwurf', source_id INTEGER REFERENCES documents(id), created TEXT DEFAULT CURRENT_TIMESTAMP);
"""

DEFAULT_SETTINGS = {
    "company": "Muster Fliesen & Bad GmbH",
    "owner": "Max Mustermann",
    "street": "Handwerkerstraße 1",
    "city": "12345 Musterstadt",
    "phone": "0123 456789",
    "email": "info@example.de",
    "tax_number": "12/345/67890",
    "vat_id": "",
    "iban": "DE00 0000 0000 0000 0000 00",
    "bank": "Musterbank",
    "kleinunternehmer": False,
    "vat_rate": 19.0,
    "payment_days": 14,
    "quote_valid_days": 30,
    "quote_prefix": "A",
    "invoice_prefix": "R",
    "footer": "Vielen Dank für Ihr Vertrauen!",
}

# Example price list (net, EUR) – placeholders for the demo, replace with your own prices.
DEMO_PRICES = [
    ("Altbelag Fliesen entfernen inkl. Entsorgung", "m²", 28.0, "Abbruch", "alte fliesen raus,abschlagen,abbruch,fliesen entfernen,rausreißen"),
    ("Untergrund grundieren", "m²", 4.5, "Vorarbeiten", "grundierung,grundieren,vorstrich"),
    ("Abdichtung Nassbereich (Flüssigabdichtung)", "m²", 32.0, "Vorarbeiten", "abdichtung,abdichten,dusche,nassbereich"),
    ("Bodenfliesen verlegen bis 60x60 cm", "m²", 58.0, "Fliesen", "fliesen verlegen,bodenfliesen,boden,60x60,neue fliesen"),
    ("Großformat-Fliesen verlegen ab 60x120 cm", "m²", 79.0, "Fliesen", "großformat,120x60,60x120,großformatig"),
    ("Wandfliesen verlegen", "m²", 62.0, "Fliesen", "wandfliesen,wand,fliesenspiegel"),
    ("Fugen und Silikonfugen erneuern", "lfm", 9.5, "Fliesen", "silikon,silikonfuge,fugen,verfugen"),
    ("Sockelleiste aus Fliesen", "lfm", 14.0, "Fliesen", "sockel,sockelleiste"),
    ("Material Fliesen (Standard)", "m²", 35.0, "Material", "fliesenmaterial,material fliesen,fliesen kaufen"),
    ("WC demontieren und neu montieren", "Stk", 240.0, "Sanitär", "wc,toilette,klo"),
    ("Waschtisch montieren inkl. Armatur", "Stk", 210.0, "Sanitär", "waschtisch,waschbecken,armatur"),
    ("Bodengleiche Dusche herstellen", "Stk", 1450.0, "Sanitär", "bodengleiche dusche,walk-in,ebenerdig"),
    ("Wände streichen (2 Anstriche)", "m²", 11.0, "Maler", "streichen,anstrich,malern,wände"),
    ("Arbeitsstunde Geselle", "Std", 58.0, "Stunden", "stunde,stunden,arbeitszeit,std"),
    ("Anfahrt / Baustelleneinrichtung", "pauschal", 65.0, "Sonstiges", "anfahrt,baustelleneinrichtung"),
]


@contextmanager
def conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init() -> None:
    with conn() as c:
        c.executescript(SCHEMA)
        if not c.execute("SELECT 1 FROM settings").fetchone():
            c.execute("INSERT INTO settings (id, data) VALUES (1, ?)", (json.dumps(DEFAULT_SETTINGS),))
        if not c.execute("SELECT 1 FROM prices").fetchone():
            c.executemany("INSERT INTO prices (name, unit, price, category, keywords) VALUES (?,?,?,?,?)", DEMO_PRICES)


def get_settings() -> dict:
    with conn() as c:
        row = c.execute("SELECT data FROM settings WHERE id = 1").fetchone()
    return {**DEFAULT_SETTINGS, **json.loads(row["data"])}


def save_settings(data: dict) -> dict:
    merged = {**get_settings(), **{k: v for k, v in data.items() if k in DEFAULT_SETTINGS}}
    with conn() as c:
        c.execute("UPDATE settings SET data = ? WHERE id = 1", (json.dumps(merged),))
    return merged


def rows(sql: str, args: tuple = ()) -> list[dict]:
    with conn() as c:
        return [dict(r) for r in c.execute(sql, args).fetchall()]


def one(sql: str, args: tuple = ()) -> dict | None:
    r = rows(sql, args)
    return r[0] if r else None


def execute(sql: str, args: tuple = ()) -> int:
    with conn() as c:
        cur = c.execute(sql, args)
        return cur.lastrowid


def next_number(kind: str, year: int) -> str:
    """Sequential numbers per year, e.g. A-2026-0001 / R-2026-0001 (invoices must be gapless)."""
    s = get_settings()
    prefix = s["quote_prefix"] if kind == "quote" else s["invoice_prefix"]
    stem = f"{prefix}-{year}-"
    last = one("SELECT number FROM documents WHERE number LIKE ? ORDER BY number DESC LIMIT 1", (stem + "%",))
    n = int(last["number"].rsplit("-", 1)[1]) + 1 if last else 1
    return f"{stem}{n:04d}"

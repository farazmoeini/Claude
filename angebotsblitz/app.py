"""AngebotsBlitz – quotes & invoices for tradespeople. Run: uvicorn app:app --port 8200"""
from __future__ import annotations

import csv
import io
import json
from datetime import date, timedelta
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import db
import drafting
import pdf

ROOT = Path(__file__).parent
db.init()
app = FastAPI(title="AngebotsBlitz")


# ---------------------------------------------------------------- models
class PriceIn(BaseModel):
    name: str = Field(min_length=1)
    unit: str = Field(min_length=1)
    price: float = Field(ge=0)
    category: str = ""
    keywords: str = ""


class CustomerIn(BaseModel):
    name: str = Field(min_length=1)
    address: str = ""
    email: str = ""
    phone: str = ""


class ItemIn(BaseModel):
    price_id: int | None = None
    description: str = Field(min_length=1)
    qty: float
    unit: str
    price: float
    note: str = ""


class DocIn(BaseModel):
    customer_id: int | None = None
    title: str = ""
    intro: str = ""
    items: list[ItemIn]
    date: str | None = None
    service_date: str = ""


class DraftIn(BaseModel):
    text: str = Field(min_length=3)


class StatusIn(BaseModel):
    status: str


# ---------------------------------------------------------------- settings
@app.get("/api/settings")
def get_settings():
    return db.get_settings()


@app.put("/api/settings")
def put_settings(data: dict):
    return db.save_settings(data)


# ---------------------------------------------------------------- prices
@app.get("/api/prices")
def list_prices():
    return db.rows("SELECT * FROM prices ORDER BY category, name")


@app.post("/api/prices")
def add_price(p: PriceIn):
    pid = db.execute("INSERT INTO prices (name, unit, price, category, keywords) VALUES (?,?,?,?,?)",
                     (p.name, p.unit, p.price, p.category, p.keywords))
    return db.one("SELECT * FROM prices WHERE id = ?", (pid,))


@app.put("/api/prices/{pid}")
def update_price(pid: int, p: PriceIn):
    db.execute("UPDATE prices SET name=?, unit=?, price=?, category=?, keywords=? WHERE id=?",
               (p.name, p.unit, p.price, p.category, p.keywords, pid))
    return db.one("SELECT * FROM prices WHERE id = ?", (pid,))


@app.delete("/api/prices/{pid}")
def delete_price(pid: int):
    db.execute("DELETE FROM prices WHERE id = ?", (pid,))
    return {"ok": True}


@app.post("/api/prices/import")
async def import_prices(file: UploadFile = File(...)):
    """CSV with header: name;unit;price;category;keywords  (also accepts comma separator)."""
    raw = (await file.read()).decode("utf-8-sig", errors="replace")
    dialect = csv.Sniffer().sniff(raw.splitlines()[0], delimiters=";,")
    n, errors = 0, []
    for i, r in enumerate(csv.DictReader(io.StringIO(raw), dialect=dialect), 2):
        try:
            PriceIn(name=r["name"], unit=r["unit"], price=float(str(r["price"]).replace(",", ".")),
                    category=r.get("category") or "", keywords=r.get("keywords") or "")
            add_price(PriceIn(name=r["name"].strip(), unit=r["unit"].strip(),
                              price=float(str(r["price"]).replace(",", ".")),
                              category=(r.get("category") or "").strip(), keywords=(r.get("keywords") or "").strip()))
            n += 1
        except Exception as e:
            errors.append(f"Zeile {i}: {e}")
    return {"imported": n, "errors": errors[:20]}


# ---------------------------------------------------------------- customers
@app.get("/api/customers")
def list_customers():
    return db.rows("SELECT * FROM customers ORDER BY name")


@app.post("/api/customers")
def add_customer(c: CustomerIn):
    cid = db.execute("INSERT INTO customers (name, address, email, phone) VALUES (?,?,?,?)",
                     (c.name, c.address, c.email, c.phone))
    return db.one("SELECT * FROM customers WHERE id = ?", (cid,))


@app.put("/api/customers/{cid}")
def update_customer(cid: int, c: CustomerIn):
    db.execute("UPDATE customers SET name=?, address=?, email=?, phone=? WHERE id=?",
               (c.name, c.address, c.email, c.phone, cid))
    return db.one("SELECT * FROM customers WHERE id = ?", (cid,))


# ---------------------------------------------------------------- drafting
@app.post("/api/draft")
def make_draft(d: DraftIn):
    return drafting.draft(d.text, list_prices())


# ---------------------------------------------------------------- documents
def _load(doc_id: int) -> dict:
    d = db.one("SELECT * FROM documents WHERE id = ?", (doc_id,))
    if not d:
        raise HTTPException(404, "Dokument nicht gefunden")
    d["items"] = json.loads(d["items"])
    d["totals"] = pdf.totals(d["items"], db.get_settings())
    return d


@app.get("/api/documents")
def list_documents(kind: str | None = None):
    sql = ("SELECT d.*, c.name AS customer_name FROM documents d LEFT JOIN customers c ON c.id = d.customer_id"
           + (" WHERE d.kind = ?" if kind else "") + " ORDER BY d.id DESC")
    out = db.rows(sql, (kind,) if kind else ())
    s = db.get_settings()
    for d in out:
        d["items"] = json.loads(d["items"])
        d["totals"] = pdf.totals(d["items"], s)
    return out


@app.get("/api/documents/{doc_id}")
def get_document(doc_id: int):
    return _load(doc_id)


@app.post("/api/quotes")
def create_quote(d: DocIn):
    if not d.items:
        raise HTTPException(400, "Mindestens eine Position nötig")
    s = db.get_settings()
    day = date.fromisoformat(d.date) if d.date else date.today()
    number = db.next_number("quote", day.year)
    did = db.execute(
        "INSERT INTO documents (kind, number, customer_id, date, due_date, title, intro, items) VALUES ('quote',?,?,?,?,?,?,?)",
        (number, d.customer_id, day.isoformat(), (day + timedelta(days=int(s["quote_valid_days"]))).isoformat(),
         d.title, d.intro, json.dumps([i.model_dump() for i in d.items], ensure_ascii=False)))
    return _load(did)


@app.put("/api/documents/{doc_id}")
def update_document(doc_id: int, d: DocIn):
    cur = _load(doc_id)
    if cur["kind"] == "invoice" and cur["status"] != "entwurf":
        raise HTTPException(409, "Versendete Rechnungen dürfen nicht geändert werden – bitte stornieren und neu erstellen.")
    db.execute("UPDATE documents SET customer_id=?, title=?, intro=?, items=?, service_date=? WHERE id=?",
               (d.customer_id, d.title, d.intro, json.dumps([i.model_dump() for i in d.items], ensure_ascii=False),
                d.service_date or cur.get("service_date", ""), doc_id))
    return _load(doc_id)


@app.post("/api/documents/{doc_id}/invoice")
def quote_to_invoice(doc_id: int, service_date: str | None = None):
    q = _load(doc_id)
    if q["kind"] != "quote":
        raise HTTPException(400, "Nur Angebote können in Rechnungen umgewandelt werden")
    existing = db.one("SELECT id FROM documents WHERE source_id = ? AND kind = 'invoice'", (doc_id,))
    if existing:
        return _load(existing["id"])
    s = db.get_settings()
    today = date.today()
    number = db.next_number("invoice", today.year)
    did = db.execute(
        "INSERT INTO documents (kind, number, customer_id, date, service_date, due_date, title, intro, items, source_id) "
        "VALUES ('invoice',?,?,?,?,?,?,?,?,?)",
        (number, q["customer_id"], today.isoformat(), service_date or today.isoformat(),
         (today + timedelta(days=int(s["payment_days"]))).isoformat(), q["title"], "",
         json.dumps(q["items"], ensure_ascii=False), doc_id))
    db.execute("UPDATE documents SET status = 'angenommen' WHERE id = ?", (doc_id,))
    return _load(did)


VALID_STATUS = {"quote": {"entwurf", "versendet", "angenommen", "abgelehnt"},
                "invoice": {"entwurf", "versendet", "bezahlt", "storniert"}}


@app.post("/api/documents/{doc_id}/status")
def set_status(doc_id: int, st: StatusIn):
    d = _load(doc_id)
    if st.status not in VALID_STATUS[d["kind"]]:
        raise HTTPException(400, f"Status muss einer von {sorted(VALID_STATUS[d['kind']])} sein")
    db.execute("UPDATE documents SET status = ? WHERE id = ?", (st.status, doc_id))
    return _load(doc_id)


@app.delete("/api/documents/{doc_id}")
def delete_document(doc_id: int):
    d = _load(doc_id)
    if d["kind"] == "invoice":
        raise HTTPException(409, "Rechnungen werden nicht gelöscht (lückenlose Nummerierung) – Status 'storniert' setzen.")
    db.execute("UPDATE documents SET source_id = NULL WHERE source_id = ?", (doc_id,))
    db.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    return {"ok": True}


@app.get("/api/documents/{doc_id}/pdf")
def document_pdf(doc_id: int):
    d = _load(doc_id)
    cust = db.one("SELECT * FROM customers WHERE id = ?", (d["customer_id"],)) if d["customer_id"] else None
    data = pdf.render(d, cust, db.get_settings())
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{d["number"]}.pdf"'})


@app.get("/api/dashboard")
def dashboard():
    docs = list_documents()
    year = str(date.today().year)
    inv = [d for d in docs if d["kind"] == "invoice" and d["date"].startswith(year) and d["status"] != "storniert"]
    quotes = [d for d in docs if d["kind"] == "quote"]
    decided = [q for q in quotes if q["status"] in ("angenommen", "abgelehnt")]
    return {
        "revenue_paid": round(sum(d["totals"]["gross"] for d in inv if d["status"] == "bezahlt"), 2),
        "open_amount": round(sum(d["totals"]["gross"] for d in inv if d["status"] in ("entwurf", "versendet")), 2),
        "overdue": [d["number"] for d in inv if d["status"] == "versendet" and d["due_date"] and d["due_date"] < date.today().isoformat()],
        "quotes_open": sum(1 for q in quotes if q["status"] in ("entwurf", "versendet")),
        "win_rate": round(100 * sum(1 for q in decided if q["status"] == "angenommen") / len(decided)) if decided else None,
    }


app.mount("/", StaticFiles(directory=ROOT / "static", html=True), name="static")

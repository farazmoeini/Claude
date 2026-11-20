"""PDF rendering for quotes and invoices (DIN-5008-like layout, A4)."""
from __future__ import annotations

from datetime import date
from pathlib import Path

from fpdf import FPDF

FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")


def eur(x: float) -> str:
    s = f"{x:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{s} €"


def qty_fmt(q: float) -> str:
    return (f"{q:,.2f}".rstrip("0").rstrip(".") if q != int(q) else f"{int(q)}").replace(".", ",")


def de_date(iso: str) -> str:
    try:
        return date.fromisoformat(iso).strftime("%d.%m.%Y")
    except Exception:
        return iso or ""


def totals(items: list[dict], s: dict) -> dict:
    net = round(sum(round(float(i["qty"]) * float(i["price"]), 2) for i in items), 2)
    rate = 0.0 if s.get("kleinunternehmer") else float(s.get("vat_rate", 19))
    vat = round(net * rate / 100, 2)
    return {"net": net, "rate": rate, "vat": vat, "gross": round(net + vat, 2)}


class Doc(FPDF):
    def __init__(self, s: dict):
        super().__init__(format="A4", unit="mm")
        self.s = s
        regular = FONT_DIR / "DejaVuSans.ttf"
        bold = FONT_DIR / "DejaVuSans-Bold.ttf"
        if regular.exists():
            self.add_font("Body", "", str(regular))
            self.add_font("Body", "B", str(bold if bold.exists() else regular))
            self.f = "Body"
        else:  # core font fallback (no € glyph issues on Latin-1)
            self.f = "Helvetica"
        self.set_auto_page_break(True, margin=32)
        self.set_margins(25, 20, 20)

    def footer(self):
        s = self.s
        self.set_y(-28)
        self.set_draw_color(200, 200, 200)
        self.line(25, self.get_y(), 190, self.get_y())
        self.set_font(self.f, "", 7.5)
        self.set_text_color(90, 90, 90)
        col = 55
        y = self.get_y() + 2
        blocks = [
            f"{s['company']}\n{s['street']}\n{s['city']}",
            f"Tel. {s['phone']}\n{s['email']}\nInhaber/GF: {s['owner']}",
            f"{s['bank']}\nIBAN {s['iban']}\n" + (f"USt-IdNr. {s['vat_id']}" if s.get("vat_id") else f"St.-Nr. {s['tax_number']}"),
        ]
        for k, b in enumerate(blocks):
            self.set_xy(25 + k * col, y)
            self.multi_cell(col - 3, 3.6, b)
        self.set_xy(170, y + 11)
        self.cell(20, 4, f"Seite {self.page_no()}/{{nb}}", align="R")
        self.set_text_color(0, 0, 0)


def render(doc: dict, customer: dict | None, s: dict) -> bytes:
    items = doc["items"]
    t = totals(items, s)
    is_inv = doc["kind"] == "invoice"
    p = Doc(s)
    p.alias_nb_pages()
    p.add_page()

    # sender line + company block
    p.set_font(p.f, "B", 15)
    p.set_xy(110, 20)
    p.cell(80, 8, s["company"], align="R")
    p.set_font(p.f, "", 8.5)
    p.set_xy(110, 28)
    p.multi_cell(80, 4.2, f"{s['street']}\n{s['city']}\n{s['phone']}\n{s['email']}", align="R")

    # address window (DIN 5008 B: 45 mm from top)
    p.set_xy(25, 45)
    p.set_font(p.f, "", 7)
    p.set_text_color(110, 110, 110)
    p.cell(85, 4, f"{s['company']} · {s['street']} · {s['city']}")
    p.set_text_color(0, 0, 0)
    p.set_font(p.f, "", 10.5)
    p.set_xy(25, 51)
    if customer:
        p.multi_cell(85, 5, f"{customer['name']}\n{customer.get('address', '')}")

    # meta box
    meta = [("Datum", de_date(doc["date"])), ("Nummer", doc["number"])]
    if is_inv:
        if doc.get("service_date"):
            meta.append(("Leistungsdatum", de_date(doc["service_date"])))
        if doc.get("due_date"):
            meta.append(("Zahlbar bis", de_date(doc["due_date"])))
    else:
        meta.append(("Gültig bis", de_date(doc.get("due_date", ""))))
    if customer:
        meta.append(("Kunden-Nr.", f"K-{customer['id']:04d}"))
    p.set_font(p.f, "", 9)
    y = 51
    for k, v in meta:
        p.set_xy(125, y)
        p.cell(30, 5, k + ":")
        p.cell(35, 5, v, align="R")
        y += 5

    # title + intro
    p.set_xy(25, 95)
    p.set_font(p.f, "B", 14)
    p.cell(0, 8, ("Rechnung " if is_inv else "Angebot ") + doc["number"])
    p.ln(9)
    p.set_font(p.f, "", 10)
    if doc.get("title"):
        p.set_font(p.f, "B", 10)
        p.multi_cell(0, 5, doc["title"], new_x="LMARGIN", new_y="NEXT")
        p.set_font(p.f, "", 10)
    intro = doc.get("intro") or (
        "für die ausgeführten Arbeiten erlauben wir uns, wie folgt zu berechnen:" if is_inv
        else "vielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen folgende Leistungen an:")
    p.multi_cell(0, 5, ("Sehr geehrte Damen und Herren,\n\n" if not customer else f"Guten Tag {customer['name']},\n\n") + intro, new_x="LMARGIN", new_y="NEXT")
    p.ln(4)

    # items table
    cols = [("Pos.", 11, "L"), ("Leistung", 82, "L"), ("Menge", 18, "R"), ("Einh.", 14, "L"), ("EP netto", 20, "R"), ("GP netto", 20, "R")]

    def head():
        p.set_font(p.f, "B", 8.5)
        p.set_fill_color(240, 241, 245)
        for name, w, al in cols:
            p.cell(w, 7, name, align=al, fill=True)
        p.ln()

    head()
    p.set_font(p.f, "", 9)
    for n, it in enumerate(items, 1):
        desc = it["description"] + (f"\n{it['note']}" if it.get("note") else "")
        lines = p.multi_cell(cols[1][1], 4.6, desc, dry_run=True, output="LINES")
        h = max(6.0, 4.6 * len(lines) + 1.4)
        if p.get_y() + h > p.h - 36:
            p.add_page()
            head()
            p.set_font(p.f, "", 9)
        x0, y0 = p.get_x(), p.get_y()
        p.cell(cols[0][1], h, str(n))
        p.set_xy(x0 + cols[0][1], y0 + 0.7)
        p.multi_cell(cols[1][1], 4.6, desc)
        p.set_xy(x0 + cols[0][1] + cols[1][1], y0)
        gp = round(float(it["qty"]) * float(it["price"]), 2)
        for val, (_, w, al) in zip([qty_fmt(float(it["qty"])), it["unit"], eur(float(it["price"])), eur(gp)], cols[2:]):
            p.cell(w, h, val, align=al)
        p.ln(h)
        p.set_draw_color(225, 225, 230)
        p.line(25, p.get_y(), 190, p.get_y())

    # totals
    p.ln(3)
    if p.get_y() > p.h - 70:
        p.add_page()
    p.set_font(p.f, "", 10)
    rows = [("Summe netto", eur(t["net"]))]
    if not s.get("kleinunternehmer"):
        rows.append((f"zzgl. {qty_fmt(t['rate'])} % USt.", eur(t["vat"])))
    for k, v in rows:
        p.set_x(120)
        p.cell(45, 6, k)
        p.cell(25, 6, v, align="R")
        p.ln()
    p.set_font(p.f, "B", 11)
    p.set_x(120)
    p.cell(45, 8, "Gesamtbetrag" if not s.get("kleinunternehmer") else "Gesamtbetrag (netto = brutto)")
    p.cell(25, 8, eur(t["gross"]), align="R")
    p.ln(12)

    # closing text
    p.set_font(p.f, "", 9.5)
    notes = []
    if s.get("kleinunternehmer"):
        notes.append("Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.")
    if is_inv:
        notes.append(f"Bitte überweisen Sie den Betrag bis zum {de_date(doc.get('due_date', ''))} "
                     f"unter Angabe der Rechnungsnummer {doc['number']} auf das unten genannte Konto.")
        notes.append("Bei Leistungen an Privatpersonen: Bitte bewahren Sie diese Rechnung zwei Jahre lang auf (§ 14b UStG).")
    else:
        notes.append(f"Dieses Angebot ist gültig bis {de_date(doc.get('due_date', ''))}. "
                     "Mengen sind nach Aufmaß abzurechnen. Wir freuen uns auf Ihren Auftrag.")
        notes.append("Lohnanteil für die Steuerermäßigung nach § 35a EStG weisen wir in der Rechnung gerne gesondert aus.")
    if s.get("footer"):
        notes.append(s["footer"])
    p.multi_cell(0, 5, "\n".join(notes), new_x="LMARGIN", new_y="NEXT")
    p.ln(6)
    p.cell(0, 5, "Mit freundlichen Grüßen")
    p.ln(5)
    p.cell(0, 5, s["owner"])
    return bytes(p.output())

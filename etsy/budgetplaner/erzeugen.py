"""Erzeugt den druckbaren Budgetplaner (A4, deutsch) als PDF."""
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pathlib import Path

F = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("Sans", F + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("SansB", F + "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Serif", F + "DejaVuSerif.ttf"))
pdfmetrics.registerFont(TTFont("SerifB", F + "DejaVuSerif-Bold.ttf"))

W, H = A4
M = 40  # Rand
SALBEI = HexColor("#7D9B84")
SALBEI_HELL = HexColor("#E6EEE7")
CREME = HexColor("#FAF7F2")
TEXT = HexColor("#2F3A33")
LINIE = HexColor("#B9C7BC")
GRAU = HexColor("#6B746E")

MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli",
          "August", "September", "Oktober", "November", "Dezember"]

c = canvas.Canvas(str(Path(__file__).with_name("Budgetplaner_A4.pdf")), pagesize=A4)
c.setTitle("Budgetplaner – undatiert")
c.setAuthor("Budgetplaner")


def seite(titel, untertitel=""):
    c.setFillColor(CREME)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    c.setFillColor(SALBEI)
    c.rect(0, H - 8, W, 8, stroke=0, fill=1)
    c.setFillColor(TEXT)
    c.setFont("SerifB", 26)
    c.drawString(M, H - 60, titel)
    if untertitel:
        c.setFont("Sans", 10)
        c.setFillColor(GRAU)
        c.drawString(M, H - 78, untertitel)
    return H - 100


def ende():
    c.setFont("Sans", 7)
    c.setFillColor(GRAU)
    c.drawCentredString(W / 2, 20, "Nur zur persönlichen Nutzung")
    c.showPage()


def kopf(x, y, w, text, h=20):
    c.setFillColor(SALBEI)
    c.roundRect(x, y - h, w, h, 4, stroke=0, fill=1)
    c.setFillColor(HexColor("#FFFFFF"))
    c.setFont("SansB", 9.5)
    c.drawString(x + 8, y - h + 6.5, text.upper())
    return y - h


def tabelle(x, y, spalten, zeilen, zh=19, titel=None, summe=False):
    """spalten: Liste (Name, Breite). Gibt neue y-Position zurück."""
    gesamt = sum(b for _, b in spalten)
    if titel:
        y = kopf(x, y, gesamt, titel) - 2
    c.setFillColor(SALBEI_HELL)
    c.rect(x, y - zh, gesamt, zh, stroke=0, fill=1)
    c.setFillColor(TEXT)
    c.setFont("SansB", 8)
    cx = x
    for name, b in spalten:
        c.drawString(cx + 5, y - zh + 6, name)
        cx += b
    y -= zh
    c.setStrokeColor(LINIE)
    c.setLineWidth(0.6)
    for _ in range(zeilen):
        y -= zh
        c.line(x, y, x + gesamt, y)
    if summe:
        y -= zh
        c.setFillColor(SALBEI_HELL)
        c.rect(x, y, gesamt, zh, stroke=0, fill=1)
        c.setFillColor(TEXT)
        c.setFont("SansB", 8.5)
        c.drawString(x + 5, y + 6, "SUMME")
    cx = x
    c.setStrokeColor(LINIE)
    for _, b in spalten[:-1]:
        cx += b
        c.line(cx, y, cx, y + (zeilen + 1 + (1 if summe else 0)) * zh)
    c.rect(x, y, gesamt, (zeilen + 1 + (1 if summe else 0)) * zh, stroke=1, fill=0)
    return y


def feld(x, y, w, label, h=34):
    c.setStrokeColor(LINIE)
    c.setFillColor(HexColor("#FFFFFF"))
    c.roundRect(x, y - h, w, h, 5, stroke=1, fill=1)
    c.setFillColor(GRAU)
    c.setFont("Sans", 7.5)
    c.drawString(x + 7, y - 11, label.upper())


def kaestchen(x, y, s=8):
    c.setStrokeColor(SALBEI)
    c.setLineWidth(0.9)
    c.rect(x, y, s, s, stroke=1, fill=0)


def linien(x, y, w, n, abstand=20):
    c.setStrokeColor(LINIE)
    c.setLineWidth(0.6)
    for _ in range(n):
        y -= abstand
        c.line(x, y, x + w, y)
    return y


# ---------- Deckblatt ----------
c.setFillColor(CREME)
c.rect(0, 0, W, H, stroke=0, fill=1)
c.setFillColor(SALBEI_HELL)
c.circle(W / 2, H / 2 + 60, 190, stroke=0, fill=1)
c.setFillColor(SALBEI)
c.circle(W - 60, 80, 120, stroke=0, fill=1)
c.circle(40, H - 30, 80, stroke=0, fill=1)
c.setFillColor(TEXT)
c.setFont("SerifB", 52)
c.drawCentredString(W / 2, H / 2 + 90, "Budget")
c.drawCentredString(W / 2, H / 2 + 30, "Planer")
c.setFont("Sans", 12)
c.setFillColor(GRAU)
c.drawCentredString(W / 2, H / 2 - 10, "undatiert · für jedes Jahr nutzbar")
c.setStrokeColor(TEXT)
c.setLineWidth(0.8)
c.setFont("Sans", 10)
c.setFillColor(TEXT)
c.drawString(W / 2 - 110, H / 2 - 90, "Jahr:")
c.line(W / 2 - 75, H / 2 - 92, W / 2 + 110, H / 2 - 92)
c.drawString(W / 2 - 110, H / 2 - 120, "Name:")
c.line(W / 2 - 70, H / 2 - 122, W / 2 + 110, H / 2 - 122)
c.showPage()

# ---------- Inhaltsverzeichnis ----------
y = seite("Inhalt", "So nutzt Ihr diesen Planer")
inhalt = [
    ("Finanzziele des Jahres", "Wofür spare ich? Was will ich erreichen?"),
    ("Jahresübersicht", "Einnahmen, Ausgaben und Ersparnis pro Monat"),
    ("Monatsbudget ×12", "Einnahmen, Fixkosten, variable Kosten, Sparen"),
    ("Ausgaben-Tracker ×12", "Jede Ausgabe notieren – kein Euro geht verloren"),
    ("Rechnungs-Checkliste", "Alle wiederkehrenden Zahlungen auf einen Blick"),
    ("Sparziel-Tracker", "Zum Ausmalen: 100 Felder bis zum Ziel"),
    ("Schuldenabbau", "Restbetrag, Raten und Fortschritt"),
    ("No-Spend-Challenge", "30 Tage ohne unnötige Ausgaben"),
    ("Notizen", ""),
]
for i, (t, d) in enumerate(inhalt, 1):
    y -= 42
    c.setFillColor(SALBEI)
    c.circle(M + 12, y + 4, 12, stroke=0, fill=1)
    c.setFillColor(HexColor("#FFFFFF"))
    c.setFont("SansB", 10)
    c.drawCentredString(M + 12, y + 0.5, str(i))
    c.setFillColor(TEXT)
    c.setFont("SansB", 12)
    c.drawString(M + 36, y + 6, t)
    c.setFont("Sans", 9)
    c.setFillColor(GRAU)
    c.drawString(M + 36, y - 8, d)
y -= 60
kopf(M, y, W - 2 * M, "Tipp")
c.setFont("Sans", 9.5)
c.setFillColor(TEXT)
for i, z in enumerate([
    "Druckt nur die Seiten, die Ihr braucht – oder nutzt die PDF digital in",
    "GoodNotes, Notability oder Xodo. Monatsseiten einfach mehrfach drucken.",
]):
    c.drawString(M + 4, y - 38 - i * 14, z)
ende()

# ---------- Finanzziele ----------
y = seite("Finanzziele", "Was soll dieses Jahr finanziell passieren?")
bw = (W - 2 * M - 16) / 2
for i, t in enumerate(["Kurzfristig (bis 3 Monate)", "Mittelfristig (bis 12 Monate)"]):
    x = M + i * (bw + 16)
    yy = kopf(x, y, bw, t)
    for k in range(6):
        kaestchen(x + 4, yy - 22 - k * 24)
        c.setStrokeColor(LINIE)
        c.line(x + 18, yy - 22 - k * 24, x + bw, yy - 22 - k * 24)
y -= 190
yy = kopf(M, y, W - 2 * M, "Langfristig (Jahre)")
linien(M, yy, W - 2 * M, 4, 24)
y = yy - 130
y = tabelle(M, y, [("Sparziel", 200), ("Zielbetrag", 105), ("Bis wann", 105), ("Erreicht ✓", W - 2 * M - 410)],
            8, titel="Meine Sparziele")
y -= 24
yy = kopf(M, y, W - 2 * M, "Warum ist mir das wichtig?")
linien(M, yy, W - 2 * M, 4, 22)
ende()

# ---------- Jahresübersicht ----------
y = seite("Jahresübersicht", "Monatswerte am Ende jedes Monats eintragen")
sp = [("Monat", 110), ("Einnahmen", 105), ("Ausgaben", 105), ("Gespart", 95), ("Differenz", W - 2 * M - 415)]
x = M
gesamt = sum(b for _, b in sp)
c.setFillColor(SALBEI)
c.rect(x, y - 22, gesamt, 22, stroke=0, fill=1)
c.setFillColor(HexColor("#FFFFFF"))
c.setFont("SansB", 9)
cx = x
for n, b in sp:
    c.drawString(cx + 6, y - 15, n.upper())
    cx += b
y -= 22
zh = 34
for i, mo in enumerate(MONATE + ["Gesamt"]):
    if i % 2 == 0 or mo == "Gesamt":
        c.setFillColor(SALBEI_HELL if mo == "Gesamt" else HexColor("#FFFFFF"))
        c.rect(x, y - zh, gesamt, zh, stroke=0, fill=1)
    c.setFillColor(TEXT)
    c.setFont("SansB" if mo == "Gesamt" else "Sans", 10)
    c.drawString(x + 6, y - zh + 13, mo)
    y -= zh
    c.setStrokeColor(LINIE)
    c.line(x, y, x + gesamt, y)
cx = x
for _, b in sp[:-1]:
    cx += b
    c.line(cx, y, cx, y + zh * 13)
c.rect(x, y, gesamt, zh * 13, stroke=1, fill=0)
ende()

# ---------- Monatsseiten ----------
for mo in MONATE:
    # Monatsbudget
    y = seite(f"Budget · {mo}", "Plan zu Monatsbeginn, Ist-Werte am Monatsende")
    fw = (W - 2 * M - 24) / 4
    for i, t in enumerate(["Einnahmen gesamt", "Ausgaben gesamt", "Gespart", "Übrig"]):
        feld(M + i * (fw + 8), y, fw, t, 44)
    y -= 62
    bw = (W - 2 * M - 14) / 2
    s3 = [("Posten", bw - 120), ("Plan", 60), ("Ist", 60)]
    yl = tabelle(M, y, s3, 5, titel="Einnahmen", summe=True)
    yr = tabelle(M + bw + 14, y, s3, 5, titel="Sparen & Rücklagen", summe=True)
    y = min(yl, yr) - 16
    yl = tabelle(M, y, s3, 11, titel="Fixkosten", summe=True)
    yr = tabelle(M + bw + 14, y, s3, 11, titel="Variable Kosten", summe=True)
    y = min(yl, yr) - 16
    yy = kopf(M, y, W - 2 * M, "Rückblick: Was lief gut? Was ändere ich?")
    linien(M, yy, W - 2 * M, 3, 20)
    ende()

    # Ausgaben-Tracker
    y = seite(f"Ausgaben · {mo}", "Jede Ausgabe sofort eintragen")
    tabelle(M, y, [("Datum", 60), ("Beschreibung", 210), ("Kategorie", 120), ("Betrag", W - 2 * M - 390)],
            30, zh=21.5, summe=True)
    ende()

# ---------- Rechnungs-Checkliste ----------
y = seite("Rechnungs-Checkliste", "Wiederkehrende Zahlungen – abhaken, wenn bezahlt")
x0 = M
namew, betw = 130, 52
mw = (W - 2 * M - namew - betw) / 12
c.setFillColor(SALBEI)
c.rect(x0, y - 22, W - 2 * M, 22, stroke=0, fill=1)
c.setFillColor(HexColor("#FFFFFF"))
c.setFont("SansB", 8)
c.drawString(x0 + 5, y - 15, "RECHNUNG")
c.drawString(x0 + namew + 5, y - 15, "BETRAG")
for i, mo in enumerate(MONATE):
    c.drawCentredString(x0 + namew + betw + mw * i + mw / 2, y - 15, mo[:3].upper())
y -= 22
zh = 27
for r in range(24):
    y -= zh
    c.setStrokeColor(LINIE)
    c.line(x0, y, W - M, y)
    for i in range(12):
        kaestchen(x0 + namew + betw + mw * i + mw / 2 - 5, y + zh / 2 - 5, 10)
c.line(x0 + namew, y, x0 + namew, y + zh * 24)
c.line(x0 + namew + betw, y, x0 + namew + betw, y + zh * 24)
c.rect(x0, y, W - 2 * M, zh * 24, stroke=1, fill=0)
ende()

# ---------- Sparziel-Tracker (2 Stück) ----------
for _ in range(2):
    y = seite("Sparziel-Tracker", "Für jeden gesparten Betrag ein Feld ausmalen")
    fw = (W - 2 * M - 16) / 3
    for i, t in enumerate(["Mein Ziel", "Zielbetrag", "Pro Feld (Betrag / 100)"]):
        feld(M + i * (fw + 8), y, fw, t, 44)
    y -= 70
    n = 10
    s = (W - 2 * M - 9 * 8) / n
    for r in range(n):
        for k in range(n):
            cx = M + k * (s + 8) + s / 2
            cy = y - r * (s + 8) - s / 2
            c.setStrokeColor(SALBEI)
            c.setLineWidth(1)
            c.circle(cx, cy, s / 2, stroke=1, fill=0)
            c.setFillColor(LINIE)
            c.setFont("Sans", 7)
            c.drawCentredString(cx, cy - 2.5, str(r * n + k + 1))
    y -= n * (s + 8) + 10
    feld(M, y, (W - 2 * M - 8) / 2, "Gestartet am", 40)
    feld(M + (W - 2 * M + 8) / 2, y, (W - 2 * M - 8) / 2, "Erreicht am", 40)
    ende()

# ---------- Schuldenabbau ----------
y = seite("Schuldenabbau", "Kleinste Schuld zuerst (Schneeball) oder höchster Zins zuerst (Lawine)")
y = tabelle(M, y, [("Gläubiger", 150), ("Restbetrag", 90), ("Zins %", 65), ("Mindestrate", 90),
                   ("Ziel bis", W - 2 * M - 395)], 6, titel="Übersicht meiner Schulden", summe=True)
y -= 22
tabelle(M, y, [("Datum", 75), ("Gläubiger", 155), ("Gezahlt", 95), ("Neuer Restbetrag", W - 2 * M - 325)],
        19, titel="Zahlungsverlauf")
ende()

# ---------- No-Spend-Challenge ----------
y = seite("No-Spend-Challenge", "30 Tage: Feld abhaken für jeden Tag ohne unnötige Ausgabe")
feld(M, y, (W - 2 * M - 8) / 2, "Start-Datum", 40)
feld(M + (W - 2 * M + 8) / 2, y, (W - 2 * M - 8) / 2, "Belohnung am Ende", 40)
y -= 62
cols, rows = 6, 5
gap = 10
bw = (W - 2 * M - (cols - 1) * gap) / cols
bh = 62
for r in range(rows):
    for k in range(cols):
        x = M + k * (bw + gap)
        yy = y - r * (bh + gap)
        c.setFillColor(HexColor("#FFFFFF"))
        c.setStrokeColor(LINIE)
        c.roundRect(x, yy - bh, bw, bh, 6, stroke=1, fill=1)
        c.setFillColor(SALBEI)
        c.setFont("SerifB", 15)
        c.drawString(x + 8, yy - 22, str(r * cols + k + 1))
y -= rows * (bh + gap) + 10
bw2 = (W - 2 * M - 14) / 2
for i, t in enumerate(["Erlaubt (Miete, Lebensmittel …)", "Nicht erlaubt (Takeaway, Shopping …)"]):
    x = M + i * (bw2 + 14)
    yy = kopf(x, y, bw2, t)
    linien(x, yy, bw2, 6, 20)
ende()

# ---------- Notizen ----------
for _ in range(2):
    y = seite("Notizen")
    linien(M, y, W - 2 * M, 33, 21)
    ende()

c.save()
print("fertig")

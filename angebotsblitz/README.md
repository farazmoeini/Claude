# AngebotsBlitz: Angebote und Rechnungen für Handwerker in 60 Sekunden

Der Handwerker steht beim Kunden und diktiert: „Bad 3 x 2,5 m, alte Fliesen raus,
Abdichtung Dusche, Bodenfliesen, Wandfliesen 18 m², WC neu, Silikon“. Daraus werden
fertige Angebotspositionen aus der **eigenen Preisliste**, ein PDF-Angebot und nach
dem Auftrag mit einem Klick die Rechnung.

## Funktionen

| Funktion | Details |
|---|---|
| **Freitext oder Diktat zu Positionen** | Mit `ANTHROPIC_API_KEY` versteht Claude den Auftrag, ordnet die Preisliste zu, leitet Mengen ab und markiert geschätzte Preise. Ohne Key arbeitet eine kostenlose Regel-Engine: erkennt Raummaße („3 x 2,5 m“ → 7,5 m² Boden und 11 lfm Umfang), Mengen und Einheiten (m², qm, lfm, Stk, Std), Dezimalkomma, Fliesenformate wie 60x60 |
| **Diktieren** | Spracheingabe im Browser (Chrome, Safari, Edge) |
| **Angebot als PDF** | Briefbogen mit Anschriftfeld nach DIN 5008, Positionstabelle, Netto, USt. und Brutto, Gültigkeit, Hinweis auf § 35a EStG |
| **Rechnung mit einem Klick** | Übernimmt alle Positionen. Fortlaufende Nummern pro Jahr (R-2026-0001), Leistungsdatum, Zahlungsziel, Steuernummer bzw. USt-IdNr., Aufbewahrungshinweis nach § 14b UStG |
| **Schutz vor Fehlern (GoBD)** | Versendete Rechnungen lassen sich nicht mehr ändern, Rechnungen nicht löschen (nur stornieren), die Nummern bleiben lückenlos |
| **Kleinunternehmer** | Schalter für § 19 UStG: keine USt. ausweisen, Pflichthinweis im PDF |
| **Dashboard** | Bezahlter Umsatz im Jahr, offene und überfällige Rechnungen, offene Angebote, Auftragsquote |
| **Preisliste** | Direkt in der Tabelle bearbeiten, Stichwörter für die Zuordnung, CSV-Import (`name;unit;price;category;keywords`) |
| **Kunden** | Verwaltung mit Kundennummer im Dokument |

## Starten

```bash
cd angebotsblitz
pip install -r requirements.txt
uvicorn app:app --port 8200          # http://localhost:8200
python -m pytest -q                  # Tests
```

Die Daten liegen in `data/angebotsblitz.db` (SQLite). Beim ersten Start wird eine
**Beispiel-Preisliste** für Fliesen und Bad angelegt. Die Preise sind Platzhalter.
Firmendaten unter „Einstellungen“ eintragen.

## Rechtlicher Hinweis

Das PDF enthält die üblichen Pflichtangaben nach § 14 UStG. Der Prototyp ersetzt aber
keine geprüfte, GoBD-zertifizierte Buchhaltungssoftware und keine Steuerberatung.
Vor dem Verkauf prüfen lassen und an E-Rechnung anbinden (XRechnung/ZUGFeRD,
Pflicht im B2B-Bereich seit 2025 bzw. 2027/28).

## Weg zum Geld

- **Zielgruppe:** Solo-Selbstständige und kleine Betriebe (1–5 Personen) in Fliesen, Maler, Sanitär, Elektro, Trockenbau
- **Preis:** 19–39 €/Monat. Ein gespartes Angebot pro Woche (1–2 Stunden) rechnet sich sofort
- **Nächste Schritte:**
  1. Accounts für mehrere Betriebe (Multi-Tenant) und Stripe-Abo
  2. E-Rechnung im ZUGFeRD- oder XRechnung-Format
  3. Angebot per E-Mail mit Online-Annahme („Auftrag erteilen“-Button)
  4. Fotos und Aufmaß vom Handy anhängen
  5. Fertige Preislisten-Vorlagen je Gewerk
  6. Vertrieb über Innungen, Facebook-Gruppen für Handwerker und Großhändler

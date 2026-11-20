# PrüfFit: Lern-App für Prüfungsvorbereitung

Eine Web-App, die offline läuft und sich wie eine App aufs Handy installieren lässt
(PWA). Die Lern-Engine ist von der Nische unabhängig: Man tauscht nur den
Fragenkatalog aus (§34a, Sportboot, Fischereischein, AEVO …). Als Beispiel ist ein
eigener Katalog mit 33 Fragen zum Erste-Hilfe-Grundwissen enthalten.

## Funktionen

| Funktion | Details |
|---|---|
| **Lernen** | Wiederholung im wachsenden Abstand (SM-2-Algorithmus): fällige Karten zuerst, dann neue, 15 pro Runde. Falsche Antworten kommen in derselben Runde einmal wieder |
| **Prüfung simulieren** | Zufällige Fragen, Countdown, Auswertung nach Bestehensgrenze, alle Fehler mit Erklärung |
| **Fehler üben** | Nur die Fragen, die zuletzt falsch beantwortet wurden |
| **Prüfungsreife in %** | Eine Frage gilt als sicher, wenn sie dreimal in Folge mit wachsendem Abstand richtig beantwortet wurde. Auswertung pro Themengebiet |
| **Mehrfachauswahl** | Fragen mit einer oder mehreren richtigen Antworten, Reihenfolge der Antworten jedes Mal gemischt |
| **Offline und installierbar** | Service Worker und Manifest. Der Fortschritt bleibt auf dem Gerät (localStorage) |
| **Katalog-Import** | Eigene JSON-Kataloge direkt in der App laden |
| **Katalog-Generator** | `tools/generate_catalog.py` erstellt mit Claude Fragen und Erklärungen aus einem PDF- oder Text-Skript |

## Starten

```bash
cd lernapp
python3 -m http.server 8101        # http://localhost:8101 öffnen
```

Kein Build-Schritt, keine Abhängigkeiten. Zum Veröffentlichen den Ordner auf ein
statisches Hosting legen, z. B. GitHub Pages, Netlify oder Cloudflare Pages.

## Neuen Katalog erzeugen

```bash
pip install anthropic pydantic
export ANTHROPIC_API_KEY=...
python lernapp/tools/generate_catalog.py mein-skript.pdf --id sportboot --title "Sportbootführerschein See" -n 60
```

Die Datei landet in `catalogs/sportboot.json` und wird automatisch in `catalogs/index.json` eingetragen.
**Jede Frage vor dem Verkauf prüfen.** Nur Material verwenden, an dem du die Rechte hast.
Amtliche Fragenkataloge sind teilweise frei, teilweise geschützt.

## Katalog-Format

```json
{
  "id": "sportboot",
  "title": "Sportbootführerschein See",
  "exam": { "questions": 30, "minutes": 60, "pass_percent": 80 },
  "questions": [
    { "id": "sb001", "topic": "Navigation", "q": "Frage …?",
      "options": ["A", "B", "C", "D"], "correct": [1], "explanation": "Weil …" }
  ]
}
```

`correct` enthält die 0-basierten Positionen der richtigen Antworten, auch mehrere.

## Weg zum Geld

1. **Nische wählen:** eine Prüfung mit vielen Teilnehmern pro Jahr und schwachen
   bestehenden Apps (App-Store-Bewertungen lesen!)
2. **Katalog erstellen:** mit dem Generator und einer fachlichen Prüfung
3. **Bezahlen:** einige Fragen kostenlos, die Vollversion einmalig für 9–19 € (z. B. Stripe
   Payment Link mit Lizenzcode oder Login)
4. **In die Stores:** mit Capacitor oder TWA (Trusted Web Activity) wird die PWA zu einer App
   für Android und iOS
5. **Marketing:** TikTok und Shorts mit „Diese Frage fällt in der Prüfung durch 60 % durch“.
   Die Clips dafür lassen sich mit StreamCut schneiden

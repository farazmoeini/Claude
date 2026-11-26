# Overload (früher Satzbuch): Trainingstagebuch fürs Handy

Übungen, Fortschritt und Pausen im Gym tracken. Läuft als installierbare Web-App (PWA)
auf Android und iPhone, **offline**, ohne Konto. Alle Daten bleiben auf dem Handy.

## Funktionen

| Bereich | Details |
|---|---|
| **Training** | Tag aus dem Plan starten, Gewicht und Wdh. je Satz (vorausgefüllt vom letzten Mal), ✓ hakt ab. Sätze/Übungen hinzufügen oder entfernen. Bildschirm bleibt an. Neuladen oder Wegwischen der App verliert nichts |
| **Pausen** | Timer startet beim Abhaken mit der Pause der Übung, ±15 s, Ton und Vibration am Ende, läuft danach als „+0:12“ weiter. Die **echte** Pause zwischen zwei Sätzen wird gemessen und gespeichert |
| **Fortschritt** | Je Übung: Diagramm geschätztes 1RM (Epley) und schwerstes Gewicht, Bestleistungen, Steigerung in %, Ø Pause, Tabelle aller Einheiten. Neue Bestleistungen nach dem Training 🏆 |
| **Verlauf** | Alle Trainings mit Dauer, Sätzen, bewegten kg, Ø Pause. Nachträglich korrigieren oder löschen |
| **Pläne** | Mehrere Pläne, einer aktiv. Gewicht und Pause je Satz (Top-Satz/Back-offs, Pyramiden), Blockwochen mit eigenem Gewicht pro Woche. Editor für Tage, Übungen, Sätze, Wdh., kg, Pause. Als Datei teilen |
| **Sicherung** | Export/Import als JSON-Datei, Erinnerung nach 30 Tagen |

## Plan importieren

Unter *Pläne → Plan importieren* (oder in WhatsApp, Gmail, Dateien: **Teilen → Overload**):

| Datei | Wie |
|---|---|
| PDF | Text und Tabellen (inkl. umbrochener Zellen, Gewichtsspalte, Blocktabelle W1…Wn) |
| Word (.docx) | Überschriften und Tabellen |
| Excel (.xlsx) | jedes Blatt ein Trainingstag |
| CSV / Text | Zeilen wie `Bankdrücken 3x10 80kg` oder Tabellen mit `;`/`,` |
| Plan-Datei (.json) | aus „Als Datei teilen“ |
| Foto / Scan | mit eigenem Claude-API-Schlüssel (Einstellungen) |

Danach zeigt eine Vorschau, was erkannt wurde (Tage, Übungen, Gewichte, Block). Gibt es schon einen
ähnlichen Plan, bietet sie an, ihn zu ersetzen – Trainings und Fortschritt bleiben erhalten.
Wird wenig erkannt und ist ein Schlüssel hinterlegt, liest automatisch Claude.

## Installieren (Android)

Link in **Chrome** öffnen → Menü ⋮ → **App installieren** (bzw. „Zum Startbildschirm hinzufügen“).
Danach startet Satzbuch wie eine normale App, auch ohne Netz.

## Lokal starten und testen

```bash
cd satzbuch
python3 -m http.server 8411     # http://localhost:8411
npm test                        # 63 Tests: Parser, Tabellen, Speicher, Statistik, Import
```

Kein Build-Schritt, keine Abhängigkeiten. pdf.js wird beim ersten PDF-Import von cdnjs geladen
und danach offline aus dem Cache genutzt.

## Aufbau

```
index.html, style.css   Oberfläche (dunkel/hell nach Systemeinstellung)
js/ui.js                Ansichten und Bedienung
js/store.js             Zustand in localStorage (satzbuch.v1), Training, Sicherung
js/parser.js            Plan-Erkennung aus Text, Plan-Prüfung
js/stats.js             1RM, Verlauf, Bestleistungen, Pausen, Timer-Rechnung
js/pdf.js               PDF → Text (pdf.js)
js/claude.js            Optionaler Import über die Claude API
sw.js                   Offline-Cache
plans/                  Mitgelieferte Pläne (index.json + Plan-Dateien)
```

## Planformat (`plans/*.json`)

```json
{ "id": "mein-plan", "name": "Mein Plan", "tage": [
  { "name": "Tag A", "uebungen": [
    { "name": "Bankdrücken", "saetze": 3, "wdh": "8-12", "gewicht": 60, "pause": 120, "notiz": "Gerät 14" }
  ]}
]}
```
`gewicht`, `pause` (Sekunden, Standard 90) und `notiz` sind optional.

**Gewicht je Satz** (Top-Satz, Back-offs, Pyramide): `"ziele": [{"wdh": "4-5", "kg": 34, "pause": 210}, {"wdh": "8", "kg": 28}]`.
Beim ersten Training gilt der Plan, danach übernimmt die App je Satz die Werte vom letzten Mal.

**Blockwochen** (z. B. 4-Wochen-Kraftblock): `"wochen": [[…Ziele Woche 1…], […Woche 2…], …]`. Auf „Heute“
wählst du die Woche, die App trägt dann genau die Sätze und Gewichte dieser Woche ein.

Im Editor gibt es dafür eine Kurzschrift: `4-5@34p210 / 2x8@28` = ein Satz 4-5 Wdh. mit 34 kg und
3:30 Min. Pause danach, dann zwei Sätze 8 Wdh. mit 28 kg. Bei Blockwochen eine Zeile pro Woche.

# Satzbuch: Trainings-App fürs Handy (Design)

Stand: 2026-11-24 · Ordner im Repo: `satzbuch/`

## Absicht und Warum

Der Nutzer trainiert im Gym (Halle41) und will eine **bessere Trainings-App nur für sich**,
auf dem Handy. Die MySports-App des Studios dient nur als Anstoß. Es wird **nichts davon
nachgebaut oder angezapft**: keine Dekompilierung, keine Halle41-Schnittstellen.

Die App soll drei Dinge gut können:

1. **Übungen tracken:** Gewicht und Wiederholungen je Satz, schnell während des Trainings.
2. **Fortschritt sehen:** Wie entwickelt sich jede Übung über Wochen?
3. **Pausen tracken:** Pausentimer zwischen den Sätzen, und tatsächliche Pausenzeiten festhalten.

Dazu: **Der Trainingsplan kommt als PDF** und soll ohne Abtippen in die App gelangen, entweder
indem der Nutzer das PDF Claude schickt oder über einen Import in der App.

## Ziele

- Läuft auf dem Handy (iPhone und Android), installierbar auf dem Startbildschirm, **offline** im Gym.
- Pro Satz höchstens **zwei Tipps** im Normalfall: Werte sind mit dem letzten Training
  vorausgefüllt, ein Tipp auf ✓ hakt den Satz ab und startet den Pausentimer.
- Fortschritt je Übung als Diagramm sowie persönliche Bestleistungen (PRs).
- Plan aus PDF übernehmen, auf drei Wegen (siehe unten).
- Pläne in der App bearbeiten können, weil kein PDF-Import perfekt ist.
- Sicherung als Datei (Export/Import), damit beim Handywechsel nichts verloren geht.

## Nicht-Ziele

- Konten, Server, Synchronisation zwischen Geräten
- Anbindung an Halle41/MySports (Kurse buchen, Check-in)
- Ernährung, soziale Funktionen, Veröffentlichung im App Store
- Mehrere Nutzer

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)

- Eintragen während des Trainings ist umständlich oder langsam.
- Daten gehen ohne Vorwarnung verloren.
- Die App braucht im Gym Internet.
- Ein PDF-Import landet ungeprüft im Plan. Der Nutzer sieht immer erst eine Vorschau.

## Ansätze

| Ansatz | Vor- und Nachteile | Entscheidung |
|---|---|---|
| **A) Installierbare Web-App (PWA), Daten auf dem Gerät** | Kostenlos, offline, kein Store, gleicher Aufbau wie PrüfFit im Repo. Daten nur auf dem Gerät, daher Export als Absicherung | **Gewählt vom Nutzer** |
| B) Native App über Capacitor/App Store (wie Tellerblick) | Wirkt am nativsten, aber Entwicklerkonten, Store-Prüfung und Builds bringen für einen einzelnen Nutzer kaum etwas | verworfen |
| C) PWA mit eigenem Server | Sync und Sicherung auf dem Server, aber laufende Kosten und Pflege | verworfen |

## Technik (meine Entscheidungen)

- **Kein Build-Schritt**, reines HTML/CSS/JS mit ES-Modulen, wie PrüfFit. Ordner `satzbuch/`.
- Logik in eigenen Modulen (`js/parser.js`, `js/stats.js`, `js/store.js` …), damit sie mit
  `node --test` ohne Browser testbar ist. Die Oberfläche liegt in `index.html` + `js/ui.js`.
- **Speicher:** `localStorage` unter einem Schlüssel mit Versionsnummer (`satzbuch.v1`).
  Jahre an Trainingsdaten bleiben weit unter 5 MB. Beim Start bittet die App mit
  `navigator.storage.persist()` darum, dass der Browser die Daten nicht automatisch löscht.
- **Offline:** Service Worker cacht App-Dateien und pdf.js.
- **Gestaltung:** deutsch, kg, mobil zuerst, große Tipp-Flächen, dunkles Design als Standard
  (folgt der Systemeinstellung), eine Akzentfarbe.
- **Hosting:** GitHub Pages per Workflow, der nur `satzbuch/` veröffentlicht. *Offen: Ist das
  Repo privat, braucht GitHub Pages ein bezahltes Konto. Ausweichen auf Netlify oder
  Cloudflare Pages (kostenlos, Ordner hochladen).*

## Datenmodell

```
Plan     { id, name, quelle: "pdf"|"manuell"|"claude", tage: [Tag] }
Tag      { id, name ("Tag A – Push"), uebungen: [PlanUebung] }
PlanUebung { id, name, saetze: 3, wdh: "8-12", gewicht?: 60, pause: 90 (Sek.), notiz? }

Training { id, planId, tagId, start, ende, eintraege: [Eintrag] }
Eintrag  { uebungName, saetze: [Satz] }
Satz     { kg, wdh, erledigtUm (Zeitstempel), pauseVorher (Sek., gemessen) }
```

Übungen werden **über ihren Namen** (normalisiert: klein, ohne Leerzeichen am Rand) über
Trainings und Pläne hinweg verknüpft, damit der Fortschritt einen Planwechsel übersteht.

## Bildschirme

```
┌ Heute ──────────────────┐   ┌ Training: Tag A ────────┐   ┌ Fortschritt ────────────┐
│ Plan: Push/Pull/Beine   │   │ Bankdrücken   3×8-12    │   │ Bankdrücken        ▾    │
│ ▶ Tag A – Push          │   │ letztes Mal: 3×10 @ 70  │   │  ╱‾╲_╱‾‾  geschätztes   │
│   Tag B – Pull          │   │ 1  [72,5] kg [10] ✓     │   │ ╱          1RM über Zeit│
│   Tag C – Beine         │   │ 2  [72,5] kg [ 9] ✓     │   │ PR: 80 kg × 6 (12.11.)  │
│ Letztes Training: Mo.   │   │ 3  [72,5] kg [  ]  ○    │   │ Ø Pause: 1:42           │
│ Diese Woche: 2 Trainings│   │  ⏱ Pause 1:12 / 1:30    │   │ Verlauf ▸               │
└─────────────────────────┘   └─────────────────────────┘   └─────────────────────────┘
 Unten: Heute · Verlauf · Fortschritt · Pläne
```

1. **Heute:** aktiver Plan, Trainingstage, letztes Training, Trainings dieser Woche.
2. **Training:** Übungen des Tages. Je Satz Gewicht und Wiederholungen (vorausgefüllt aus dem
   letzten Mal, sonst aus dem Plan), ✓ zum Abhaken, +/- für Sätze, Übung tauschen oder hinzufügen,
   Notiz. Bildschirm bleibt an (Wake Lock). Training beenden zeigt eine Zusammenfassung
   (Dauer, Volumen, neue PRs, Ø Pause).
3. **Pausentimer:** startet beim Abhaken mit der Pausenzeit der Übung, ±15 s, überspringen.
   Am Ende Ton und Vibration (Vibration nur Android, iOS unterstützt sie im Browser nicht).
   Der Timer rechnet mit Zeitstempeln, damit er stimmt, wenn das Handy kurz gesperrt war.
   **Gemessen** wird die echte Pause: Zeit zwischen zwei abgehakten Sätzen, gespeichert als
   `pauseVorher`.
4. **Verlauf:** Liste vergangener Trainings, antippen zum Ansehen/Korrigieren/Löschen.
5. **Fortschritt:** Übung wählen → Diagramm (geschätztes 1RM nach Epley und schwerstes Gewicht)
   je Training, Volumen, Bestleistungen, Ø Pause. Diagramme als eigenes SVG, ohne Bibliothek.
6. **Pläne:** Pläne auflisten, aktiv setzen, bearbeiten (Tage/Übungen/Sätze/Wdh./Pause),
   importieren, löschen.
7. **Einstellungen:** Standard-Pausenzeit, Ton an/aus, Claude-API-Schlüssel (optional),
   Sicherung exportieren/importieren, alle Daten löschen. Erinnerung zum Export, wenn die
   letzte Sicherung über 30 Tage her ist.

## Plan aus PDF: drei Wege

1. **PDF an Claude im Chat (immer verlässlich):** Der Nutzer schickt das PDF. Claude liest es,
   schreibt `satzbuch/plans/<id>.json` im Planformat, trägt ihn in `plans/index.json` ein,
   committet und veröffentlicht neu. In der App unter Pläne → „Mitgelieferte Pläne“ mit einem
   Tipp übernehmen. Klappt auch bei Scans und Fotos.
2. **Import in der App, ohne Schlüssel:** pdf.js extrahiert den Text, ein Regel-Parser erkennt:
   - Tag-Überschriften: „Tag 1“, „Tag A“, „Montag“, „Push/Pull/Beine“, „Oberkörper“, „Trainingseinheit 2“ …
   - Übungszeilen mit Mustern wie `3x10`, `3 × 8-12`, `4 Sätze à 10 Wdh.`, `3/10`, Gewicht `80 kg`,
     Pause `90 s`/`1:30 min`/`2 min Pause`, Tabellenzeilen „Übung | Sätze | Wdh. | Gewicht“.
   - Unbekanntes landet als Übung mit Standardwerten (3×10, 90 s) und Markierung „prüfen“.
   Danach **Vorschau mit Bearbeitung**, erst dann speichern. Gescannte PDFs ohne Text werden
   erkannt und mit Hinweis auf Weg 1 oder 3 abgelehnt.
3. **Import in der App mit Claude (optional):** Ist ein eigener API-Schlüssel hinterlegt, schickt
   die App das PDF direkt an die Claude-API (Browser-Zugriff erlaubt) und verlangt JSON im
   Planformat. Gleiche Vorschau wie bei Weg 2. Der Schlüssel bleibt nur auf dem Gerät. Das
   Modell legt der Builder beim Bauen anhand der aktuellen API-Doku fest.

Zusätzlich: Plan als JSON-Datei importieren/exportieren.

## Tests

- `node --test` für Parser (mehrere realistische Planformate), Statistik (1RM, PRs, Volumen,
  Pausen), Speicher-Migration und Sicherung (Export → Import ergibt dieselben Daten).
- Durchklicken im Handy-Format mit Playwright: Plan importieren, Training mit Timer, Fortschritt.

## Dem Builder überlassen

Exakte Farben und Abstände, Icon, Texte der Oberfläche, Aufteilung der JS-Module, Details des
Parsers, solange die genannten Formate erkannt werden.

## Geklärt

- Gerät: **Android**. Installation über Chrome („App installieren“), Vibration am Timer-Ende wird genutzt.

## Offen beim Nutzer

- Das echte Plan-PDF. Wenn es vor dem Bau kommt, wird der Parser darauf getestet und der Plan
  gleich mitgeliefert.

# Money Apps

Vier lauffähige Prototypen für App-Ideen mit gutem Umsatzpotenzial. Dazu die
Wettbewerbs-Analyse in [ANALYSE.md](ANALYSE.md).

| App | Was sie macht | Technik | Start |
|---|---|---|---|
| [**StreamCut**](streamcut/) | Stream-VOD rein, fertige 9:16-Shorts mit Untertiteln raus. Highlights aus Lautstärke, Hype-Wörtern und Chat | Python, FastAPI, Whisper, ffmpeg | `uvicorn app:app --port 8000` |
| [**PrüfFit**](lernapp/) | Lern-App für Prüfungen: Wiederholung im wachsenden Abstand, Prüfungssimulation, Prüfungsreife in %. Fragenkataloge per KI erzeugen | Statische PWA, läuft offline | `python3 -m http.server 8101` |
| [**AngebotsBlitz**](angebotsblitz/) | Handwerker diktiert den Auftrag, daraus werden Angebot und Rechnung als PDF mit eigener Preisliste | Python, FastAPI, SQLite, fpdf2 | `uvicorn app:app --port 8200` |
| [**Tellerblick**](tellerblick/) | Kalorien und Eiweiß per Foto, Tagesziel, Gewichtstrend | Python, FastAPI, SQLite, Claude Vision | `uvicorn app:app --port 8300` |
| [**Zerfallzone**](zerfallzone/) | Vertikaler Arena-Battle-Royale im Browser: zerfallende Stadtsektoren, Waffen-Fusion, Fähigkeiten, Kern-Finale gegen bis zu 40 Bots in 4 Schwierigkeitsstufen | Three.js, statische Seite | `python3 -m http.server 8500` |

Jede App hat ein eigenes README mit Funktionen, Start-Anleitung und dem Weg zum
verkaufbaren Produkt.

**KI-Funktionen:** Mit `ANTHROPIC_API_KEY` nutzen die Apps Claude. Ohne Key laufen
alle Apps weiter und greifen auf kostenlose Ersatzfunktionen zurück: Regel-Engine,
Lebensmittel-Datenbank, Titel aus dem Transkript.

```bash
pip install -r <app>/requirements.txt
cd <app> && python -m pytest -q      # Tests (StreamCut, AngebotsBlitz)
```

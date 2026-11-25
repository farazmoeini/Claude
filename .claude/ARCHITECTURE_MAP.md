# Architecture Map

Monorepo mit fünf unabhängigen App-Prototypen. Übersicht: `README.md`, Marktanalyse: `ANALYSE.md`.

| Ordner | App | Technik | Einstieg / Tests |
|---|---|---|---|
| `streamcut/` | StreamCut (VOD → Shorts) | Python, FastAPI, Whisper, ffmpeg | `app.py`, `pipeline.py`, `test_pipeline.py` |
| `lernapp/` | PrüfFit (Lern-PWA) | Statische PWA | `index.html`, `sw.js`, `catalogs/`, `tools/` |
| `angebotsblitz/` | AngebotsBlitz (Angebote/Rechnungen) | Python, FastAPI, SQLite, fpdf2 | `app.py`, `db.py`, `drafting.py`, `pdf.py`, `test_drafting.py` |
| `tellerblick/` | Tellerblick (Kalorien per Foto) | FastAPI, SQLite, Claude Vision | `backend/`, `web/`, `mobile/`, `deploy/` |
| `satzbuch/` | Overload (Trainingstagebuch-PWA) | Statische PWA | `index.html`, `js/`, `test/`, `plans/` |

Specs und Pläne: `docs/superpowers/` (nur bei Bedarf lesen).

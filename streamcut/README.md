# StreamCut: Stream-VODs automatisch zu Shorts

Du lädst ein Stream-VOD hoch. StreamCut findet die besten Momente und rendert
fertige 9:16-Clips mit animierten Untertiteln, bereit für TikTok, Shorts und Reels.

## Funktionen (MVP)

| Funktion | Details |
|---|---|
| Transkription | Whisper läuft lokal und kostet nichts pro Minute. Wortgenaue Zeitstempel, Deutsch, Englisch oder automatisch erkannt |
| Highlight-Erkennung | Lautstärke-Spitzen, Hype-Wörter und Phrasen auf Deutsch und Englisch („oh mein Gott“, „clip das“, „let's go“), Sprechdichte, Bonus für einen starken Hook in den ersten 5 s |
| Chat-Aktivität (optional) | Chat-Log hochladen (TwitchDownloader-JSON oder Textzeilen wie `[0:12:34] user: KEKW`). Nachrichten-Spitzen und Emotes (KEKW, W, Clip …) zählen als stärkstes Hype-Signal. Die Reaktionsverzögerung des Chats (ca. 4 s) wird herausgerechnet |
| Schnittpunkte | Schnitte liegen auf Sprechpausen, Clips beginnen und enden nicht mitten im Wort |
| KI-Bewertung (optional) | Claude wählt die besten Kandidaten und schreibt Titel, Beschreibung und Hashtags |
| Layouts | **Mitte** (Talk), **Split** (Facecam oben, Gameplay unten, Position der Facecam einstellbar), **Blur** (ganzes Bild mit unscharfem Hintergrund) |
| Untertitel | Wort für Wort, aktives Wort gelb hervorgehoben, eingebrannt |
| Audio | Lautheit auf −14 LUFS normalisiert (Social-Media-Standard) |

## Starten

```bash
pip install -r requirements.txt     # ffmpeg muss installiert sein
uvicorn app:app --port 8000          # dann http://localhost:8000 öffnen
python -m pytest -q                  # Tests (ohne Video und Modell)
```

Optionale Umgebungsvariablen:

| Variable | Standard | Zweck |
|---|---|---|
| `ANTHROPIC_API_KEY` | – | Schaltet die KI-Auswahl sowie Titel und Hashtags durch Claude ein |
| `STREAMCUT_MODEL` | `claude-opus-5-5` | Claude-Modell. `claude-haiku-5-5` ist deutlich günstiger |
| `STREAMCUT_WHISPER` | `small` | `base` ist schneller, `medium` genauer |

Ohne API-Key läuft alles weiter. Die Titel kommen dann aus dem Transkript.

## Geschwindigkeit

Gemessen auf 4 CPU-Kernen: Ein 100-Sekunden-Video ist in etwa 25 s fertig.
Bei einem mehrstündigen VOD dominiert die Transkription. Für den Produktivbetrieb
lohnt sich ein Server mit GPU, und `faster-whisper` nutzt CUDA automatisch,
wenn man `device="cuda"` setzt.

## Nächste Schritte zum verkaufbaren Produkt

1. **Twitch- und YouTube-Link statt Upload**, nur für eigene VODs (Login über Twitch-OAuth)
2. **Facecam automatisch erkennen** (Gesichtserkennung) statt manueller Position
3. **Accounts und Bezahlung** (Stripe). Free: 3 Clips/Monat mit Wasserzeichen. Pro: ca. 15 €/Monat
4. **Direkt posten** über die TikTok- und YouTube-API
5. **Clip-Editor**: Start und Ende verschieben, Untertitel korrigieren

## Aufbau

```
app.py            FastAPI-Server: Upload, Job-Queue, Status, Auslieferung der Dateien
pipeline.py       Audio → Transkript → Highlights → KI → Rendern
static/index.html Oberfläche (eine Datei, kein Build-Schritt)
data/<job>/       Ergebnisse pro Job (Clips, Thumbnails, Transkript)
```

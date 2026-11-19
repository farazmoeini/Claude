# Wettbewerbs-Analyse: Top-5 App-Ideen

Stand: 19.11.2026. Grundlage sind öffentlich sichtbare Funktionen, Abläufe und
Preismodelle der Marktführer, kein dekompilierter Code. Preise ändern sich oft und
sind nur Größenordnungen. Vor einer Entscheidung auf den jeweiligen Websites prüfen.

Für jede Idee:
**Wie die Großen es machen → wo die Lücke ist → was unser MVP kann.**

---

## 1. KI-Clipping für Streamer

**Vorbilder:** OpusClip, Vizard, Klap, Descript-Clips, Streamladder

**So funktioniert es (der typische Ablauf):**
1. Upload oder Link (YouTube, Twitch-VOD)
2. Transkription mit Spracherkennung, Zeitstempel pro Wort
3. Highlight-Erkennung: Ein Sprachmodell bewertet Abschnitte des Transkripts
   („Viral Score“). Zusätzlich zählen Signale wie Lautstärke-Spitzen und Szenenwechsel.
4. Reframing auf 9:16 mit Gesichts- oder Sprecher-Tracking
5. Animierte Untertitel Wort für Wort (der wichtigste Faktor für Watch-Time)
6. Export, Planen und Posten auf TikTok, Shorts und Reels

**Geschäftsmodell:** Freemium mit Wasserzeichen und Minuten-Kontingent. Bezahlt
ab ca. 10–30 $/Monat, abgerechnet nach Upload-Minuten.

**Lücken:**
- Die Tools sind für Podcasts und Talking Heads gebaut. Gaming-Streams haben
  Facecam plus Gameplay, und der Center-Crop zerstört das Layout.
- Die Highlight-Erkennung ignoriert Chat-Aktivität und Spiel-Events.
- Deutsche Untertitel und deutscher Humor werden schlechter erkannt.
- Bei mehrstündigen VODs wird das Minuten-Modell teuer.

**Unser MVP („StreamCut“):**
- Upload eines VODs. Whisper transkribiert lokal, das kostet nichts pro Minute.
- Highlight-Score aus Lautstärke-Spitzen und Hype-Wörtern (DE/EN). Optional
  bewertet Claude die Stellen.
- Layout „Facecam oben, Gameplay unten“ (Split) oder Center-Crop
- Eingebrannte Untertitel Wort für Wort, Export als 9:16-MP4

---

## 2. KI-Angebots- und Rechnungstool für Handwerker

**Vorbilder:** Plancraft, HERO Software, Craftnote, sevDesk/lexoffice (allgemein)

**So funktioniert es:** Kunden- und Projektverwaltung, Angebote mit
Positionskatalogen, Umwandlung in Rechnungen, Aufmaß, Zeiterfassung.
Diese Tools sind schwer und auf Firmen ab ca. 5 Mitarbeitern zugeschnitten.

**Geschäftsmodell:** B2B-Abo, ca. 30–100 €/Monat pro Firma, oft mit Kosten pro Nutzer.

**Lücken:**
- Ein Angebot zu erstellen dauert lange. Der Handwerker steht beim Kunden und will
  sofort ein Angebot schicken.
- Für Solo-Selbstständige ist das zu komplex und zu teuer.

**Unser MVP:**
- Freitext oder Sprachnotiz wie „Bad 6 m², alte Fliesen raus, neue Fliesen
  60x60, Silikon“ wird zu strukturierten Positionen mit Mengen und Preisen.
  Die Preise kommen aus einer eigenen Preisliste.
- PDF-Angebot mit Logo, Umwandlung in eine Rechnung mit einem Klick

---

## 3. Lern-App für Prüfungsvorbereitung (Nische)

**Vorbilder:** Führerschein-Apps (z. B. ClickClickDrive), Jagdschein- und
Sachkunde-Apps, Anki

**So funktioniert es:** Offizieller oder öffentlicher Fragenkatalog, Lernkarten
mit Wiederholungsabständen (Spaced Repetition), Prüfungssimulation unter
Zeitdruck, Fortschrittsanzeige („bereit für die Prüfung: 82 %“).

**Geschäftsmodell:** Einmalkauf (10–30 €) oder Abo bis zur Prüfung.
Die Zahlungsbereitschaft ist hoch, weil eine Prüfungsgebühr auf dem Spiel steht.

**Lücken:**
- Viele Nischen-Prüfungen haben nur veraltete und hässliche Apps:
  §34a Sachkunde Bewachung, Sportbootführerschein, IHK-Ausbilderschein, Fischereischein.
- Keine Erklärungen zu falschen Antworten. Mit KI lassen sie sich erzeugen.

**Unser MVP:**
- Generische Lern-Engine: Fragenkatalog als JSON, Spaced Repetition (SM-2),
  Prüfungsmodus, Fortschritt. Die Nische ist austauschbar.
- Läuft als Web-App (PWA) offline auf dem Handy.

> Hinweis: Fragenkataloge können urheberrechtlich geschützt sein. Für den Verkauf
> nur Kataloge nutzen, die amtlich und frei sind, oder eigene Fragen.

---

## 4. Fitness: Kalorien zählen per Foto

**Vorbilder:** Cal AI, MyFitnessPal, Yazio, Lose It!

**So funktioniert es:** Foto der Mahlzeit, ein Vision-Modell schätzt Lebensmittel
und Portionen, daraus Kalorien und Makronährstoffe. Dazu ein Tagesziel aus dem
Onboarding (Gewicht, Ziel, Aktivität), Streaks und Gewichtsverlauf.

**Geschäftsmodell:** Hard Paywall nach dem Onboarding mit Trial, Abo ca.
30–80 €/Jahr. Laut Berichten war Cal AI einer der großen Indie-Erfolge 2024/25.

**Lücken:**
- Deutsche Gerichte und Portionsgrößen werden ungenau geschätzt.
- Keine Nischen-Ausrichtung, z. B. Kraftsport mit hohem Proteinbedarf,
  GLP-1-Nutzer (Abnehmspritze) oder Schwangerschaft.

**Unser MVP:**
- Foto hochladen. Claude Vision liefert Gericht, Kalorien und Makros als JSON.
- Tagesziel, Tagebuch, Protein-Fokus

---

## 5. Creator-Tool: Hook- und Titel-Generator mit Analyse

**Vorbilder:** TubeBuddy, VidIQ, Opus „Viral Score“, diverse Hook-Generatoren

**So funktioniert es:** Thema oder Skript eingeben, das Tool liefert Varianten
für Hook, Titel und Thumbnail-Text mit Bewertung. Die großen Tools
verbinden das mit Kanaldaten (YouTube API).

**Geschäftsmodell:** Freemium mit Tageslimit. Pro-Version ca. 10–50 $/Monat.

**Lücken:**
- Sehr viel Konkurrenz. Eine Chance besteht nur in Verbindung mit Idee 1
  (Clips plus passende Hooks und Captions) oder in einer Sprach-Nische.

**Unser MVP:**
- Wird als Funktion in StreamCut eingebaut: Jeder Clip bekommt Titel,
  Beschreibung und Hashtags. Eine eigene App lohnt sich vorerst nicht.

---

## Reihenfolge beim Bauen

| Reihenfolge | App | Warum |
|---|---|---|
| 1 | StreamCut (Clipping) | Passt zu deinem Umfeld, enthält Idee 5 als Funktion |
| 2 | Lern-App-Engine | Technisch am einfachsten, schnell verkaufbar |
| 3 | Handwerker-Angebote | Höchste Zahlungsbereitschaft (B2B) |
| 4 | Kalorien per Foto | Bewährtes Modell, braucht aber Marketing-Budget |

Die KI-Funktionen (Claude) in den Apps 1, 3 und 4 brauchen einen Anthropic-API-Key.
Ohne Key laufen sie mit einfacheren Ersatzfunktionen weiter.

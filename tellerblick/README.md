# Tellerblick: Kalorien und Eiweiß per Foto

Du fotografierst das Essen, die KI schätzt Gericht, Portion, Kalorien und Makros,
und mit einem Tipp ist es eingetragen. Gebaut als Web-App, die auf dem Handy wie
eine native App funktioniert.

## Funktionen

| Funktion | Details |
|---|---|
| **Onboarding** | Tagesziel nach Mifflin-St Jeor (Grundumsatz × Aktivität ± Defizit für das Wunschtempo), Untergrenze 1.200 bzw. 1.500 kcal mit Warnhinweis. Eiweißziel in g pro kg, Fett 27 %, Rest Kohlenhydrate |
| **Foto-Analyse** | Claude Vision erkennt jede Komponente einzeln, schätzt die Gramm und denkt an versteckte Fette. Mengen anpassen, dann skalieren die Makros mit. Komponenten lassen sich abwählen. Optionaler Hinweis wie „halbe Portion gegessen“ |
| **Ohne KI nutzbar** | Lebensmittel-Datenbank mit typischen Portionen (z. B. „1 Ei (M)“, „1 Döner“) und eigene Einträge. Das Foto bleibt trotzdem am Eintrag |
| **Tagebuch** | Ring mit den übrigen kcal, Balken für Eiweiß, Kohlenhydrate und Fett, vier Mahlzeiten, zurückblättern auf frühere Tage, löschen |
| **Motivation** | Streak in Tagen, Lob beim Erreichen des Eiweißziels, Durchschnitt über 7 Tage, Tage mit erreichtem Eiweißziel |
| **Gewicht** | Tageswerte und 7-Tage-Durchschnitt als Trendlinie (glättet Wasserschwankungen). Das Kalorienziel passt sich automatisch an das neue Gewicht an |
| **Handy-tauglich** | Kamera direkt aus dem Browser, Dezimalkomma, Dark Mode |

## Starten

```bash
cd tellerblick
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...         # optional, schaltet die Foto-Analyse ein
uvicorn app:app --port 8300          # http://localhost:8300
```

`TELLERBLICK_MODEL` wählt das Claude-Modell (Standard `claude-opus-5-5`).
Für viele Nutzer ist `claude-haiku-5-5` deutlich günstiger. Fotos werden vor der
Analyse auf maximal 1280 px verkleinert, das spart Kosten und Zeit.

## Hinweise

- Die Nährwerte in der Datenbank und aus der KI sind **Schätzungen**, keine medizinischen Angaben.
- Gesundheitsdaten sind besonders geschützt (Art. 9 DSGVO). Vor dem Start mit echten Nutzern
  braucht es Einwilligung, Datenschutzerklärung und Hosting in der EU.

## Weg zum Geld

Das Erfolgsmodell der Kategorie: **Hard Paywall nach dem Onboarding**. Der Nutzer sieht sein
persönliches Ziel, dann folgen ein Probezeitraum und ein Jahresabo (ca. 39–59 €).

**Positionierung statt Kopie:** eine Nische mit klarem Problem, z. B.
- **GLP-1 / Abnehmspritze:** Eiweiß-Tracking gegen Muskelverlust, kleine Portionen
- **Kraftsport:** Eiweiß zuerst, schnelles Eintragen im Gym
- **Deutsche Küche:** bessere Schätzung von Brot, Wurst und Kantinenessen

**Nächste Schritte:**
1. Accounts und Sync (z. B. Supabase)
2. Barcode-Scanner (Open Food Facts)
3. Stripe- oder RevenueCat-Abo
4. Als App in die Stores mit Capacitor
5. Erinnerungen per Push
6. Content-Marketing mit Vorher-nachher-Clips, geschnitten mit StreamCut

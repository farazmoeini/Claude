# Zerfallzone

Ein eigener, vertikaler Arena-Battle-Royale im Browser (Three.js, kein Build-Schritt).
Du gegen 15 Bots in einer prozedural erzeugten Neon-Stadt, die Sektor für Sektor zerfällt.

```bash
cd zerfallzone && python3 -m http.server 8500
# http://localhost:8500 öffnen
```

Three.js kommt per CDN (jsDelivr). Beim ersten Start braucht der Browser also Internet.

## Woher das Design kommt

Vorbild ist das Genre der schnellen „Arena-Battle-Royales“ von 2020. Ubisofts
inzwischen eingestelltes *Hyper Scape* ist das bekannteste Beispiel. Echtes Reverse
Engineering war nicht möglich und auch nicht gewollt: Das Spiel ist proprietär, die
Server sind abgeschaltet. Analysiert wurde deshalb nur die **Mechanik-Ebene**, also
das, was man beim Spielen und in öffentlichen Beschreibungen sieht. Name, Karte,
Figuren, Grafik, Sounds und Code sind komplett eigen.

| Genre-Mechanik | Wie das Genre es typischerweise löst | Umsetzung in Zerfallzone |
|---|---|---|
| Spielfeld schrumpft | Statt eines runden Gases fallen einzelne Stadtsektoren weg, in Wellen und mit Vorwarnung | 8×8 Sektoren, 8 Wellen. Zerfall von außen nach innen zum zufälligen letzten Sektor. 12 s orange Warnung, danach 9 Schaden/s |
| Vertikalität | Viel Bewegung über Dächer, Sprungfelder, Doppelsprung, Klettern | Doppelsprung, Wandklettern (Leertaste + W), Kante hochziehen, Sprungfelder mit 30 m/s |
| Waffenfortschritt | Doppelte Waffen verschmelzen zu stärkeren Stufen statt Seltenheitsfarben | 4 Waffen, Stufen I bis IV: +15 % Schaden und +20 % Magazin pro Stufe |
| Fähigkeiten als Beute | Fähigkeiten liegen in der Welt und belegen zwei Slots | 5 eigene Fähigkeiten (Sprung, Bollwerk, Scan, Heilung, Katapult). Doppelte senken die Abklingzeit |
| Alternatives Siegziel | Im Finale erscheint ein Objekt, das man halten muss | Der Kern erscheint im letzten Sektor. Wer ihn 30 s allein hält, gewinnt. Oder als Letzter überleben |
| Schnelle Runden | Runden von 10 bis 15 Minuten | Etwa 5 bis 6 Minuten pro Runde |

## Technik

- **Welt** (`buildWorld`): 64 Sektoren mit je 4 Grundstücken und Gebäuden von 4 bis 50 m Höhe, zur Mitte hin höher. Dazu Dachaufbauten, Deckungskisten und Sprungfelder. Straßen liegen alle 25 m und dienen den Bots als Wegenetz.
- **Physik** (`moveEntity`): Achsen-getrennte AABB-Kollision gegen alle Boxen. Landen auf Dächern geht über einen Kreuzungstest, damit man auch bei hohem Tempo nicht durchfällt.
- **Treffer** (`traceShot`): Hitscan mit Slab-Raycast gegen die Boxen. Spieler und Bots haben je eine Körper- und eine Kopfkugel, Kopftreffer zählen ×1,6. Schrotkugeln verlieren mit der Distanz an Schaden.
- **Bots** (`updateBot`): Wegfindung als Manhattan-Pfad über das Straßenraster. Bots suchen alle 0,3 s nach Gegnern in Sichtlinie, haben eine Reaktionszeit, schießen mit distanzabhängiger Streuung und Vorhalt, laufen im Kampf seitwärts, heilen sich, flüchten vor dem Zerfall und laufen im Finale zum Kern.
- **Audio**: alles synthetisch per WebAudio, ohne Sounddateien.

## Tests

Mit `window.__zz` lässt sich das Spiel per Skript steuern. Ein Playwright-Lauf, der
eine ganze Runde simuliert (alle 8 Wellen, Kern, Spielende), lief ohne Konsolenfehler.
40 s Spielzeit brauchen etwa 0,3 ms pro Tick.

## Ideen für danach

Online-Mehrspieler (WebSocket-Server mit autoritativer Simulation), zerstörbare
Gebäude im Zerfall, Zuschauer- oder Geistermodus nach dem Ausscheiden, Bots, die
Dächer gezielt erklettern.

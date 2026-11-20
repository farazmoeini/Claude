# Zerfallzone

Ein eigener, vertikaler Arena-Battle-Royale im Browser (Three.js, kein Build-Schritt).
Du gegen bis zu 40 Bots in vier Schwierigkeitsstufen, in einer prozedural erzeugten Neon-Stadt, die dynamisch Sektor für Sektor zerfällt.

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
| Spielfeld schrumpft | Statt eines runden Gases fallen einzelne Stadtsektoren weg, in Wellen und mit Vorwarnung, und die Gebäude darin lösen sich auf | Dynamische Zone, siehe unten |
| Vertikalität | Viel Bewegung über Dächer, Sprungfelder, Doppelsprung, Klettern | Doppelsprung, Wandklettern (Leertaste + W), Kante hochziehen, Sprungfelder mit 30 m/s |
| Waffenfortschritt | Doppelte Waffen verschmelzen zu stärkeren Stufen statt Seltenheitsfarben | 6 Waffen (MP, Salvengewehr, Schrotflinte, Railgun, Präzisionspistole, Granatwerfer), Stufen I bis IV: +15 % Schaden und +20 % Magazin pro Stufe |
| Fähigkeiten als Beute | Fähigkeiten liegen in der Welt und belegen zwei Slots | 10 eigene Fähigkeiten: Sprung (Blinzeln), Bollwerk (Wand), Scan, Heilung, Katapult, Tarnung, Schockwelle, Mine, Stampfer, Bastion (−75 % Schaden). Doppelte senken die Abklingzeit |
| Alternatives Siegziel | Im Finale erscheint ein Objekt, das man halten muss | Der Kern erscheint im letzten Sektor. Wer ihn 30 s allein hält, gewinnt. Oder als Letzter überleben |
| Zweite Chance | Ausgeschiedene Spieler bleiben als Geist im Spiel und können zurückkommen | Einmal pro Runde wirst du zum Geist: schneller und unsichtbar für Bots. Du hast 45 s, um eine von 3 grünen Rückkehrsäulen zu erreichen und dort 3 s F zu halten. Dann kommst du mit 60 HP und einer Funke I zurück |
| Wechselnde Regeln | Zufällige Events verändern die Runde | Stadt-Events alle 45–70 s für 25 s: Niedrige Schwerkraft, Endlose Munition, Schnelle Fähigkeiten, Radar, Turbo |
| Bewegung | Rutschen, Sprünge, Fähigkeiten zur Bewegung | Rutschen (Strg/C beim Sprinten), Raketensprung mit dem Mörser, Stampfer aus der Luft |
| Finale | Wer das Siegobjekt trägt, ist für alle sichtbar | Wer im Kernbereich steht, wird aufgedeckt, und Bots greifen ihn bevorzugt an |
| Schnelle Runden | Runden von 10 bis 15 Minuten | Etwa 5 bis 6 Minuten pro Runde |

## Dynamische Zone

- Die Stadt besteht aus 8×8 Sektoren. Der Zerfall breitet sich wie Fäulnis aus: Betroffen sind nur Sektoren am Kartenrand oder neben schon zerfallenen.
- Ein unsichtbarer Schwerpunkt der sicheren Zone wandert in jeder Welle zu einem zufälligen sicheren Sektor in seiner Nähe. Welcher Sektor am Ende übrig bleibt, steht deshalb erst ganz zum Schluss fest.
- Die sichere Zone bleibt immer zusammenhängend (Flood-Fill-Prüfung), es entstehen also keine abgeschnittenen Inseln.
- Ablauf einer Welle: 12 s orange Warnung, dann wird der Sektor rot. Die Gebäude darin flackern und versinken danach in 5 s im Boden. Wer auf dem Dach steht, fällt mit, und Beute auf den Dächern landet auf der Straße.
- Der Zerfall macht Schaden, und der steigt mit jeder Welle: 5 Schaden/s plus 1,5 pro Welle.
- Je weniger Spieler leben, desto kürzer die Pause bis zur nächsten Welle (20 bis 36 s).
- Ist nur noch ein Sektor übrig, erscheint dort der Kern.

## Bots und Schwierigkeit

Im Menü stellst du die Anzahl pro Stufe ein (insgesamt bis 40) oder wählst eine
Vorgabe: Training, Normal, Hart oder Albtraum. Die Auswahl bleibt im Browser
gespeichert. Der Name eines Bots zeigt seine Stufe an, zum Beispiel `Vex [E]`,
und auch die Leuchtfarbe des Bots steht für die Stufe.

| Stufe | Streuung | Reaktionszeit | Feuerrate | Sichtweite | Extras |
|---|---|---|---|---|---|
| Leicht (grün) | ×2,4 | 1,0–1,5 s | ×1,9 langsamer | 50 m | – |
| Mittel (gelb) | ×1,4 | 0,55–0,9 s | ×1,45 | 70 m | gelegentlich Kopfschüsse |
| Schwer (orange) | ×0,85 | 0,3–0,5 s | ×1,15 | 95 m | heilt sich, flieht aus dem Zerfall, bessere Waffen und Rüstung |
| Elite (rot) | ×0,5 | 0,15–0,28 s | voll | 120 m | zielt oft auf den Kopf, ausweichen per Sprung, startet mit Waffenstufe +1 und 50 Rüstung |

Schwere und Elite-Bots setzen auf kurze Distanz die Schockwelle ein. Getarnte Spieler sehen Bots nur auf unter 6 m.

## Technik

- **Welt** (`buildWorld`): 64 Sektoren mit je 4 Grundstücken und Gebäuden von 4 bis 50 m Höhe, zur Mitte hin höher. Dazu Dachaufbauten, Deckungskisten und Sprungfelder. Straßen liegen alle 25 m und dienen den Bots als Wegenetz.
- **Physik** (`moveEntity`): Achsen-getrennte AABB-Kollision gegen alle Boxen. Landen auf Dächern geht über einen Kreuzungstest, damit man auch bei hohem Tempo nicht durchfällt.
- **Treffer** (`traceShot`): Hitscan mit Slab-Raycast gegen die Boxen. Spieler und Bots haben je eine Körper- und eine Kopfkugel, Kopftreffer zählen ×1,6. Schrotkugeln verlieren mit der Distanz an Schaden.
- **Bots** (`updateBot`): Wegfindung als Manhattan-Pfad über das Straßenraster. Bots suchen alle 0,3 s nach Gegnern in Sichtlinie, haben eine Reaktionszeit, schießen mit distanzabhängiger Streuung und Vorhalt, laufen im Kampf seitwärts, heilen sich, flüchten vor dem Zerfall und laufen im Finale zum Kern.
- **Audio**: alles synthetisch per WebAudio, ohne Sounddateien.

## Tests

Mit `window.__zz` lässt sich das Spiel per Skript steuern. Ein Playwright-Lauf, der
eine ganze Runde simuliert (alle Zerfallswellen, Kern, Spielende, Bot-Auswahl im Menü), lief ohne Konsolenfehler.
40 s Spielzeit brauchen etwa 0,3 ms pro Tick.

## Ideen für danach

Online-Mehrspieler (WebSocket-Server mit autoritativer Simulation), Squads mit
Bot-Mitspielern (Geister könnten dann durch Kills der Mitspieler zurückkehren),
Bots, die Dächer gezielt erklettern.

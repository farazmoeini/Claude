# Eigene 3D-Modelle

Legst du hier Modelle im **GLB-Format** und eine `manifest.json` ab, verwendet das Spiel
sie statt der eingebauten Figuren und Waffen. Fehlt die Datei, läuft alles wie bisher.

Achte auf die Lizenz: Nur Modelle verwenden, die du nutzen und weitergeben darfst
(zum Beispiel CC0 oder eigene Modelle). Keine Figuren oder Waffen aus anderen Spielen.

## manifest.json

```json
{
  "character": {
    "file": "figur.glb",
    "scale": 1.0,
    "rotY": 3.1416,
    "offsetY": 0,
    "handBone": "hand_r",
    "tintMaterials": ["Main"],
    "clips": { "idle": "Idle", "walk": "Walk", "run": "Run", "jump": "Jump" }
  },
  "weapons": {
    "funke":   { "file": "mp.glb",       "scale": 1, "pos": [0, 0, 0], "rot": [0, 3.1416, 0] },
    "lanze":   { "file": "railgun.glb",  "scale": 1 }
  }
}
```

- **scale:** Die Figur sollte etwa 1,8 m groß sein.
- **rotY:** Das Spiel schaut nach −z. Die meisten Pakete schauen nach +z, daher 3,1416 (eine halbe Drehung).
- **tintMaterials:** Materialnamen, die in der Teamfarbe eingefärbt werden. Ohne Angabe werden Materialien mit „team“, „accent“, „main“ oder „primary“ im Namen eingefärbt.
- **clips:** Namen der Animationen im Modell. Ohne Angabe sucht das Spiel nach „idle“, „walk“, „run“/„sprint“ und „jump“ im Namen.
- **handBone:** Knochen der rechten Hand, an den die Waffe gehängt wird.
- **weapons:** Waffen-IDs: `funke`, `puls`, `hagel`, `lanze`, `dorn`, `moerser`. Die Waffe erscheint in der Ich-Ansicht. Mit `pos` und `rot` richtest du sie aus.

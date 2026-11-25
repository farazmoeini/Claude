# Store-Einträge Tellerblick (Deutsch)

Alle Texte sind innerhalb der Zeichenlimits und direkt kopierbar.

## App Store (Apple)

| Feld | Inhalt |
|---|---|
| **Name** (max. 30) | Tellerblick: Kalorien per Foto |
| **Untertitel** (max. 30) | Eiweiß & Kalorienzähler |
| **Kategorie** | Gesundheit & Fitness (sekundär: Essen & Trinken) |
| **Altersfreigabe** | 12+ (Fragebogen: keine problematischen Inhalte; „Medizinische/Behandlungsinformationen: selten/schwach“) |
| **Preis** | Kostenlos mit In-App-Käufen |
| **Keywords** (max. 100, kommagetrennt, keine Leerzeichen) | kalorienzähler,abnehmen,protein,eiweiß,diät,makros,ernährung,foto,tagebuch,gewicht,kcal,fitness |
| **Support-URL** | https://api.DEINE-DOMAIN.de/legal/impressum.html (besser: eigene Support-Seite) |
| **Datenschutz-URL** | https://api.DEINE-DOMAIN.de/legal/datenschutz.html |
| **Nutzungsbedingungen (EULA)** | Standard-EULA von Apple + Link zu /legal/nutzungsbedingungen.html in der Beschreibung |

**Werbetext (max. 170):**
Foto machen, fertig: Tellerblick schätzt Kalorien, Eiweiß, Kohlenhydrate und Fett deiner Mahlzeit – und zeigt dir, wie viel heute noch geht.

**Beschreibung (max. 4000):**
```
Kalorien zählen, ohne Kalorien zu zählen.

Mach ein Foto von deinem Teller – Tellerblick erkennt die einzelnen Komponenten, schätzt die Portion und trägt Kalorien, Eiweiß, Kohlenhydrate und Fett in dein Tagebuch ein. Du kannst jede Menge mit einem Tipp anpassen.

DEIN PERSÖNLICHES ZIEL
• Tagesbedarf nach der anerkannten Mifflin-St-Jeor-Formel
• Abnehmen, halten oder Muskeln aufbauen – in deinem Tempo
• Eiweißziel pro Kilogramm Körpergewicht, damit beim Abnehmen Fett geht und nicht Muskeln
• Gesunde Untergrenze: Tellerblick empfiehlt nie zu wenig

SCHNELL EINTRAGEN
• Foto-Analyse per KI
• Lebensmittel-Suche mit typischen Portionen („1 Ei“, „1 Döner“, „1 Scheibe Brot“)
• „Zuletzt gegessen“ für Lieblingsgerichte mit einem Tipp
• Eigene Lebensmittel anlegen

MOTIVATION & FORTSCHRITT
• Ring mit den übrigen Kalorien und Balken für Eiweiß, Kohlenhydrate und Fett
• Gewichtstrend mit 7-Tage-Durchschnitt – Wasserschwankungen verwirren dich nicht mehr
• Streaks und Wochenauswertung

DATENSCHUTZ
• Server in Deutschland, keine Werbung, kein Tracking
• Export und Löschung deiner Daten jederzeit direkt in der App

TELLERBLICK PREMIUM
Kostenlos enthalten: Suche, manuelle Einträge, Auswertungen und 3 Foto-Analysen. Mit Premium analysierst du jede Mahlzeit per Foto.
Premium ist als Monats- oder Jahresabo erhältlich. Die Zahlung erfolgt über dein Apple-Konto. Das Abo verlängert sich automatisch, wenn es nicht mindestens 24 Stunden vor Ablauf des Zeitraums gekündigt wird. Kündigung und Verwaltung jederzeit in den Einstellungen deines Apple-Kontos.

Nutzungsbedingungen: https://api.DEINE-DOMAIN.de/legal/nutzungsbedingungen.html
Datenschutz: https://api.DEINE-DOMAIN.de/legal/datenschutz.html

Hinweis: Tellerblick ist kein Medizinprodukt. Nährwerte sind Schätzungen. Bei Erkrankungen, Schwangerschaft oder Essstörungen sprich bitte vorher mit einer Ärztin oder einem Arzt.
```

**Screenshots:** `screenshots/ios-6.9-1..4.png` (Pflichtgröße 6,9") und `screenshots/ios-6.5-1..4.png`.

**App-Review-Hinweise (Feld „Notes“):**
```
Demo-Konto: review@DEINE-DOMAIN.de / Passwort: (anlegen, siehe LAUNCH.md Schritt 7)
Das Demo-Konto hat Premium über BILLING-Testmodus oder einen Sandbox-Kauf.
Konto löschen: Einstellungen → „Konto und alle Daten löschen“.
Die Foto-Analyse schätzt Nährwerte mit einem KI-Modell; es werden keine medizinischen Diagnosen gestellt.
```

### App-Datenschutz („Nutrition Labels“) in App Store Connect

| Datentyp | Erhoben | Mit Identität verknüpft | Tracking | Zweck |
|---|---|---|---|---|
| Kontaktinfos → E-Mail-Adresse | Ja | Ja | Nein | App-Funktionalität |
| Gesundheit & Fitness → Gesundheit | Ja | Ja | Nein | App-Funktionalität |
| Benutzerinhalte → Fotos | Ja | Ja | Nein | App-Funktionalität |
| Käufe → Kaufverlauf | Ja | Ja | Nein | App-Funktionalität |
| Kennungen → Benutzer-ID | Ja | Ja | Nein | App-Funktionalität |

„Daten zum Tracking verwendet“: **Nein**. Kein App-Tracking-Transparency-Dialog nötig.

---

## Google Play

| Feld | Inhalt |
|---|---|
| **App-Name** (max. 30) | Tellerblick: Kalorien per Foto |
| **Kurzbeschreibung** (max. 80) | Foto machen – Kalorien & Eiweiß sind eingetragen. Der smarte Kalorienzähler. |
| **Vollständige Beschreibung** | wie App Store (Zahlungs-Satz anpassen: „über dein Google-Play-Konto“, Kündigung „im Play Store unter Abos“) |
| **Kategorie** | Gesundheit & Fitness |
| **Grafiken** | Symbol 512×512: `../mobile/assets/icon-only.png` verkleinern · Feature-Grafik 1024×500: `feature-graphic.png` · Screenshots: `screenshots/android-1..4.png` |
| **Inhaltseinstufung** | Fragebogen ausfüllen → voraussichtlich USK 0 / PEGI 3 |
| **Zielgruppe** | 18+ (vermeidet die Familienrichtlinien; App ist ab 16 nutzbar) |

### Datensicherheit (Data Safety)

- Daten erhoben: E-Mail-Adresse; Gesundheitsinformationen; Fotos; Kaufverlauf; App-Interaktionen: **nein**
- Daten geteilt: **Nein** (Auftragsverarbeiter zählen nicht als „Teilen“)
- Verschlüsselt bei Übertragung: **Ja**
- Nutzer kann Löschung anfordern: **Ja**, in der App + Link: https://api.DEINE-DOMAIN.de/legal/datenschutz.html
- Zweck aller Daten: App-Funktionen, Kontoverwaltung

### Gesundheits-Apps-Erklärung (Play Console → App-Inhalt → Gesundheits-Apps)

Kategorie: „Ernährung und Gewichtsmanagement“. Kein Medizinprodukt.

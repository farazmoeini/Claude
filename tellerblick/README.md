# Tellerblick: Kalorien und Eiweiß per Foto

Du fotografierst das Essen, die KI schätzt Gericht, Portion, Kalorien und Makros, und mit
einem Tipp ist es eingetragen. App für iOS und Android (Capacitor) mit eigenem Server in
Deutschland und Abo über die App Stores.

➡️ **Live schalten: [LAUNCH.md](LAUNCH.md)** (Schritt für Schritt, ohne Mac)

## Aufbau

```
backend/   FastAPI-Server: Konten, Tagebuch, Foto-Analyse (Claude), Abo-Prüfung (RevenueCat), Tests
web/       App-Oberfläche (HTML/JS, kein Build-Schritt). Dient auch als Web-Version
mobile/    Capacitor-Projekt: native iOS- und Android-Apps (Kamera, In-App-Käufe, Icons, Splash)
legal/     Datenschutzerklärung, Nutzungsbedingungen, Impressum (Vorlagen, ausfüllen!)
deploy/    Docker Compose mit Caddy (automatisches HTTPS) und nächtlichem Backup
store/     Store-Texte, Datenschutz-Angaben, Screenshots in allen Pflichtgrößen, Feature-Grafik
Dockerfile Server-Image
```

Cloud-Builds: `.github/workflows/tellerblick.yml` führt die Tests aus, baut und startet das
Server-Image und baut die Android-AAB sowie die iOS-App, mit Secrets auch signiert mit
Upload zu TestFlight.

## Funktionen

| Bereich | Details |
|---|---|
| **Konto** | Registrierung mit ausdrücklicher Einwilligung für Gesundheitsdaten (Art. 9 DSGVO), Login, Passwort vergessen per Mail, Abmelden auf allen Geräten |
| **Datenschutz** | Daten pro Nutzer getrennt, Fotos nur über signierte, zeitlich begrenzte Links, Datenexport (Art. 15/20), Konto löschen inkl. aller Fotos (Apple 5.1.1(v)), scrypt-Passwort-Hashes, Rate-Limits |
| **Onboarding** | Tagesziel nach Mifflin-St Jeor, Untergrenze 1.200/1.500 kcal, Eiweißziel pro kg |
| **Foto-Analyse** | Claude Vision: Komponenten, Gramm, Makros. Mengen anpassen und Komponenten abwählen. Native Kamera bzw. Galerie |
| **Eintragen** | Lebensmittel-Datenbank mit Portionen, „Zuletzt gegessen“, eigene Lebensmittel |
| **Fortschritt** | Ring und Makro-Balken, Streak, 14-Tage-Kalorien, Gewichtstrend mit 7-Tage-Durchschnitt |
| **Monetarisierung** | 3 Foto-Analysen kostenlos, dann Premium-Abo über RevenueCat (Apple/Google). Der Server prüft den Abo-Status selbst (Webhook + Cache). Fair-Use-Limit pro Tag gegen Kostenexplosion |
| **Paywall** | Erfüllt die Store-Regeln: Preis, Laufzeit, Verlängerungshinweis, Wiederherstellen, Links zu Nutzungsbedingungen und Datenschutz |

## Lokal entwickeln

```bash
cd backend
pip install -r requirements.txt
BILLING_MODE=off uvicorn app:app --port 8300     # http://localhost:8300 (alle Nutzer Premium)
python -m pytest -q                              # 14 Tests: Isolation, Löschung, Paywall, Limits …
```

Ohne `ANTHROPIC_API_KEY` ist die Foto-Analyse deaktiviert, alles andere funktioniert.

Native App lokal (braucht Android Studio bzw. Xcode):
```bash
cd mobile && npm install
TB_API_BASE=https://api.deine-domain.de npm run android   # oder: npm run ios
```

## Konfiguration (Server)

Alle Variablen mit Erklärung: [`deploy/.env.example`](deploy/.env.example).

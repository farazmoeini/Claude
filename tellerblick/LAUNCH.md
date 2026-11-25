# Tellerblick live schalten: Schritt für Schritt

Code, Server, App-Projekte, Rechtstexte, Store-Texte und Screenshots liegen fertig in
diesem Ordner. Was noch fehlt, sind Dinge, die **nur du** machen kannst: Accounts,
Verträge, deine Anschrift im Impressum. Plane etwa 2–3 Tage Arbeit plus 1–7 Tage
Wartezeit für die Store-Prüfungen ein.

## Kosten (laufend)

| Posten | Kosten |
|---|---|
| Apple Developer Program | 99 $ / Jahr |
| Google Play Developer | 25 $ einmalig |
| Server (Hetzner CX22, Deutschland) | ca. 4–5 € / Monat |
| Domain (.de) | ca. 1 € / Monat |
| KI-Analyse (Anthropic API) | pro Foto ca. 1–2 Cent mit `claude-opus-5-5`, deutlich weniger mit `claude-haiku-5-5`. Bei 40 Fotos pro Monat und Nutzer: ca. 0,40–0,80 € |
| RevenueCat | kostenlos bis 2.500 $ Monatsumsatz |
| E-Mail-Versand (Brevo) | kostenlos bis 300 Mails/Tag |

Rechne mit dem Preis: Ein Jahresabo für 39,99 € bringt nach 15 % Store-Gebühr
(Small Business Program) etwa 34 € ein. Davon gehen ca. 5–10 € an KI-Kosten pro Jahr.

---

## Schritt 1: Firma und Rechtliches (Tag 1)

1. **Gewerbe anmelden** beim Gewerbeamt (ca. 20–60 €), falls noch nicht vorhanden. Kleinunternehmerregelung ist möglich.
2. **Impressum, Datenschutz, Nutzungsbedingungen** in `legal/` ausfüllen: alle `[ECKIGEN KLAMMERN]` ersetzen.
   ⚠️ Gesundheitsdaten sind besonders geschützt. **Lass die Texte einmal von einer Anwältin oder einem Anwalt prüfen**
   (IT-Recht, ca. 150–400 €) oder nutze einen Generator mit Haftung (z. B. IT-Recht Kanzlei, eRecht24 Premium).
3. **Auftragsverarbeitungsverträge (AVV)** abschließen, jeweils online:
   - Hetzner: Konsole → Einstellungen → AVV
   - Anthropic: Data Processing Addendum (console.anthropic.com → Settings → Legal)
   - RevenueCat: DPA im Dashboard
   - Brevo: AVV im Konto

## Schritt 2: Server (Tag 1, ca. 1 Stunde)

1. Domain kaufen (z. B. bei INWX, Hetzner oder Strato), z. B. `tellerblick.de`.
2. Bei [Hetzner Cloud](https://console.hetzner.cloud) einen Server **CX22** mit **Ubuntu 24.04**, Standort Nürnberg oder Falkenstein anlegen.
3. Beim Domain-Anbieter einen DNS-**A-Record** `api.tellerblick.de` → IP-Adresse des Servers setzen.
4. Auf dem Server (per SSH):
   ```bash
   curl -fsSL https://get.docker.com | sh
   git clone https://github.com/farazmoeini/Claude.git && cd Claude/tellerblick/deploy
   cp .env.example .env && nano .env        # Werte eintragen, siehe Kommentare
   docker compose up -d --build
   curl https://api.tellerblick.de/healthz   # → {"ok":true,...}
   ```
5. **Anthropic-API-Key:** [console.anthropic.com](https://console.anthropic.com) → Billing (Guthaben aufladen,
   z. B. 20 $), dann API Keys → Key erstellen → in `.env` bei `ANTHROPIC_API_KEY` eintragen.
   Setz in der Konsole ein **Ausgabenlimit**.
6. **E-Mail:** Brevo-Konto anlegen, Absender-Domain bestätigen, SMTP-Daten in `.env` eintragen.
7. Nach Änderungen an `.env`: `docker compose up -d`.
8. **Backups:** Der Container `backup` legt jede Nacht `deploy/backups/` an. Kopiere den Ordner regelmäßig
   woandershin, z. B. auf eine Hetzner Storage Box mit `rsync`.

## Schritt 3: Store-Accounts (Tag 1, Wartezeit 1–3 Tage)

1. **Apple:** [developer.apple.com/programs](https://developer.apple.com/programs/enroll/) → als Einzelperson (99 $) oder als Firma (braucht eine D-U-N-S-Nummer, kostenlos, dauert ca. 1–2 Wochen).
   Danach in App Store Connect → Business → **Steuer- und Bankdaten** sowie die **Vereinbarung für kostenpflichtige Apps** abschließen. Ohne sie gibt es keine In-App-Käufe.
   Optional: am **App Store Small Business Program** teilnehmen (15 % statt 30 % Gebühr).
2. **Google:** [play.google.com/console](https://play.google.com/console/signup) → 25 $, Identitätsprüfung.
   Neue private Entwicklerkonten müssen vor der Veröffentlichung einen **geschlossenen Test mit mindestens 12 Testern über 14 Tage** durchführen.
   Freunde und Familie früh einladen! Unter Einstellungen → Zahlungsprofil die Bankdaten hinterlegen.

## Schritt 4: Abo-Produkte anlegen

1. **App Store Connect** → Meine Apps → „+“ → Neue App: Name „Tellerblick: Kalorien per Foto“, Bundle-ID `de.tellerblick.app`,
   Sprache Deutsch. Dann **Abonnements** → Gruppe „Premium“ → zwei Produkte:
   - `tellerblick_premium_monthly`: 6,99 €/Monat
   - `tellerblick_premium_yearly`: 39,99 €/Jahr, mit Einführungsangebot „7 Tage kostenlos“
2. **Google Play Console** → App erstellen (Paketname `de.tellerblick.app`) → Monetarisierung → Abos → die gleichen zwei Produkte mit gleichen IDs.
3. **RevenueCat** ([app.revenuecat.com](https://app.revenuecat.com)): Projekt anlegen → je eine App für iOS und Android hinzufügen
   (iOS: In-App-Purchase-Key aus App Store Connect; Android: Service-Account-JSON aus der Google Cloud, Anleitung im RevenueCat-Dashboard).
   - **Entitlement** `premium` anlegen und beiden Produkten zuordnen
   - **Offering** `default` mit den Paketen „Monthly“ und „Annual“
   - API Keys: die **öffentlichen** Keys (`appl_…`, `goog_…`) kommen in die GitHub-Secrets, der **geheime** Key (`sk_…`) in die Server-`.env`
   - Integrations → Webhooks: URL `https://api.tellerblick.de/api/billing/webhook`, Authorization-Header = Wert von `REVENUECAT_WEBHOOK_AUTH`

## Schritt 5: App bauen (ohne Mac, in der GitHub-Cloud)

GitHub → Repository → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Wert |
|---|---|
| `TB_API_BASE` | `https://api.tellerblick.de` |
| `RC_IOS_KEY` / `RC_ANDROID_KEY` | öffentliche RevenueCat-Keys |
| `SUPPORT_EMAIL` | deine Support-Adresse |
| `ANDROID_KEYSTORE_BASE64` | siehe unten |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | Passwörter und Alias deines Keystores |
| `APPLE_TEAM_ID` | developer.apple.com → Membership → Team ID |
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64` | App Store Connect → Benutzer und Zugriff → Integrationen → **API-Schlüssel** (Rolle „App Manager“), `.p8` herunterladen, dann `base64 -i AuthKey_XXX.p8` |

**Android-Keystore einmalig erzeugen** (auf deinem PC, Java nötig, oder in einer Claude-Session):
```bash
keytool -genkeypair -v -keystore tellerblick.jks -alias tellerblick -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 tellerblick.jks     # Ausgabe → Secret ANDROID_KEYSTORE_BASE64
```
⚠️ **Keystore und Passwörter sicher aufbewahren** (Passwort-Manager und Backup). Ohne sie kannst du nie wieder ein Update veröffentlichen.
Aktiviere zusätzlich „Play App Signing“ in der Play Console.

Dann: GitHub → **Actions → Tellerblick → Run workflow**, Häkchen bei „iOS-Build zu TestFlight hochladen“.
- **Android:** Unter dem Lauf → Artifacts → `tellerblick-android` → `app-release.aab` herunterladen → Play Console → Testen → Geschlossener Test → Release erstellen → AAB hochladen.
- **iOS:** Der Build landet automatisch in App Store Connect → TestFlight (nach ca. 10–30 Minuten Verarbeitung).

Bei jedem Update erhöht sich die Build-Nummer automatisch. Die Versionsnummer änderst du in
`mobile/package.json` und `mobile/android/app/build.gradle` (`versionName`) bzw. in Xcode.

## Schritt 6: Testen

1. **TestFlight** (iOS) bzw. **geschlossener Test** (Android): Registrieren, Ziel, Foto analysieren, Abo kaufen mit Sandbox- bzw. Testkonto,
   „Käufe wiederherstellen“, Konto löschen.
2. Prüfe, dass nach dem Testkauf in der App „Premium ✅“ steht und der Server den Status kennt (`/api/me` → `premium: true`).
3. Android: 14 Tage mit 12 Testern abwarten (nur bei neuen privaten Konten), dann Produktionszugriff beantragen.

## Schritt 7: Store-Einträge ausfüllen und einreichen

Alle Texte, Kategorien, Datenschutz-Angaben und Review-Hinweise stehen in `store/listing.md`:
- Screenshots: `store/screenshots/` (iOS 6,9" und 6,5", Android)
- Google-Feature-Grafik: `store/feature-graphic.png`, Icon: `store/play-icon-512.png`
- **Demo-Konto für die Prüfer** anlegen (Apple verlangt das): in der App registrieren, z. B. `review@tellerblick.de`.
  Damit es Premium hat, ohne zu kaufen, auf dem Server ausführen:
  ```bash
  docker compose exec api python -c "import db; db.run(\"UPDATE users SET premium_until='2099-01-01', premium_checked=9e12 WHERE email='review@tellerblick.de'\")"
  ```
- Einreichen → Apple prüft meist in 1–2 Tagen, Google in 1–7 Tagen.

## Häufige Ablehnungsgründe und wie die App sie schon erfüllt

| Regel | Umsetzung in Tellerblick |
|---|---|
| Apple 5.1.1(v): Konto muss in der App löschbar sein | Einstellungen → „Konto und alle Daten löschen“ |
| Apple 3.1.1: digitale Käufe nur per In-App-Kauf | RevenueCat und StoreKit, kein externer Bezahllink in der App |
| Apple 3.1.2: Abo-Infos vor dem Kauf | Preis, Laufzeit, automatische Verlängerung, Links zu Nutzungsbedingungen und Datenschutz auf der Paywall, „Käufe wiederherstellen“ |
| Apple 1.4.1 / Google Gesundheits-Richtlinie | Hinweis „kein Medizinprodukt“, Mindest-Kalorienziel, Hinweis auf ärztlichen Rat |
| Apple 5.1.1: Begründung für Kamera-Zugriff | Erklärende Texte in `Info.plist` |
| Apple 4.2: Mindestfunktionalität | Native Kamera, Käufe, eigene Funktionen, nicht nur eine Webseite |
| Datenschutz-Angaben | Vorlage in `store/listing.md` |

## Nach dem Launch

- **Kosten im Blick behalten:** Anthropic-Konsole → Usage. Bei Bedarf `TELLERBLICK_MODEL=claude-haiku-5-5` setzen und die Qualität vergleichen.
- **Server-Updates:** `cd Claude && git pull && cd tellerblick/deploy && docker compose up -d --build`
- **Bewertungen beantworten**, Feedback sammeln. Die nächsten Ausbaustufen stehen im README: Barcode-Scanner, Erinnerungen, Apple Health / Health Connect.

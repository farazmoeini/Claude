# Graph Report - Claude  (2026-11-25)

## Corpus Check
- 86 files · ~54,654 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 39 file(s) not represented in the graph (top: (none) 12, .xml 10, .webmanifest 3)

## Summary
- 830 nodes · 1534 edges · 56 communities (36 shown, 20 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f50996d6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- backend/app.py
- ui.js
- parser.js
- angebotsblitz/app.py
- pipeline.py
- test_api.py
- satzbuch-pages.yml
- drafting.py
- mobile/package.json
- app.js
- AppDelegate
- caddy
- streamcut/app.py
- Tellerblick live schalten: Schritt für Schritt
- Satzbuch: Trainings-App fürs Handy (Design)
- ExampleInstrumentedTest.java
- upload_ios
- env
- native.js
- Wettbewerbs-Analyse: Top-5 App-Ideen
- android
- with
- tellerblick.yml
- steps
- Top 5 Critical Mistakes
- Review Focus
- pdf.js
- Overload (früher Satzbuch): Trainingstagebuch fürs Handy
- PrüfFit: Lern-App für Prüfungsvorbereitung
- StreamCut: Stream-VODs automatisch zu Shorts
- Google Play
- AngebotsBlitz: Angebote und Rechnungen für Handwerker in 60 Sekunden
- satzbuch/package.json
- Anweisungen für Claude
- env
- ios
- Documentation Index
- build.mjs
- satzbuch/sw.js
- com.getcapacitor.BridgeActivity
- ARCHITECTURE_MAP.md
- .claude/CLAUDE.md
- QUICK_START.md
- lernapp/sw.js
- PackageDescription
- backup.sh
- CapApp-SPM/README.md

## God Nodes (most connected - your core abstractions)
1. `today()` - 15 edges
2. `parseZahl()` - 14 edges
3. `Satzbuch: Trainings-App fürs Handy (Design)` - 14 edges
4. `parsePlanText()` - 13 edges
5. `viewFortschritt()` - 13 edges
6. `normName()` - 13 edges
7. `one()` - 13 edges
8. `run()` - 13 edges
9. `with` - 12 edges
10. `env` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Task 4: Oberfläche, PWA, PDF- und Claude-Import` --references--> `validierePlan()`  [INFERRED]
  docs/superpowers/plans/2026-11-24-satzbuch.md → satzbuch/js/parser.js
- `Task 3: Statistik und Timer-Logik` --references--> `normName()`  [INFERRED]
  docs/superpowers/plans/2026-11-24-satzbuch.md → satzbuch/js/util.js
- `Task 3: Statistik und Timer-Logik` --references--> `restzeit()`  [INFERRED]
  docs/superpowers/plans/2026-11-24-satzbuch.md → satzbuch/js/stats.js
- `editorLesen()` --calls--> `parseZahl()`  [EXTRACTED]
  satzbuch/js/ui.js → satzbuch/js/util.js
- `test_targets_floor()` --calls--> `targets()`  [EXTRACTED]
  tellerblick/backend/test_api.py → tellerblick/backend/nutrition.py

## Import Cycles
- None detected.

## Communities (56 total, 20 thin omitted)

### Community 0 - "backend/app.py"
Cohesion: 0.05
Nodes (57): add_entries(), add_weight(), analyze(), _day(), day_view(), delete_entry(), delete_me(), DeleteMe (+49 more)

### Community 1 - "ui.js"
Cohesion: 0.06
Nodes (63): Task 3: Statistik und Timer-Logik, zieleText(), alleUebungen(), bestleistungen(), e1rm(), eintragVon(), formatDauer(), kennzahlen() (+55 more)

### Community 2 - "parser.js"
Cohesion: 0.08
Nodes (39): base64(), MODELL, PLAN_SCHEMA, planMitClaude(), UEBUNG, leseGewichtZelle(), leseSatzZelle(), leseTabellenzeile() (+31 more)

### Community 3 - "angebotsblitz/app.py"
Cohesion: 0.11
Nodes (35): add_customer(), add_price(), create_quote(), CustomerIn, dashboard(), delete_document(), delete_price(), DocIn (+27 more)

### Community 4 - "pipeline.py"
Cohesion: 0.09
Nodes (29): ai_refine(), ass_escape(), ass_time(), chat_curve(), Clip, extract_audio(), fallback_title(), find_candidates() (+21 more)

### Community 5 - "test_api.py"
Cohesion: 0.08
Nodes (18): Batch, generate(), main(), material_block(), Question, entry(), jpeg(), test_delete_account_removes_everything() (+10 more)

### Community 6 - "satzbuch-pages.yml"
Cohesion: 0.06
Nodes (39): if, needs, runs-on, steps, concurrency, cancel-in-progress, group, environment (+31 more)

### Community 7 - "drafting.py"
Cohesion: 0.12
Nodes (21): _area_from_text(), _dims(), draft(), draft_ai(), draft_rules(), _find_qty(), _norm(), _num() (+13 more)

### Community 8 - "mobile/package.json"
Cohesion: 0.08
Nodes (33): @capacitor/android, @capacitor/assets, @capacitor/browser, @capacitor/camera, @capacitor/cli, @capacitor/core, @capacitor/ios, @capacitor/splash-screen (+25 more)

### Community 9 - "app.js"
Cohesion: 0.19
Nodes (32): api(), authScreen(), boot(), chrome(), defaultMeal(), esc(), fail(), forgot() (+24 more)

### Community 10 - "AppDelegate"
Cohesion: 0.09
Nodes (4): Capacitor, AppDelegate, SceneDelegate, UIKit

### Community 11 - "caddy"
Cohesion: 0.08
Nodes (23): build, env_file, expose, restart, volumes, entrypoint, image, restart (+15 more)

### Community 12 - "streamcut/app.py"
Cohesion: 0.14
Nodes (8): create_job(), get_job(), list_jobs(), load_existing(), media(), save(), worker(), report()

### Community 13 - "Tellerblick live schalten: Schritt für Schritt"
Cohesion: 0.11
Nodes (16): Häufige Ablehnungsgründe und wie die App sie schon erfüllt, Kosten (laufend), Nach dem Launch, Schritt 1: Firma und Rechtliches (Tag 1), Schritt 2: Server (Tag 1, ca. 1 Stunde), Schritt 3: Store-Accounts (Tag 1, Wartezeit 1–3 Tage), Schritt 4: Abo-Produkte anlegen, Schritt 5: App bauen (ohne Mac, in der GitHub-Cloud) (+8 more)

### Community 14 - "Satzbuch: Trainings-App fürs Handy (Design)"
Cohesion: 0.13
Nodes (14): Absicht und Warum, Ansätze, Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft), Bildschirme, Datenmodell, Dem Builder überlassen, Geklärt, Nicht-Ziele (+6 more)

### Community 16 - "upload_ios"
Cohesion: 0.17
Nodes (12): upload_ios, on, pull_request, push, workflow_dispatch, paths, branches, paths (+4 more)

### Community 17 - "env"
Cohesion: 0.18
Nodes (11): ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD, ANDROID_KEYSTORE_PASSWORD, APPLE_TEAM_ID, ASC_ISSUER_ID, ASC_KEY_ID, ASC_KEY_P8_BASE64, KS (+3 more)

### Community 18 - "native.js"
Cohesion: 0.24
Nodes (5): b64ToBlob(), getPackages(), initPurchases(), purchasesAvailable(), takePhoto()

### Community 19 - "Wettbewerbs-Analyse: Top-5 App-Ideen"
Cohesion: 0.20
Nodes (8): 1. KI-Clipping für Streamer, 2. KI-Angebots- und Rechnungstool für Handwerker, 3. Lern-App für Prüfungsvorbereitung (Nische), 4. Fitness: Kalorien zählen per Foto, 5. Creator-Tool: Hook- und Titel-Generator mit Analyse, Reihenfolge beim Bauen, Wettbewerbs-Analyse: Top-5 App-Ideen, Money Apps

### Community 20 - "android"
Cohesion: 0.20
Nodes (10): defaults, needs, runs-on, defaults, runs-on, run, defaults, android (+2 more)

### Community 21 - "with"
Cohesion: 0.20
Nodes (10): with, cache, cache-dependency-path, distribution, if-no-files-found, java-version, name, node-version (+2 more)

### Community 22 - "tellerblick.yml"
Cohesion: 0.22
Nodes (8): concurrency, cancel-in-progress, group, needs, runs-on, jobs, docker, name

### Community 23 - "steps"
Cohesion: 0.44
Nodes (9): steps, steps, steps, steps, if, name, run, uses (+1 more)

### Community 24 - "Top 5 Critical Mistakes"
Cohesion: 0.25
Nodes (7): 1. [Add Your First Critical Mistake], 2. [Add Second Mistake], 3. [Add Third Mistake], 4. [Add Fourth Mistake], 5. [Add Fifth Mistake], Common Mistakes, Top 5 Critical Mistakes

### Community 25 - "Review Focus"
Cohesion: 0.25
Nodes (7): Global Constraints, Review Focus, Satzbuch Implementation Plan, Task 1: Plan-Parser, Task 2: Speicher und Sicherung, Task 4: Oberfläche, PWA, PDF- und Claude-Import, Task 5: Veröffentlichen und Doku

### Community 26 - "pdf.js"
Cohesion: 0.36
Nodes (7): lade(), PDFJS_URL, PDFJS_VERSION, PDFJS_WORKER_URL, pdfZuText(), stueckeZuZeilen(), zeileAlsText()

### Community 27 - "Overload (früher Satzbuch): Trainingstagebuch fürs Handy"
Cohesion: 0.25
Nodes (7): Aufbau, Funktionen, Installieren (Android), Lokal starten und testen, Overload (früher Satzbuch): Trainingstagebuch fürs Handy, Plan aus PDF: drei Wege, Planformat (`plans/*.json`)

### Community 28 - "PrüfFit: Lern-App für Prüfungsvorbereitung"
Cohesion: 0.29
Nodes (6): Funktionen, Katalog-Format, Neuen Katalog erzeugen, PrüfFit: Lern-App für Prüfungsvorbereitung, Starten, Weg zum Geld

### Community 29 - "StreamCut: Stream-VODs automatisch zu Shorts"
Cohesion: 0.29
Nodes (6): Aufbau, Funktionen (MVP), Geschwindigkeit, Nächste Schritte zum verkaufbaren Produkt, Starten, StreamCut: Stream-VODs automatisch zu Shorts

### Community 30 - "Google Play"
Cohesion: 0.29
Nodes (6): App-Datenschutz („Nutrition Labels“) in App Store Connect, App Store (Apple), Datensicherheit (Data Safety), Gesundheits-Apps-Erklärung (Play Console → App-Inhalt → Gesundheits-Apps), Google Play, Store-Einträge Tellerblick (Deutsch)

### Community 31 - "AngebotsBlitz: Angebote und Rechnungen für Handwerker in 60 Sekunden"
Cohesion: 0.33
Nodes (5): AngebotsBlitz: Angebote und Rechnungen für Handwerker in 60 Sekunden, Funktionen, Rechtlicher Hinweis, Starten, Weg zum Geld

### Community 32 - "satzbuch/package.json"
Cohesion: 0.33
Nodes (5): name, private, scripts, test, type

### Community 33 - "Anweisungen für Claude"
Cohesion: 0.40
Nodes (4): Anrede, Anweisungen für Claude, graphify, Session Start Protocol ⚡

### Community 34 - "env"
Cohesion: 0.40
Nodes (5): env, RC_ANDROID_KEY, RC_IOS_KEY, SUPPORT_EMAIL, TB_API_BASE

### Community 35 - "ios"
Cohesion: 0.40
Nodes (5): HAS_SIGNING, env, needs, runs-on, ios

### Community 36 - "Documentation Index"
Cohesion: 0.50
Nodes (3): Documentation Index, Session Start (Essential - ~800 tokens), Task-Specific Topics (Load As Needed)

## Knowledge Gaps
- **1 isolated node(s):** `PackageDescription`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 327 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `jobs` connect `tellerblick.yml` to `ios`, `android`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `today()` (e.g. with `tab()` and `fail()`) actually correct?**
  _`today()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `PackageDescription` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `backend/app.py` be split into smaller, more focused modules?**
  _Cohesion score 0.051515151515151514 - nodes in this community are weakly interconnected._
- **Why does `normName()` connect `parser.js` to `ui.js`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Should `ui.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06298904538341157 - nodes in this community are weakly interconnected._
- **Why does `Review Focus` connect `Review Focus` to `ui.js`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
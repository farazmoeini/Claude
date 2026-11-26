# Common Mistakes

**⚠️ CRITICAL - Read at session start**

---

## Top 5 Critical Mistakes

### 1. Overload (`satzbuch/`): Änderung ist online, aber nicht auf dem Handy

**Symptom**: Nutzer sieht trotz Veröffentlichung die alte Version (z. B. kein Update-Hinweis, alte Zurück-Taste).
**Check**: Einstellungen ganz unten zeigen „Overload · Version N“; `APP_VERSION` in `js/ui.js` und `VERSION` in `sw.js` vergleichen.
**Fix**: Bei jeder Veröffentlichung **beide** Nummern erhöhen. Der Service Worker lädt App-Dateien „Netz zuerst“ (`cache: "no-cache"`) und precacht mit `cache: "reload"` – nie auf „Cache zuerst“ zurückbauen. Nutzer: App ganz schließen, bis zu 3× neu öffnen.

### 2. GitHub Pages: „No artifacts named github-pages“ / Deploy hängt

**Symptom**: Workflow `satzbuch-pages.yml` scheitert zufällig im Schritt `deploy-pages`.
**Check**: Log zeigt „Found 0 artifact(s)“ direkt nach erfolgreichem Upload.
**Fix**: Upload (`build`) und `deploy` bleiben **getrennte Jobs** (`needs: build`). Fehlgeschlagene Läufe nicht per „Re-run failed jobs“ wiederholen (doppelte Artefakte), sondern neuen Lauf per `workflow_dispatch` starten. Nach jedem Merge den Lauf aktiv prüfen statt nur zu warten.

### 3. Playwright-Tests, die echtes Browserverhalten nicht abbilden

**Symptom**: Test grün, beim Nutzer kaputt (oder umgekehrt).
**Check**: Benachrichtigungen → `Notification.permission` ist im Headless-Shell immer „denied“. Zurück-Taste → `page.goBack()` umgeht Chromes Browser-Logik.
**Fix**: Für Benachrichtigungen `chromium.launch({ channel: "chromium" })`. Für die echte Zurück-Taste Maus-„back“ über CDP (`Input.dispatchMouseEvent`, `button: "back"`). Testskripte im Scratchpad, nicht im Repo.

### 4. Persönliche Daten des Nutzers ins öffentliche Repo

**Symptom**: Trainingspläne (mit Gewichten) landen in `satzbuch/plans/` – das Repo und die Seite sind öffentlich.
**Check**: Vor jedem Commit von Plan-Dateien: Hat der Nutzer ausdrücklich „öffentlich“ bestätigt?
**Fix**: Sonst Pläne nur als Datei im Chat schicken. Tests nutzen ausgedachte Übungen/Werte, nie die echten PDFs.

### 5. Gespeicherte Nutzerdaten beim Umbau verlieren

**Symptom**: Nach Update fehlen Pläne/Trainings, oder Trainings hängen an keinem Plan mehr.
**Check**: Speicherschlüssel `satzbuch.v1` und URL `/satzbuch/` unverändert? Plan- und Tages-IDs erhalten?
**Fix**: Nie Speicherschlüssel oder Pfad umbenennen. Pläne über `store.ersetzePlan` / `store.planZusammenfuehren` austauschen (behalten IDs, hängen Trainings um), mitgelieferte Pläne über `version` in `plans/index.json` aktualisieren.

---

**Last Updated**: 2026-11-26

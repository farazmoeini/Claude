// Oberfläche von Overload (früher Satzbuch). Ein Zustand (store), Ansichten als HTML-Strings,
// Ereignisse per data-a="aktion" an einer zentralen Stelle.
import { createStore } from "./store.js";
import { parsePlanText, validierePlan, parseZiele, zieleText } from "./parser.js";
import { uid, parseZahl, normName, verschiebe, hinweisTeile, aehnlicherPlan } from "./util.js";
import * as S from "./stats.js";
const IMPORT_ACCEPT = ".pdf,.docx,.xlsx,.csv,.tsv,.txt,.md,.json,image/*,application/pdf";

const store = createStore();
const $ = (sel, el = document) => el.querySelector(sel);
const ansicht = $("#ansicht");
const dialog = $("#dialog");
const timerEl = $("#timer");
let tab = "heute";
let fortschrittUebung = null;
let fortschrittBlock = "alle";
// Läuft ein Training, kann man mit „Zurück“ zu „Heute“ wechseln; das Training läuft weiter.
let trainingSichtbar = true;
const imTrainingAnsicht = () => !!store.aktiv && trainingSichtbar;
// Bei jeder Veröffentlichung erhöhen (gleich wie VERSION in sw.js), damit man auf dem Handy sieht, welche Version läuft.
const APP_VERSION = 20;
let planUpdates = []; // mitgelieferte Pläne, die neuer sind als die gespeicherte Version

let updatePruefungLaeuft = false;
async function pruefePlanUpdates() {
  if (updatePruefungLaeuft) return;
  updatePruefungLaeuft = true;
  try {
    const liste = await (await fetch("plans/index.json", { cache: "no-cache" })).json();
    planUpdates = [];
    const automatisch = [];
    for (const e of liste) {
      if (!e.id) continue;
      // Gespeicherten Plan über die ID finden, sonst über den Namen (z. B. per PDF oder Datei angelegt).
      const namen = [e.name, ...(e.namen || [])].map(normName);
      const treffer = store.state.plaene.filter((x) => x.id === e.id || namen.includes(normName(x.name)));
      const haupt = treffer.find((x) => x.id === e.id) || treffer[0];
      const neuer = !haupt || (e.version || 1) > (haupt.version || 1);
      if (e.automatisch) {
        // Vom Besitzer gewünschter Austausch: einmal pro Version automatisch, alte/doppelte Pläne zusammenführen
        const schon = store.state.planImporte?.[e.id] >= (e.version || 1);
        if (schon || !store.state.plaene.length || (!neuer && treffer.length < 2)) continue;
        const plan = await (await fetch("plans/" + e.datei, { cache: "no-cache" })).json();
        const neu = haupt && neuer ? store.ersetzePlan(haupt.id, plan) : haupt || store.setPlan(plan, { aktivSetzen: false });
        for (const d of treffer) if (d.id !== neu.id) store.planZusammenfuehren(neu.id, d.id);
        store.state.planImporte = { ...store.state.planImporte, [e.id]: e.version || 1 };
        store.save();
        automatisch.push(`„${neu.name}“ ist jetzt auf Version ${e.version || 1}`);
      } else if (haupt && neuer) planUpdates.push({ ...e, altId: haupt.id });
    }
    if (automatisch.length) {
      if (!imTrainingAnsicht()) render();
      toast(automatisch.join(" · ") + ".", 5000);
    } else if (planUpdates.length && !imTrainingAnsicht() && tab === "heute") render();
  } catch { /* offline: später erneut */ } finally { updatePruefungLaeuft = false; }
}
let editorEntwurf = null;
let editorStart = null; // Stand beim Öffnen des Editors (für „ungespeicherte Änderungen?“)
let timerGemeldet = false;
let verstecktSeit = null; // seit wann die App nicht sichtbar ist (null = sichtbar)
let gemeldeterTimer = ""; // zuletzt an den Hintergrund-Dienst gemeldeter Timer

// ---------- Helfer ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const kgText = (kg) => (kg == null ? "–" : String(Math.round(kg * 100) / 100).replace(".", ","));
const zahl = (n) => Math.round(n).toLocaleString("de-DE");
const datum = (ts, opt = { weekday: "short", day: "2-digit", month: "2-digit" }) => new Date(ts).toLocaleDateString("de-DE", opt);
const tageHer = (ts) => {
  const h = new Date(); h.setHours(0, 0, 0, 0);
  const t = new Date(ts); t.setHours(0, 0, 0, 0);
  const diff = Math.round((h - t) / 864e5);
  if (diff <= 0) return "heute";
  if (diff === 1) return "gestern";
  return diff < 14 ? `vor ${diff} Tagen` : datum(ts);
};

function toast(text, ms = 3200) {
  const t = $("#toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), ms);
}

function dateiWaehlen(accept) {
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = accept;
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
}

function herunterladen(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function oeffneDialog(titel, inhalt, { schliessenText = "Schließen" } = {}) {
  dialog.innerHTML = `<div class="dlg-kopf"><h2>${esc(titel)}</h2><button class="btn klein-btn" data-a="dialog-zu">${esc(schliessenText)}</button></div><div class="dlg-inhalt">${inhalt}</div>`;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  historieSync();
}
function schliesseDialog() {
  if (dialog.open) dialog.close();
  editorEntwurf = null;
  editorStart = null;
  historieSync();
}
/** Darf das Fenster ohne Rückfrage zu? Im Plan-Editor mit ungespeicherten Änderungen wird gefragt. */
function dialogDarfSchliessen() {
  if (!editorEntwurf || editorStart === null) return true;
  editorLesen();
  return JSON.stringify(editorEntwurf) === editorStart || confirm("Änderungen am Plan verwerfen?");
}
dialog.addEventListener("click", (e) => { if (e.target === dialog && dialogDarfSchliessen()) schliesseDialog(); });
// Zurück-Geste/Esc schließt ein offenes Fenster direkt (Android: „CloseWatcher“)
dialog.addEventListener("cancel", (e) => { if (!dialogDarfSchliessen()) e.preventDefault(); });
dialog.addEventListener("close", () => { editorEntwurf = null; editorStart = null; historieSync(); });

// ---------- Zurück-Taste (Android) ----------
// Solange etwas „offen“ ist (Training, Fenster, anderer Bereich als „Heute“), liegt ein eigener
// Eintrag im Verlauf. Die Zurück-Taste landet dann hier, statt die App zu schließen.
let ignorierePop = 0;
if ("scrollRestoration" in history) history.scrollRestoration = "manual"; // nach „Zurück“ oben beginnen
function historieSync() {
  const tief = imTrainingAnsicht() || tab !== "heute" || dialog.open;
  const istTief = history.state?.overload === "tief";
  if (tief && !istTief) history.pushState({ overload: "tief" }, "");
  else if (!tief && istTief) { ignorierePop++; history.back(); }
}
window.addEventListener("popstate", () => {
  if (ignorierePop) { ignorierePop--; return; }
  if (dialog.open) {
    if (dialogDarfSchliessen()) schliesseDialog();
  } else if (imTrainingAnsicht()) {
    // Zurück im Training: zu „Heute“, das Training läuft weiter
    trainingSichtbar = false;
    tab = "heute";
    render();
    window.scrollTo(0, 0);
  } else if (tab !== "heute") {
    tab = "heute";
    render();
    window.scrollTo(0, 0);
  }
  historieSync();
});

// ---------- Ton, Vibration, Bildschirm ----------
let audio = null;
function audioBereit() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
  } catch { /* kein Ton verfügbar */ }
}
// Pausen-Ende: 4 kräftige Pieptöne + langer hoher Schlusston (~2,5 s), über einen Begrenzer
// auf volle Lautstärke gebracht. Wie laut es wird, bestimmt die Medienlautstärke des Handys.
function signal() {
  if (navigator.vibrate) navigator.vibrate([500, 150, 500, 150, 900]);
  if (!store.state.einstellungen.ton || !audio) return;
  if (audio.state !== "running") {
    // angehalten (App war im Hintergrund, Anruf, andere App): erst fortsetzen, dann abspielen
    audio.resume().then(() => audio.state === "running" && spieleSignal()).catch(() => {});
    return;
  }
  spieleSignal();
}
function spieleSignal() {
  const t0 = audio.currentTime + 0.02;
  const begrenzer = audio.createDynamicsCompressor();
  begrenzer.threshold.value = -6;
  begrenzer.ratio.value = 12;
  const gesamt = audio.createGain();
  gesamt.gain.value = 0.55; // 55 % der vollen Lautstärke
  begrenzer.connect(gesamt).connect(audio.destination);
  const toene = [
    { ab: 0.0, dauer: 0.28, hz: 880 },
    { ab: 0.4, dauer: 0.28, hz: 880 },
    { ab: 0.8, dauer: 0.28, hz: 880 },
    { ab: 1.2, dauer: 0.28, hz: 880 },
    { ab: 1.6, dauer: 0.9, hz: 1320 },
  ];
  for (const t of toene) {
    for (const [typ, anteil, faktor] of [["square", 0.55, 1], ["sine", 0.45, 2]]) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = typ;
      o.frequency.value = t.hz * faktor;
      g.gain.setValueAtTime(0.0001, t0 + t.ab);
      g.gain.exponentialRampToValueAtTime(anteil, t0 + t.ab + 0.015);
      g.gain.setValueAtTime(anteil, t0 + t.ab + t.dauer - 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + t.ab + t.dauer);
      o.connect(g).connect(begrenzer);
      o.start(t0 + t.ab);
      o.stop(t0 + t.ab + t.dauer + 0.02);
    }
  }
}
let wakeLock = null;
async function bildschirmAn(an) {
  try {
    if (an && !wakeLock && "wakeLock" in navigator && document.visibilityState === "visible") {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => (wakeLock = null));
    } else if (!an && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* nicht unterstützt */ }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    if (audio) audioBereit();
    bildschirmAn(!!store.aktiv);
    tick();
    verstecktSeit = null;
    // Zurück in der App: liegengebliebene Pausen-Benachrichtigungen wegräumen
    navigator.serviceWorker?.ready.then((reg) => reg.getNotifications()).then((liste) => liste?.forEach((n) => n.tag.startsWith("pause") && n.close())).catch(() => {});
    pruefePlanUpdates();
  } else verstecktSeit = Date.now();
});

function zielAbweichung(s) {
  if (!s.ziel) return false;
  const [lo, hi] = String(s.ziel.wdh).match(/\d+/g)?.map(Number) ?? [];
  const wdhOk = lo == null || s.wdh == null || (s.wdh >= lo && s.wdh <= (hi ?? lo));
  const kgOk = s.ziel.kg == null || s.kg === s.ziel.kg;
  return !(wdhOk && kgOk);
}

// ---------- Benachrichtigung am Pausenende (über den Service Worker) ----------
const kannBenachrichtigen = () => "Notification" in window && "serviceWorker" in navigator;
const benachrichtigungAn = () => kannBenachrichtigen() && store.state.einstellungen.benachrichtigung !== false && Notification.permission === "granted";

async function benachrichtigungErlauben() {
  if (!kannBenachrichtigen() || store.state.einstellungen.benachrichtigung === false) return;
  if (Notification.permission === "default") {
    const r = await Notification.requestPermission().catch(() => "denied");
    if (r !== "granted") toast("Ohne Erlaubnis kommt bei ausgeschaltetem Bildschirm kein Pausen-Alarm. Ändern: Einstellungen.", 5000);
  }
}

/** Den laufenden Timer (oder dass keiner läuft) an den Hintergrund-Dienst melden – nur bei Änderung. */
function timerAnDienst() {
  if (!kannBenachrichtigen()) return;
  const t = store.aktiv?.timer;
  const an = t && benachrichtigungAn() && t.endetUm > Date.now();
  const timer = an ? { endetUm: t.endetUm, text: S.pausenText(store.aktiv) } : null;
  const schluessel = timer ? `${timer.endetUm}|${timer.text}` : "";
  if (schluessel === gemeldeterTimer) return;
  gemeldeterTimer = schluessel;
  navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ typ: "timer", timer })).catch(() => {});
}

/** Hat der Dienst für dieses Pausenende schon benachrichtigt? */
async function schonBenachrichtigt(endetUm) {
  try {
    const r = await (await caches.open("overload-status")).match("gemeldet");
    return r ? Number(await r.text()) === endetUm : false;
  } catch { return false; }
}

function saetzeText(aktiv) {
  const n = aktiv.eintraege.reduce((summe, e) => summe + e.saetze.filter((x) => x.erledigtUm).length, 0);
  return n === 1 ? "1 Satz" : `${n} Sätze`;
}

// ---------- Import (alle Dateiarten) ----------
let importErgebnis = null; // { plan, datei, art, weg, aehnlich }

async function importiereDatei(datei, { mitClaude = false } = {}) {
  const apiKey = store.state.einstellungen.apiKey;
  oeffneDialog("Plan wird gelesen", `<p class="import-laden"><span class="lade"></span> ${esc(datei.name || "Datei")}</p><p class="klein">${mitClaude ? "Claude liest den Plan, das dauert meist 20–60 Sekunden." : "Einen Moment."}</p>`);
  try {
    let ergebnis;
    if (mitClaude) {
      const { planMitClaude } = await import("./claude.js");
      ergebnis = { plan: { ...(await planMitClaude(datei, apiKey)), id: uid() }, art: "claude", weg: "von Claude gelesen" };
    } else {
      const { dateiZuPlan } = await import("./import.js");
      ergebnis = await dateiZuPlan(datei, { apiKey });
    }
    importErgebnis = { ...ergebnis, datei, aehnlich: aehnlicherPlan(ergebnis.plan.name, store.state.plaene) };
    zeigeImportVorschau();
  } catch (err) {
    oeffneDialog("Plan nicht erkannt", `<p>${esc(err.message)}</p>${err.rat ? `<p class="dezent">${esc(err.rat)}</p>` : ""}
      <div class="btn-reihe"><button class="btn" data-a="import-datei">Andere Datei wählen</button></div>`);
  }
}

function zeigeImportVorschau() {
  const { plan, weg, aehnlich, art } = importErgebnis;
  const uebungen = plan.tage.reduce((n, t) => n + t.uebungen.length, 0);
  const unsicher = plan.tage.reduce((n, t) => n + t.uebungen.filter((u) => u.pruefen).length, 0);
  const mitGewicht = plan.tage.reduce((n, t) => n + t.uebungen.filter((u) => u.gewicht != null || u.ziele?.some((z) => z.kg != null) || u.wochen?.length).length, 0);
  const eckdaten = [`${plan.tage.length} ${plan.tage.length === 1 ? "Tag" : "Tage"}`, `${uebungen} Übungen`, mitGewicht ? `${mitGewicht} mit Gewicht` : "", plan.wochen > 1 ? `${plan.wochen}-Wochen-Block` : ""].filter(Boolean).join(", ");
  const claudeMoeglich = store.state.einstellungen.apiKey && !/Claude/.test(weg) && ["pdf", "bild"].includes(art);
  oeffneDialog("Plan erkannt", `
    <p class="dezent">${esc(eckdaten)}, ${esc(weg)}.</p>
    <label class="feldname" for="import-name">Name</label>
    <input id="import-name" class="text-feld" value="${esc(aehnlich ? aehnlich.name : plan.name)}">
    <ol class="import-tage">${plan.tage.map((t) => `<li><strong>${esc(t.name)}</strong><span>${esc(t.uebungen.map((u) => u.name).slice(0, 4).join(", "))}${t.uebungen.length > 4 ? ` und ${t.uebungen.length - 4} weitere` : ""}</span></li>`).join("")}</ol>
    ${unsicher ? `<p class="pruefen">${unsicher} ${unsicher === 1 ? "Übung" : "Übungen"} ohne erkannte Sätze. Unter „Anpassen“ prüfen.</p>` : ""}
    ${aehnlich ? `<label class="schalter"><span>Ersetzt deinen Plan „${esc(aehnlich.name)}“. Trainings und Fortschritt bleiben erhalten.</span><input type="checkbox" id="import-ersetzen" checked></label>` : ""}
    <div class="btn-reihe"><button class="btn primaer" data-a="import-speichern">Speichern</button><button class="btn" data-a="import-anpassen">Anpassen</button></div>
    ${claudeMoeglich ? `<p><button class="link-btn" data-a="import-claude-genauer">Mit Claude genauer lesen</button></p>` : ""}`, { schliessenText: "Abbrechen" });
}

// Über „Teilen → Overload“ angekommene Datei (der Service Worker legt sie bereit)
async function geteilteDateiImportieren() {
  if (!new URLSearchParams(location.search).has("teilen")) return;
  history.replaceState(history.state, "", location.pathname);
  try {
    const cache = await caches.open("overload-teilen");
    const r = await cache.match("datei");
    if (!r) { toast("Die geteilte Datei ist nicht angekommen. Versuch es noch einmal."); return; }
    await cache.delete("datei");
    const name = decodeURIComponent(r.headers.get("x-name") || "geteilt");
    const datei = new File([await r.blob()], name, { type: r.headers.get("content-type") || "" });
    importiereDatei(datei);
  } catch { toast("Die geteilte Datei konnte nicht geöffnet werden."); }
}

// ---------- Ansichten ----------
function render() {
  const imTraining = imTrainingAnsicht();
  document.body.classList.toggle("im-training", imTraining);
  $("#titel").textContent = imTraining ? store.aktiv.tagName : { heute: "Overload", verlauf: "Verlauf", fortschritt: "Fortschritt", plaene: "Pläne" }[tab];
  for (const b of document.querySelectorAll(".leiste button")) {
    if (b.dataset.tab === tab) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  ansicht.innerHTML = imTraining ? viewTraining() : { heute: viewHeute, verlauf: viewVerlauf, fortschritt: viewFortschritt, plaene: viewPlaene }[tab]();
  if (!imTraining && tab === "fortschritt") chartInteraktion();
  bildschirmAn(!!store.aktiv); // Bildschirm an, solange ein Training läuft (auch auf „Heute“)
  historieSync();
  tick();
}

function sicherungsHinweis() {
  const { letzteSicherung } = store.state.einstellungen;
  const n = store.state.trainings.length;
  const alt = letzteSicherung ? Date.now() - letzteSicherung > 30 * 864e5 : n >= 3;
  if (!alt || !n) return "";
  const text = letzteSicherung ? `Letzte Sicherung ${tageHer(letzteSicherung)}` : "Deine Trainings sind noch nicht gesichert";
  return `<div class="hinweis-zeile"><span>${esc(text)}</span><button class="link-btn" data-a="export">Jetzt sichern</button></div>`;
}

const RE_TAG_KURZ = /^(mo|di|mi|do|fr|sa|so)(?:\s*[–:.-]\s*|\s+)(.*)$/i;

function blockHTML(plan, tr) {
  const eigene = tr.filter((t) => t.planId === plan.id);
  const letztes = eigene[eigene.length - 1];
  const letzterJeTag = (tagId) => [...eigene].reverse().find((t) => t.tagId === tagId);
  const naechster = (() => {
    if (!letztes) return plan.tage[0]?.id;
    const i = plan.tage.findIndex((t) => t.id === letztes.tagId);
    return plan.tage[(i + 1) % plan.tage.length]?.id;
  })();
  const aktuelleWoche = store.planWoche(plan.id);
  return `<section class="block" aria-label="${esc(plan.name)}">
    <header class="block-kopf"><h2>${esc(plan.name)}</h2>
      ${plan.wochen > 1 ? `<div class="wochen" role="group" aria-label="Blockwoche von ${esc(plan.name)}">${Array.from({ length: plan.wochen }, (_, i) => `<button class="chip" data-a="woche" data-plan="${plan.id}" data-w="${i + 1}" aria-pressed="${aktuelleWoche === i + 1}" aria-label="Woche ${i + 1}">W${i + 1}</button>`).join("")}</div>` : ""}
    </header>
    <ol class="tage">${plan.tage.map((t, i) => {
      const l = letzterJeTag(t.id);
      const m = t.name.match(RE_TAG_KURZ);
      const kurz = m ? m[1][0].toUpperCase() + m[1][1].toLowerCase() : String(i + 1);
      const titel = m && m[2] ? m[2] : t.name;
      const meta = [`${t.uebungen.length} Übungen`, l ? `zuletzt ${tageHer(l.start)}` : ""].filter(Boolean).join(", ");
      return `<li><button class="tag-zeile${t.id === naechster ? " naechster" : ""}" data-a="start" data-plan="${plan.id}" data-tag="${t.id}">
        <span class="tag-kurz" aria-hidden="true">${esc(kurz)}</span>
        <span class="tag-text"><strong>${esc(titel)}</strong><span>${esc(meta)}</span></span>
        ${t.id === naechster ? `<span class="naechster-hinweis">als Nächstes</span>` : ""}
      </button></li>`;
    }).join("")}</ol>
  </section>`;
}

function wochenLeisteHTML(tr) {
  const tage = S.wochenTage(tr);
  const n = S.trainingsDieseWoche(tr);
  const letztes = tr[tr.length - 1];
  const satz = `${n === 1 ? "1 Training" : `${n} Trainings`} diese Woche${letztes ? `, zuletzt ${tageHer(letztes.start)}` : ""}`;
  return `<section class="woche-leiste" aria-label="${esc(satz)}">
    <ol>${tage.map((t) => `<li class="${t.trainiert ? "ja" : ""}${t.heute ? " heute" : ""}${t.vorbei && !t.trainiert ? " vorbei" : ""}"><span>${t.kurz}</span><i aria-hidden="true"></i></li>`).join("")}</ol>
    <p>${esc(satz)}</p>
  </section>`;
}

function viewHeute() {
  const tr = store.state.trainings;
  const plaene = [...store.state.plaene].sort((a, b) => (b.id === store.state.aktiverPlanId) - (a.id === store.state.aktiverPlanId));
  if (!plaene.length) {
    return `<div class="karte willkommen"><h2>Leg deinen Plan an</h2><p class="dezent">Übernimm „Kompakt“ und „Kraft“ mit einem Tipp, hol einen Plan aus einer Datei (PDF, Word, Excel) oder bau dir selbst einen.</p>
      <div class="btn-reihe"><button class="btn primaer voll" data-a="eigene-plaene">Kompakt + Kraft übernehmen</button></div>
      <div class="btn-reihe"><button class="btn" data-a="import-datei">Plan aus Datei</button><button class="btn" data-a="plan-neu">Selbst anlegen</button></div></div>`;
  }
  return `
    ${wochenLeisteHTML(tr)}
    ${store.aktiv ? `<section class="laufend" aria-label="Laufendes Training"><div><strong>${esc(store.aktiv.tagName)}</strong>
      <span class="dezent">läuft seit <span id="dauer">0:00</span>, ${saetzeText(store.aktiv)}</span></div>
      <button class="btn primaer" data-a="fortsetzen">Fortsetzen</button></section>` : ""}
    ${sicherungsHinweis()}
    ${planUpdates.map((e) => `<div class="hinweis-zeile akzent"><span>Neue Version von „${esc(store.plan(e.altId)?.name || e.name)}“. Deine Trainings bleiben erhalten.</span><button class="link-btn" data-a="plan-update" data-datei="${esc(e.datei)}">Übernehmen</button></div>`).join("")}
    ${plaene.map((p) => blockHTML(p, tr)).join("")}`;
}

function viewTraining() {
  const a = store.aktiv;
  return `
    <div class="tr-kopf"><div class="tr-status"><span class="tr-uhr" id="dauer">0:00</span><span class="dezent">${a.woche ? `Woche ${a.woche}, ` : ""}${saetzeText(a)}</span></div>
      <div class="zeile"><button class="btn klein-btn" data-a="abbrechen">Verwerfen</button><button class="btn primaer klein-btn" data-a="beenden">Beenden</button></div></div>
    ${a.eintraege.map((e, ei) => {
      const letzteBlock = store.letzteSaetze(e.uebungName, a.planId);
      const letzte = letzteBlock ?? store.letzteSaetze(e.uebungName);
      const hinweise = hinweisTeile(e.notiz);
      const vorgabe = [e.zielWdh ? `${e.saetze.length} × ${e.zielWdh}` : "", `Pause ${S.formatDauer(e.pause)}`].filter(Boolean).join(", ");
      return `<section class="uebung${e.saetze.every((x) => x.erledigtUm) ? " fertig" : ""}">
        <header class="ue-kopf">
          <div><h3>${esc(e.uebungName)}</h3><p class="ue-vorgabe">${esc(vorgabe)}</p></div>
          <details class="mehr">
            <summary aria-label="Weitere Aktionen für ${esc(e.uebungName)}">⋯</summary>
            <div class="mehr-menue">
              <button data-a="satz-plus" data-e="${ei}">Satz hinzufügen</button>
              <button data-a="satz-minus" data-e="${ei}">Letzten Satz entfernen</button>
              <button data-a="pause-aendern" data-e="${ei}">Pause ändern</button>
              <button class="gefahr" data-a="uebung-weg" data-e="${ei}">Übung entfernen</button>
            </div>
          </details>
        </header>
        ${hinweise.length ? `<ul class="hinweise">${hinweise.map((h) => `<li>${h.stichwort ? `<b>${esc(h.stichwort)}</b> ` : ""}${esc(h.text)}</li>`).join("")}</ul>` : ""}
        ${letzte ? `<p class="letztes">Letztes Mal${letzteBlock ? "" : " (anderer Block)"} <span>${letzte.map((x) => `${kgText(x.kg)}×${x.wdh ?? "–"}`).join("  ")}</span></p>` : ""}
        <ol class="saetze">
        ${e.saetze.map((x, si) => `<li class="${x.erledigtUm ? "erledigt" : ""}">
          <span class="satz-nr">${si + 1}${zielAbweichung(x) ? `<span class="ziel">Ziel ${esc(x.ziel.wdh)}${x.ziel.kg != null ? ` @${kgText(x.ziel.kg)}` : ""}</span>` : ""}</span>
          <label class="feld-huelle" data-einheit="kg"><input class="feld" inputmode="decimal" enterkeyhint="next" aria-label="Gewicht Satz ${si + 1} in kg" data-satz="${ei}:${si}" data-f="kg" value="${x.kg == null ? "" : kgText(x.kg)}" placeholder="–"></label>
          <label class="feld-huelle" data-einheit="Wdh."><input class="feld" inputmode="numeric" enterkeyhint="done" aria-label="Wiederholungen Satz ${si + 1}" data-satz="${ei}:${si}" data-f="wdh" value="${x.wdh ?? ""}" placeholder="–"></label>
          <button class="haken" data-a="haken" data-e="${ei}" data-s="${si}" aria-label="Satz ${si + 1} ${x.erledigtUm ? "zurücksetzen" : "abhaken"}">✓</button>
        </li>`).join("")}
        </ol>
      </section>`;
    }).join("")}
    <button class="btn-leise voll" data-a="uebung-plus">+ Übung hinzufügen</button>`;
}

function viewVerlauf() {
  const tr = [...store.state.trainings].reverse();
  if (!tr.length) return `<div class="leer">Noch keine Trainings. Starte eins unter „Heute“.</div>`;
  return tr.map((t) => {
    const z = S.zusammenfassung(t);
    return `<button class="liste-eintrag" data-a="training-zeigen" data-id="${t.id}">
      <div class="zeile zwischen"><strong>${esc(t.tagName || "Training")}</strong><span class="klein">${esc(datum(t.start))}</span></div>
      <div class="klein">${esc(store.plan(t.planId)?.name || "")}${t.woche ? ` · Woche ${t.woche}` : ""}</div>
      <div class="dezent">${z.dauerMin} min · ${z.saetze} Sätze · ${zahl(z.volumen)} kg bewegt${z.oPause != null ? " · Ø Pause " + S.formatDauer(z.oPause) : ""}</div></button>`;
  }).join("");
}

function viewFortschritt() {
  const bloecke = store.state.plaene.filter((p) => store.state.trainings.some((t) => t.planId === p.id));
  if (fortschrittBlock !== "alle" && !bloecke.some((p) => p.id === fortschrittBlock)) fortschrittBlock = "alle";
  const tr = fortschrittBlock === "alle" ? store.state.trainings : store.state.trainings.filter((t) => t.planId === fortschrittBlock);
  const namen = S.alleUebungen(tr);
  if (!namen.length) return `<div class="leer">Hier siehst du deinen Fortschritt, sobald du ein Training abgeschlossen hast.</div>`;
  const blockWahl = bloecke.length > 1 ? `<div class="wochen" role="group" aria-label="Block"><span class="dezent">Block</span>${[{ id: "alle", name: "Alle" }, ...bloecke].map((p) => `<button class="chip breit-chip" data-a="fortschritt-block" data-plan="${p.id}" aria-pressed="${fortschrittBlock === p.id}">${esc(p.name)}</button>`).join("")}</div>` : "";
  if (!fortschrittUebung || !namen.some((n) => normName(n) === normName(fortschrittUebung))) {
    // Vorauswahl: zuerst eine Langhantel-Übung mit Gewicht, sonst irgendeine mit Gewicht
    const mitGewicht = namen.filter((n) => S.verlauf(tr, n).some((x) => x.maxKg > 0));
    const anzahl = (n) => S.verlauf(tr, n).length;
    const sortiert = [...mitGewicht].sort((a, b) => anzahl(b) - anzahl(a) || S.istLanghantel(b) - S.istLanghantel(a));
    fortschrittUebung = sortiert.find((n) => S.istLanghantel(n) && anzahl(n) > 1) ?? sortiert[0] ?? namen[0];
  }
  const v = S.verlauf(tr, fortschrittUebung);
  const b = S.bestleistungen(tr, fortschrittUebung);
  const pause = S.oPauseUebung(tr, fortschrittUebung);
  const ersterE1rm = v[0]?.e1rm || 0, letzterE1rm = v[v.length - 1]?.e1rm || 0;
  const delta = ersterE1rm ? Math.round(((letzterE1rm - ersterE1rm) / ersterE1rm) * 100) : 0;
  return `
    ${blockWahl}
    <label class="feldname" for="uebung-wahl">Übung</label>
    <select id="uebung-wahl" class="text-feld" data-a-change="fortschritt-wahl">${namen.map((n) => `<option ${normName(n) === normName(fortschrittUebung) ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
    <div class="kacheln">
      <div class="kachel"><div class="wert">${b?.maxKg ? kgText(b.maxKg) + " kg" : "–"}</div><div class="bez">Schwerstes Gewicht</div></div>
      <div class="kachel"><div class="wert">${b?.maxE1rm ? kgText(Math.round(b.maxE1rm * 2) / 2) + " kg" : "–"}</div><div class="bez">Bestes geschätztes 1RM</div></div>
      <div class="kachel"><div class="wert">${v.length > 1 ? (delta >= 0 ? "+" : "") + delta + " %" : "–"}</div><div class="bez">1RM seit dem ersten Training</div></div>
      <div class="kachel"><div class="wert">${S.formatDauer(pause)}</div><div class="bez">Ø Pause zwischen Sätzen</div></div>
    </div>
    ${diagramm(v)}
    <p class="abschnitt">Alle Einheiten</p>
    <table class="tabelle"><thead><tr><th>Datum</th><th>Schwerster Satz</th><th>1RM ≈</th><th>Volumen</th></tr></thead><tbody>
    ${[...v].reverse().map((x) => `<tr><td>${esc(datum(x.datum, { day: "2-digit", month: "2-digit", year: "2-digit" }))}</td><td>${kgText(x.maxKg)} kg</td><td>${kgText(Math.round(x.e1rm * 2) / 2)}</td><td>${zahl(x.volumen)}</td></tr>`).join("")}
    </tbody></table>`;
}

// Linien-Diagramm: geschätztes 1RM und schwerstes Gewicht je Training, eine Achse (kg).
function diagramm(v) {
  if (v.length < 2) return `<div class="chart-box"><p class="dezent" style="padding:12px">Ab zwei Trainings mit dieser Übung siehst du hier die Kurve.</p></div>`;
  if (!v.some((x) => x.maxKg > 0)) return `<div class="chart-box"><p class="dezent" style="padding:12px">Diese Übung machst du ohne Gewicht, darum gibt es keine Kurve. Deine Sätze und Wiederholungen findest du im Verlauf.</p></div>`;
  const W = 340, H = 190, L = 34, R = 44, O = 12, U = 24;
  const werte = v.flatMap((x) => [x.e1rm, x.maxKg]).filter((x) => x > 0);
  let min = Math.min(...werte), max = Math.max(...werte);
  const rand = Math.max(2.5, (max - min) * 0.15);
  const roh = (max - min + 2 * rand) / 4;
  const p10 = 10 ** Math.floor(Math.log10(roh));
  const schritt = [1, 2, 2.5, 5, 10].map((f) => f * p10).find((s) => s >= roh);
  min = Math.max(0, Math.floor((min - rand) / schritt) * schritt);
  max = Math.ceil((max + rand) / schritt) * schritt;
  const t0 = v[0].datum, t1 = v[v.length - 1].datum;
  const x = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R);
  const y = (k) => O + (1 - (k - min) / (max - min || 1)) * (H - O - U);
  const linie = (key) => v.map((p, i) => `${i ? "L" : "M"}${x(p.datum).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
  const gitter = [];
  for (let g = min; g <= max + 1e-9; g += schritt) gitter.push(g);
  const marken = (key, farbe) => v.map((p) => `<circle cx="${x(p.datum).toFixed(1)}" cy="${y(p[key]).toFixed(1)}" r="4" fill="${farbe}" stroke="var(--chart-flaeche)" stroke-width="2"/>`).join("");
  const letzt = v[v.length - 1];
  let ye = y(letzt.e1rm), ym = y(letzt.maxKg);
  if (Math.abs(ye - ym) < 14) { const m = (ye + ym) / 2; ye = m - 7; ym = m + 7; }
  diagramm.daten = { v, x, y, W, H };
  return `<div class="chart-box" id="chart">
    <div class="legende"><span><i style="background:var(--serie-1)"></i>Geschätztes 1RM</span><span><i style="background:var(--serie-2)"></i>Schwerstes Gewicht</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf von ${esc(fortschrittUebung)}: geschätztes 1RM und schwerstes Gewicht pro Training">
      ${gitter.map((g) => `<line x1="${L}" x2="${W - R}" y1="${y(g).toFixed(1)}" y2="${y(g).toFixed(1)}" stroke="var(--linie)" stroke-width="1"/><text x="${L - 6}" y="${(y(g) + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--text-3)">${kgText(g)}</text>`).join("")}
      <text x="${L}" y="${H - 6}" font-size="10" fill="var(--text-3)">${esc(datum(t0, { day: "2-digit", month: "2-digit" }))}</text>
      <text x="${W - R}" y="${H - 6}" font-size="10" text-anchor="end" fill="var(--text-3)">${esc(datum(t1, { day: "2-digit", month: "2-digit" }))}</text>
      <path d="${linie("maxKg")}" fill="none" stroke="var(--serie-2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="${linie("e1rm")}" fill="none" stroke="var(--serie-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${marken("maxKg", "var(--serie-2)")}${marken("e1rm", "var(--serie-1)")}
      <text x="${W - R + 6}" y="${(ye + 4).toFixed(1)}" font-size="11" fill="var(--text)">${kgText(Math.round(letzt.e1rm * 2) / 2)}</text>
      <text x="${W - R + 6}" y="${(ym + 4).toFixed(1)}" font-size="11" fill="var(--text-2)">${kgText(letzt.maxKg)}</text>
      <line id="fadenkreuz" y1="${O}" y2="${H - U}" stroke="var(--text-3)" stroke-width="1" visibility="hidden"/>
      <rect x="0" y="0" width="${W}" height="${H}" fill="transparent" id="chart-flaeche"/>
    </svg><div class="tooltip" id="tooltip" hidden></div></div>`;
}

function chartInteraktion() {
  const box = $("#chart"), flaeche = $("#chart-flaeche");
  if (!box || !flaeche || !diagramm.daten) return;
  const { v, x, W } = diagramm.daten;
  const tip = $("#tooltip"), kreuz = $("#fadenkreuz");
  const zeigen = (ev) => {
    const svg = box.querySelector("svg").getBoundingClientRect();
    const px = ((ev.clientX - svg.left) / svg.width) * W;
    let best = v[0];
    for (const p of v) if (Math.abs(x(p.datum) - px) < Math.abs(x(best.datum) - px)) best = p;
    const bx = x(best.datum);
    kreuz.setAttribute("x1", bx); kreuz.setAttribute("x2", bx); kreuz.setAttribute("visibility", "visible");
    tip.hidden = false;
    tip.innerHTML = `<strong>${esc(datum(best.datum))}</strong><br>1RM ≈ ${kgText(Math.round(best.e1rm * 2) / 2)} kg<br>Schwerster Satz ${kgText(best.maxKg)} kg`;
    const left = Math.min(Math.max((bx / W) * svg.width + (svg.left - box.getBoundingClientRect().left), 70), box.clientWidth - 70);
    tip.style.left = left + "px";
    tip.style.top = "40px";
  };
  flaeche.addEventListener("pointerdown", zeigen);
  flaeche.addEventListener("pointermove", zeigen);
  flaeche.addEventListener("pointerleave", () => { tip.hidden = true; kreuz.setAttribute("visibility", "hidden"); });
}

function viewPlaene() {
  const hatKey = !!store.state.einstellungen.apiKey;
  return `
    ${store.state.plaene.length ? "" : `<div class="leer">Noch kein Plan. Importiere dein PDF oder leg selbst einen an.</div>`}
    ${store.state.plaene.length ? `<ul class="plan-liste">${store.state.plaene.map((p) => `<li>
      <div class="plan-info"><strong>${esc(p.name)}</strong>
        <span>${p.tage.length} Tage, ${p.tage.reduce((n, t) => n + t.uebungen.length, 0)} Übungen${p.wochen > 1 ? `, ${p.wochen}-Wochen-Block` : ""}</span></div>
      <button class="btn klein-btn" data-a="plan-bearbeiten" data-id="${p.id}">Bearbeiten</button>
      <details class="mehr">
        <summary aria-label="Weitere Aktionen für ${esc(p.name)}">⋯</summary>
        <div class="mehr-menue">
          ${p.id === store.state.aktiverPlanId ? "" : `<button data-a="plan-aktiv" data-id="${p.id}">Oben auf Heute zeigen</button>`}
          <button data-a="plan-export" data-id="${p.id}">Als Datei teilen</button>
          <button class="gefahr" data-a="plan-loeschen" data-id="${p.id}">Plan löschen</button>
        </div>
      </details>
    </li>`).join("")}</ul>` : ""}
    <h2 class="abschnitt-titel">Plan hinzufügen</h2>
    <ul class="aktions-liste">
      <li><button data-a="import-datei"><strong>Plan importieren</strong><span>PDF, Word, Excel, CSV, Text${hatKey ? " oder Foto" : ""}. Du siehst vorher, was erkannt wurde.</span></button></li>
      <li><button data-a="mitgeliefert"><strong>Mitgelieferte Pläne</strong><span>Kompakt, Kraft und ein Beispiel</span></button></li>
      <li><button data-a="plan-neu"><strong>Selbst anlegen</strong><span>Leerer Plan im Editor</span></button></li>
    </ul>
    <p class="klein teilen-tipp">Tipp: In WhatsApp, Gmail oder der Dateien-App „Teilen“ antippen und Overload wählen. Der Plan landet direkt hier.</p>`;
}

// ---------- Plan-Editor (auch Import-Vorschau) ----------
function editorHTML() {
  const p = editorEntwurf;
  const pruefAnzahl = p.tage.reduce((n, t) => n + t.uebungen.filter((u) => u.pruefen).length, 0);
  return `
    ${p.hinweis ? `<p class="dezent">${esc(p.hinweis)}</p>` : ""}
    ${pruefAnzahl ? `<p class="pruefen">⚠ ${pruefAnzahl} Übung(en) ohne erkannte Sätze/Wdh. – bitte prüfen.</p>` : ""}
    <label class="feldname" for="plan-name">Name des Plans</label>
    <input id="plan-name" class="text-feld" data-ed="name" value="${esc(p.name)}">
    ${p.tage.map((t, ti) => `<div class="edit-tag">
      <div class="zeile"><input class="text-feld" aria-label="Name des Trainingstags" data-ed="tag" data-t="${ti}" value="${esc(t.name)}"><button class="icon-btn" data-a="ed-tag-weg" data-t="${ti}" aria-label="Tag löschen">✕</button></div>
      ${t.uebungen.map((u, ui) => `<div class="edit-uebung">
        <input class="text-feld name-feld" aria-label="Übung" placeholder="Übung" data-ed="u" data-t="${ti}" data-u="${ui}" data-f="name" value="${esc(u.name)}" ${u.pruefen ? 'style="border-color:#fbbf24"' : ""}>
        <span class="verschieben">
          <button data-a="ed-u-schieben" data-t="${ti}" data-u="${ui}" data-r="-1" aria-label="${esc(u.name || "Übung")} nach oben" ${ui === 0 ? "disabled" : ""}>↑</button>
          <button data-a="ed-u-schieben" data-t="${ti}" data-u="${ui}" data-r="1" aria-label="${esc(u.name || "Übung")} nach unten" ${ui === t.uebungen.length - 1 ? "disabled" : ""}>↓</button>
        </span>
        <button data-a="ed-u-weg" data-t="${ti}" data-u="${ui}" aria-label="Übung löschen">✕</button>
        ${u.wochen?.length ? `<p class="klein breit">Sätze, Wdh. und kg kommen aus den Blockwochen.</p>` : `
        <label>Sätze<input class="text-feld" inputmode="numeric" data-ed="u" data-t="${ti}" data-u="${ui}" data-f="saetze" value="${esc(u.saetze)}"></label>
        <label>Wdh.<input class="text-feld" data-ed="u" data-t="${ti}" data-u="${ui}" data-f="wdh" value="${esc(u.wdh)}"></label>
        <label>kg<input class="text-feld" inputmode="decimal" data-ed="u" data-t="${ti}" data-u="${ui}" data-f="gewicht" value="${u.gewicht == null ? "" : kgText(u.gewicht)}"></label>
        `}
        <label>Pause (s)<input class="text-feld" inputmode="numeric" data-ed="u" data-t="${ti}" data-u="${ui}" data-f="pause" value="${esc(u.pause)}"></label>
        <details class="breit" ${u.ziele?.length || u.wochen?.length || u._zieleRoh || u._wochenRoh ? "open" : ""}><summary class="klein">Notiz, Ziel je Satz${p.wochen > 1 || u.wochen?.length ? ", Blockwochen" : ""}${u.notiz ? " (Notiz vorhanden)" : ""}</summary>
        <label class="breit">Notiz (im Training sichtbar, Punkte „ · “ trennen Zeilen)<input class="text-feld" data-ed="u" data-t="${ti}" data-u="${ui}" data-f="notiz" value="${esc(u.notiz || "")}"></label>
        <label class="breit">Ziel je Satz (optional)<input class="text-feld" data-ed="u" data-t="${ti}" data-u="${ui}" data-f="ziele" placeholder="z. B. 4-5@34p210 / 2x8@28" value="${esc(u._zieleRoh ?? zieleText(u.ziele))}"></label>
${p.wochen > 1 || u.wochen?.length ? `        <label class="breit">Blockwochen (eine Zeile pro Woche, optional)<textarea class="text-feld" rows="${Math.max(2, u.wochen?.length || p.wochen || 2)}" data-ed="u" data-t="${ti}" data-u="${ui}" data-f="wochen" placeholder="3x3@97,5 / 5@82,5">${esc(u._wochenRoh ?? (u.wochen || []).map(zieleText).join("\n"))}</textarea></label>` : ""}</details>
      </div>`).join("")}
      <button class="btn klein-btn" data-a="ed-u-plus" data-t="${ti}">+ Übung</button>
    </div>`).join("")}
    <button class="btn voll" data-a="ed-tag-plus">+ Trainingstag</button>
    <div class="btn-reihe"><button class="btn primaer voll" data-a="ed-speichern">Plan speichern</button></div>`;
}
function editorLesen() {
  if (!editorEntwurf) return;
  for (const el of dialog.querySelectorAll("[data-ed]")) {
    const { ed, t, u, f } = el.dataset;
    if (ed === "name") editorEntwurf.name = el.value;
    else if (ed === "tag") editorEntwurf.tage[t].name = el.value;
    else if (ed === "u") {
      const ue = editorEntwurf.tage[t].uebungen[u];
      if (f === "name") { if (el.value !== ue.name) delete ue.pruefen; ue.name = el.value; }
      else if (f === "wdh") ue.wdh = el.value.trim();
      else if (f === "gewicht") ue.gewicht = el.value.trim() ? parseZahl(el.value) ?? undefined : undefined;
      else if (f === "ziele") ue._zieleRoh = el.value;
      else if (f === "wochen") ue._wochenRoh = el.value;
      else if (f === "notiz") ue.notiz = el.value.trim();
      else { const n = parseZahl(el.value); if (n && n > 0) ue[f] = Math.round(n); }
      if (f === "saetze" || f === "wdh") delete ue.pruefen;
    }
  }
}
function oeffneEditor(plan, titel = "Plan bearbeiten") {
  editorEntwurf = JSON.parse(JSON.stringify(plan));
  oeffneDialog(titel, editorHTML(), { schliessenText: "Abbrechen" });
  editorLesen(); // Felder einmal einlesen, damit der Vergleich nur echte Änderungen sieht
  editorStart = JSON.stringify(editorEntwurf);
}
function editorNeuZeichnen() {
  const top = dialog.scrollTop;
  dialog.querySelector(".dlg-inhalt").innerHTML = editorHTML();
  dialog.scrollTop = top;
}

// ---------- Aktionen ----------
const aktionen = {
  tab: (d) => { tab = d.tab; render(); window.scrollTo(0, 0); },
  "dialog-zu": () => schliesseDialog(),

  start: (d) => {
    audioBereit();
    benachrichtigungErlauben();
    const a = store.aktiv;
    if (a && a.planId === d.plan && a.tagId === d.tag) { aktionen.fortsetzen(); return; }
    if (a && !confirm(`Es läuft noch „${a.tagName}“. Dieses Training verwerfen und „${store.plan(d.plan)?.tage.find((t) => t.id === d.tag)?.name || "neues Training"}“ starten?`)) return;
    if (a) store.abbrechenTraining();
    store.state.aktiverPlanId = d.plan;
    store.starteTraining(d.plan, d.tag);
    timerGemeldet = false;
    trainingSichtbar = true;
    render();
    window.scrollTo(0, 0);
  },
  fortsetzen: () => {
    audioBereit();
    trainingSichtbar = true;
    render();
    window.scrollTo(0, 0);
  },
  haken: (d) => {
    audioBereit();
    const e = +d.e, s = +d.s;
    const satz = store.aktiv.eintraege[e].saetze[s];
    if (satz.erledigtUm) { store.satzZuruecksetzen(e, s); render(); return; }
    store.satzAbhaken(e, s);
    const eintrag = store.aktiv.eintraege[e];
    store.starteTimer(eintrag.saetze[s].pause || eintrag.pause || store.state.einstellungen.pause);
    timerGemeldet = false;
    render();
  },
  "satz-plus": (d) => { store.satzHinzufuegen(+d.e); render(); },
  "satz-minus": (d) => { const e = store.aktiv.eintraege[+d.e]; store.satzEntfernen(+d.e, e.saetze.length - 1); render(); },
  "uebung-weg": (d) => { if (confirm(`„${store.aktiv.eintraege[+d.e].uebungName}“ aus diesem Training entfernen?`)) { store.uebungEntfernen(+d.e); render(); } },
  "uebung-plus": () => {
    const name = prompt("Name der Übung:");
    if (name?.trim()) { store.uebungHinzufuegen(name.trim()); render(); window.scrollTo(0, document.body.scrollHeight); }
  },
  "pause-aendern": (d) => {
    const e = store.aktiv.eintraege[+d.e];
    const w = prompt("Pause in Sekunden:", e.pause);
    const n = parseZahl(w);
    if (n && n > 0) { e.pause = Math.round(n); e.saetze.forEach((x) => (x.pause = null)); store.save(); render(); }
  },
  "timer-plus": () => { store.verschiebeTimer(15); timerGemeldet = false; tick(); },
  "timer-minus": () => { store.verschiebeTimer(-15); tick(); },
  "timer-stopp": () => { store.stoppeTimer(); tick(); },
  abbrechen: () => {
    if (confirm("Training verwerfen? Nichts davon wird gespeichert.")) { store.abbrechenTraining(); trainingSichtbar = true; render(); }
  },
  beenden: () => {
    const offen = store.aktiv.eintraege.some((e) => e.saetze.some((s) => !s.erledigtUm));
    if (offen && !confirm("Noch nicht alle Sätze abgehakt. Trotzdem beenden? Nicht abgehakte Sätze werden nicht gespeichert.")) return;
    const fertig = store.beendeTraining();
    trainingSichtbar = true;
    tab = "heute";
    render();
    if (!fertig) { toast("Kein Satz abgehakt, Training nicht gespeichert."); return; }
    const z = S.zusammenfassung(fertig);
    const prs = S.neuePRs(store.state.trainings, fertig);
    const prNamen = fertig.eintraege.filter((e) => prs.includes(normName(e.uebungName))).map((e) => e.uebungName);
    oeffneDialog("Training gespeichert", `
      <div class="kacheln">
        <div class="kachel"><div class="wert">${z.dauerMin} min</div><div class="bez">Dauer</div></div>
        <div class="kachel"><div class="wert">${z.saetze}</div><div class="bez">Sätze</div></div>
        <div class="kachel"><div class="wert">${zahl(z.volumen)}</div><div class="bez">kg bewegt</div></div>
        <div class="kachel"><div class="wert">${S.formatDauer(z.oPause)}</div><div class="bez">Ø Pause</div></div>
      </div>
      ${prNamen.length ? `<p class="pr">Neue Bestleistung: ${prNamen.map(esc).join(", ")}</p>` : ""}
      <button class="btn primaer voll" data-a="dialog-zu">Fertig</button>`);
  },

  "training-zeigen": (d) => {
    const t = store.state.trainings.find((x) => x.id === d.id);
    if (!t) return;
    const z = S.zusammenfassung(t);
    oeffneDialog(t.tagName || "Training", `
      <p class="dezent">${esc(datum(t.start, { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}${t.woche ? ` · Woche ${t.woche}` : ""} · ${z.dauerMin} min · Ø Pause ${S.formatDauer(z.oPause)}</p>
      ${t.eintraege.map((e, ei) => `<div class="karte"><h3>${esc(e.uebungName)}</h3>
        <table class="saetze"><thead><tr><th>#</th><th>kg</th><th>Wdh.</th><th>Pause davor</th></tr></thead><tbody>
        ${e.saetze.map((s, si) => `<tr><td>${si + 1}</td>
          <td><input class="feld" inputmode="decimal" data-alt="${ei}:${si}" data-f="kg" value="${s.kg == null ? "" : kgText(s.kg)}" aria-label="Gewicht"></td>
          <td><input class="feld" inputmode="numeric" data-alt="${ei}:${si}" data-f="wdh" value="${s.wdh ?? ""}" aria-label="Wiederholungen"></td>
          <td class="klein">${S.formatDauer(s.pauseVorher)}</td></tr>`).join("")}
        </tbody></table></div>`).join("")}
      <div class="btn-reihe"><button class="btn primaer" data-a="training-speichern" data-id="${t.id}">Änderungen speichern</button><button class="btn gefahr" data-a="training-loeschen" data-id="${t.id}">Löschen</button></div>`);
  },
  "training-speichern": (d) => {
    const t = JSON.parse(JSON.stringify(store.state.trainings.find((x) => x.id === d.id)));
    for (const el of dialog.querySelectorAll("[data-alt]")) {
      const [ei, si] = el.dataset.alt.split(":").map(Number);
      t.eintraege[ei].saetze[si][el.dataset.f] = el.value.trim() ? parseZahl(el.value) : null;
    }
    store.ersetzeTraining(t);
    schliesseDialog();
    render();
    toast("Gespeichert.");
  },
  "training-loeschen": (d) => {
    if (!confirm("Dieses Training endgültig löschen?")) return;
    store.loescheTraining(d.id);
    schliesseDialog();
    render();
  },

  "plan-update": async (d) => {
    try {
      const eintrag = planUpdates.find((e) => e.datei === d.datei);
      const plan = store.ersetzePlan(eintrag?.altId, await (await fetch("plans/" + d.datei, { cache: "no-cache" })).json());
      planUpdates = planUpdates.filter((e) => e.datei !== d.datei);
      render();
      toast(`„${plan.name}“ ist jetzt auf Version ${plan.version || 1}.`);
    } catch (err) {
      toast("Update fehlgeschlagen: " + err.message);
    }
  },
  "fortschritt-block": (d) => { fortschrittBlock = d.plan; render(); },
  woche: (d) => { store.setzePlanWoche(d.plan, +d.w); render(); },
  "eigene-plaene": async () => {
    try {
      for (const datei of ["kompakt.json", "kraft.json"]) {
        const plan = validierePlan(await (await fetch("plans/" + datei, { cache: "no-cache" })).json());
        store.setPlan(plan, { aktivSetzen: false });
      }
      render();
      toast("„Kompakt“ und „Kraft“ übernommen.");
    } catch (err) {
      toast("Pläne konnten nicht geladen werden: " + err.message);
    }
  },
  "plan-aktiv": (d) => { store.state.aktiverPlanId = d.id; store.save(); render(); toast("Steht jetzt oben auf Heute."); },
  "plan-bearbeiten": (d) => oeffneEditor(store.plan(d.id)),
  "plan-loeschen": (d) => {
    const p = store.plan(d.id);
    if (confirm(`Plan „${p.name}“ löschen? Deine Trainings bleiben erhalten.`)) { store.loeschePlan(d.id); render(); }
  },
  "plan-export": async (d) => {
    const p = store.plan(d.id);
    const text = JSON.stringify(p, null, 1);
    const datei = new File([text], `${p.name.replace(/[^\wäöüÄÖÜß-]+/g, "-")}.json`, { type: "application/json" });
    if (navigator.canShare?.({ files: [datei] })) {
      try { await navigator.share({ files: [datei], title: p.name }); return; } catch { /* abgebrochen */ }
    }
    herunterladen(datei.name, text);
  },
  "plan-neu": () => oeffneEditor({ id: uid(), name: "Mein Plan", quelle: "manuell", tage: [{ id: uid(), name: "Tag A", uebungen: [{ id: uid(), name: "", saetze: 3, wdh: "10", pause: store.state.einstellungen.pause }] }] }, "Neuer Plan"),
  "import-datei": async () => {
    const datei = await dateiWaehlen(IMPORT_ACCEPT);
    if (datei) importiereDatei(datei);
  },
  "import-pdf": () => aktionen["import-datei"](),
  "import-json": () => aktionen["import-datei"](),
  "import-claude": async () => {
    if (!store.state.einstellungen.apiKey) { aktionen.einstellungen(); toast("Trag zuerst deinen Claude-API-Schlüssel ein."); return; }
    const datei = await dateiWaehlen("application/pdf,.pdf,image/jpeg,image/png,image/webp");
    if (datei) importiereDatei(datei, { mitClaude: true });
  },
  "import-claude-genauer": () => { if (importErgebnis?.datei) importiereDatei(importErgebnis.datei, { mitClaude: true }); },
  "import-speichern": () => {
    if (!importErgebnis) return;
    const plan = { ...importErgebnis.plan, name: ($("#import-name")?.value || importErgebnis.plan.name).trim() || importErgebnis.plan.name };
    const ersetzen = $("#import-ersetzen")?.checked && importErgebnis.aehnlich;
    try {
      if (ersetzen) { store.ersetzePlan(importErgebnis.aehnlich.id, plan); store.state.aktiverPlanId = importErgebnis.aehnlich.id; store.save(); }
      else store.setPlan(plan);
    } catch (err) { toast(err.message, 5000); return; }
    importErgebnis = null;
    schliesseDialog();
    tab = "heute";
    render();
    window.scrollTo(0, 0);
    toast(ersetzen ? `„${plan.name}“ ersetzt. Deine Trainings sind erhalten.` : `„${plan.name}“ gespeichert.`);
  },
  "import-anpassen": () => {
    if (!importErgebnis) return;
    const plan = { ...importErgebnis.plan, name: ($("#import-name")?.value || importErgebnis.plan.name).trim() };
    if ($("#import-ersetzen")?.checked && importErgebnis.aehnlich) plan._ersetzeId = importErgebnis.aehnlich.id;
    importErgebnis = null;
    oeffneEditor(plan, "Import anpassen");
  },
  mitgeliefert: async () => {
    try {
      const liste = await (await fetch("plans/index.json", { cache: "no-cache" })).json();
      oeffneDialog("Mitgelieferte Pläne", liste.map((p) => `<button class="liste-eintrag" data-a="mitgeliefert-laden" data-datei="${esc(p.datei)}"><strong>${esc(p.name)}</strong><div class="dezent">${esc(p.beschreibung || "")}</div></button>`).join("") || `<p class="dezent">Noch keine.</p>`);
    } catch {
      toast("Liste konnte nicht geladen werden.");
    }
  },
  "mitgeliefert-laden": async (d) => {
    try {
      const plan = validierePlan(await (await fetch("plans/" + d.datei, { cache: "no-cache" })).json());
      const vorhanden = store.state.plaene.find((p) => p.id === plan.id);
      if (vorhanden) plan.hinweis = "Diesen Plan hast du schon. Speichern ersetzt ihn, deine Trainings bleiben erhalten.";
      oeffneEditor(plan, "Plan übernehmen");
    } catch (err) {
      toast("Plan konnte nicht geladen werden: " + err.message);
    }
  },
  "ed-tag-plus": () => { editorLesen(); editorEntwurf.tage.push({ id: uid(), name: `Tag ${String.fromCharCode(65 + editorEntwurf.tage.length)}`, uebungen: [] }); editorNeuZeichnen(); },
  "ed-tag-weg": (d) => { editorLesen(); if (confirm("Diesen Trainingstag löschen?")) { editorEntwurf.tage.splice(+d.t, 1); editorNeuZeichnen(); } },
  "ed-u-plus": (d) => { editorLesen(); editorEntwurf.tage[+d.t].uebungen.push({ id: uid(), name: "", saetze: 3, wdh: "10", pause: store.state.einstellungen.pause }); editorNeuZeichnen(); dialog.querySelectorAll(`[data-t="${d.t}"][data-f="name"]`).forEach((el, i, all) => i === all.length - 1 && el.focus()); },
  "ed-u-schieben": (d) => {
    editorLesen();
    const tag = editorEntwurf.tage[+d.t];
    tag.uebungen = verschiebe(tag.uebungen, +d.u, +d.r);
    editorNeuZeichnen();
    // Fokus auf dem Pfeil der verschobenen Übung lassen, damit man mehrfach tippen kann
    const ziel = +d.u + +d.r;
    dialog.querySelector(`[data-a="ed-u-schieben"][data-t="${d.t}"][data-u="${ziel}"][data-r="${d.r}"]:not([disabled])`)?.focus();
  },
  "ed-u-weg": (d) => { editorLesen(); editorEntwurf.tage[+d.t].uebungen.splice(+d.u, 1); editorNeuZeichnen(); },
  "ed-speichern": () => {
    editorLesen();
    const p = editorEntwurf;
    p.tage.forEach((t) => (t.uebungen = t.uebungen.filter((u) => u.name.trim())));
    try {
      for (const t of p.tage) for (const u of t.uebungen) {
        if (u._zieleRoh !== undefined) { const z = parseZiele(u._zieleRoh); if (z.length) u.ziele = z; else delete u.ziele; delete u._zieleRoh; }
        if (u._wochenRoh !== undefined) {
          const w = u._wochenRoh.split("\n").map((z) => z.trim()).filter(Boolean).map(parseZiele);
          if (w.length) u.wochen = w; else delete u.wochen;
          delete u._wochenRoh;
        }
        if (!u.notiz) delete u.notiz;
      }
    } catch (err) { toast(err.message, 5000); return; }
    p.tage = p.tage.filter((t) => t.uebungen.length);
    if (!p.tage.length) { toast("Der Plan braucht mindestens eine Übung."); return; }
    delete p.hinweis;
    const ersetzeId = p._ersetzeId;
    delete p._ersetzeId;
    try {
      if (ersetzeId && store.plan(ersetzeId)) { store.ersetzePlan(ersetzeId, p); store.state.aktiverPlanId = ersetzeId; store.save(); }
      else store.setPlan(p);
    } catch (err) { toast(err.message, 5000); return; }
    schliesseDialog();
    tab = "heute";
    render();
    toast(`„${p.name}“ gespeichert und aktiv.`);
  },

  einstellungen: async () => {
    const e = store.state.einstellungen;
    const dauerhaft = (await navigator.storage?.persisted?.()) ?? false;
    oeffneDialog("Einstellungen", `
      <label class="feldname" for="e-pause">Standard-Pause (Sekunden)</label>
      <input id="e-pause" class="text-feld" inputmode="numeric" value="${e.pause}" data-einst="pause">
      <label class="schalter"><span>Ton am Ende der Pause</span><input type="checkbox" data-einst="ton" ${e.ton ? "checked" : ""}></label>
      ${kannBenachrichtigen() ? `<label class="schalter"><span>Benachrichtigung, wenn die Pause bei ausgeschaltetem Bildschirm endet</span><input type="checkbox" data-einst="benachrichtigung" ${e.benachrichtigung !== false ? "checked" : ""}></label>
      ${e.benachrichtigung !== false && Notification.permission === "denied" ? `<p class="klein pruefen">Benachrichtigungen sind für diese App blockiert. Erlauben: Chrome → ⋮ → Einstellungen → Website-Einstellungen → Benachrichtigungen.</p>` : ""}` : ""}
      <p class="klein">Zu leise? Die Lautstärke kommt von der Medienlautstärke des Handys (Lautstärketaste drücken, dann den Regler „Medien“ hochziehen).</p>
      <p class="abschnitt">Sicherung</p>
      <p class="dezent">Deine Daten liegen nur auf diesem Handy${dauerhaft ? " (vor automatischem Löschen geschützt)" : ""}. ${e.letzteSicherung ? "Letzte Sicherung: " + esc(datum(e.letzteSicherung, { day: "2-digit", month: "2-digit", year: "numeric" })) : "Noch keine Sicherung."}</p>
      <div class="btn-reihe"><button class="btn" data-a="export">Sicherung speichern</button><button class="btn" data-a="import-sicherung">Sicherung laden</button></div>
      <p class="abschnitt">Claude (optional)</p>
      <label class="feldname" for="e-key">API-Schlüssel für den Plan-Import mit Claude</label>
      <input id="e-key" class="text-feld" type="password" autocomplete="off" placeholder="sk-ant-…" value="${esc(e.apiKey)}" data-einst="apiKey">
      <p class="klein">Bleibt nur auf diesem Handy und wird nur an api.anthropic.com geschickt. Nicht Teil der Sicherung.</p>
      <p class="abschnitt">Daten</p>
      <button class="btn gefahr voll" data-a="alles-loeschen">Alle Daten löschen</button>
      <p class="klein" style="margin-top:16px">Overload · Version ${APP_VERSION}</p>`);
  },
  export: () => {
    const name = `overload-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
    herunterladen(name, store.exportJSON());
    toast("Sicherung gespeichert (Downloads).");
    if (!imTrainingAnsicht() && !dialog.open) render();
  },
  "import-sicherung": async () => {
    const file = await dateiWaehlen("application/json,.json");
    if (!file) return;
    if (!confirm("Sicherung laden? Alle aktuellen Daten auf diesem Handy werden ersetzt.")) return;
    try {
      store.importJSON(await file.text());
      schliesseDialog();
      render();
      toast("Sicherung geladen.");
    } catch (err) {
      toast("Konnte nicht geladen werden: " + err.message);
    }
  },
  "alles-loeschen": () => {
    if (!confirm("Wirklich ALLE Pläne und Trainings löschen?")) return;
    if (!confirm("Ganz sicher? Das lässt sich nicht rückgängig machen.")) return;
    store.allesLoeschen();
    schliesseDialog();
    render();
  },
};

document.addEventListener("click", (ev) => {
  // offenes „⋯“-Menü schließen, wenn daneben getippt wird
  for (const d of document.querySelectorAll("details.mehr[open]")) if (!d.contains(ev.target)) d.open = false;
  const el = ev.target.closest("[data-a]");
  if (!el) return;
  const fn = aktionen[el.dataset.a];
  if (fn) { ev.preventDefault(); fn(el.dataset, el); }
});

document.addEventListener("change", (ev) => {
  const el = ev.target;
  if (el.dataset.satz) {
    const [e, s] = el.dataset.satz.split(":").map(Number);
    const wert = el.value.trim();
    if (wert && parseZahl(wert) == null) { el.value = ""; toast("Bitte nur Zahlen eingeben."); }
    store.aktualisiereSatz(e, s, { [el.dataset.f]: wert && parseZahl(wert) != null ? wert : "" });
  } else if (el.dataset.einst) {
    const e = store.state.einstellungen, k = el.dataset.einst;
    if (k === "ton") e.ton = el.checked;
    else if (k === "benachrichtigung") { e.benachrichtigung = el.checked; if (el.checked) benachrichtigungErlauben(); gemeldeterTimer = "-"; }
    else if (k === "pause") { const n = parseZahl(el.value); if (n && n > 0) e.pause = Math.round(n); else el.value = e.pause; }
    else if (k === "apiKey") e.apiKey = el.value.trim();
    store.save();
  } else if (el.id === "import-ersetzen" && importErgebnis) {
    // Ersetzen behält den bisherigen Namen, als neuer Plan gilt der Name aus der Datei
    $("#import-name").value = el.checked && importErgebnis.aehnlich ? importErgebnis.aehnlich.name : importErgebnis.plan.name;
  } else if (el.dataset.aChange === "fortschritt-wahl") {
    fortschrittUebung = el.value;
    render();
  }
});

// Enter im kg-Feld springt zu Wdh., Enter im Wdh.-Feld schließt die Tastatur.
document.addEventListener("keydown", (ev) => {
  const el = ev.target;
  if (ev.key !== "Enter" || !el.dataset?.satz) return;
  ev.preventDefault();
  if (el.dataset.f === "kg") el.closest("li").querySelector('[data-f="wdh"]').focus();
  else el.blur();
});

// ---------- Timer und Uhr ----------
function tick() {
  timerAnDienst();
  const a = store.aktiv;
  const dauer = $("#dauer");
  if (a && dauer) dauer.textContent = S.formatDauer(Math.floor((Date.now() - a.start) / 1000));
  const t = a?.timer;
  document.body.classList.toggle("mit-timer", !!t);
  if (!t) { timerEl.hidden = true; return; }
  const rest = S.restzeit(t.endetUm);
  const gesamt = Math.max(1, (t.endetUm - t.start) / 1000);
  const vorbei = rest === 0;
  if (vorbei && !timerGemeldet) {
    timerGemeldet = true;
    if (S.sollSignal(t.endetUm, Date.now(), false)) {
      const warVersteckt = verstecktSeit !== null && verstecktSeit <= t.endetUm;
      if (warVersteckt && benachrichtigungAn()) {
        // Pause endete, während die App weg war: Ton nur, falls die Benachrichtigung nicht kam
        schonBenachrichtigt(t.endetUm).then((ja) => { if (!ja) signal(); });
      } else signal();
    }
  }
  const ueber = Math.floor((Date.now() - t.endetUm) / 1000);
  const html = `<div class="zeit">${vorbei ? "+" + S.formatDauer(ueber) : S.formatDauer(rest)}</div>
    <div class="info">${vorbei ? "Pause vorbei – nächster Satz!" : "Pause"}<div class="balken"><i style="width:${vorbei ? 100 : Math.round((1 - rest / gesamt) * 100)}%"></i></div></div>
    <button data-a="timer-minus" aria-label="15 Sekunden weniger">−15</button><button data-a="timer-plus" aria-label="15 Sekunden mehr">+15</button><button data-a="timer-stopp" aria-label="Timer schließen">✕</button>`;
  timerEl.classList.toggle("vorbei", vorbei);
  if (timerEl.hidden || timerEl.dataset.zustand !== String(vorbei)) { timerEl.innerHTML = html; timerEl.dataset.zustand = String(vorbei); }
  else {
    timerEl.querySelector(".zeit").textContent = vorbei ? "+" + S.formatDauer(ueber) : S.formatDauer(rest);
    timerEl.querySelector(".balken i").style.width = (vorbei ? 100 : Math.round((1 - rest / gesamt) * 100)) + "%";
  }
  timerEl.hidden = false;
}
setInterval(tick, 250);

// ---------- Start ----------
// Beim (Neu-)Start: Pause schon länger vorbei → kein Ton mehr; gerade erst vorbei → Ton kommt noch.
if (store.aktiv?.timer && Date.now() - store.aktiv.timer.endetUm >= S.SIGNAL_NACHLAUF_MS) timerGemeldet = true;
render();
pruefePlanUpdates();
geteilteDateiImportieren();
navigator.storage?.persist?.().catch(() => {});
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
window.__satzbuch = { store, render, get audio() { return audio; } };

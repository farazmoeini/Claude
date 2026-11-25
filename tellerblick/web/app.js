"use strict";
// Tellerblick app logic (plain JS, no build step). Runs in the browser and inside the native apps (Capacitor).
const C = window.TB_CONFIG, N = window.Native;
const $v = document.getElementById("view");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const r0 = x => Math.round(x || 0);
const MEALS = ["Frühstück", "Mittagessen", "Abendessen", "Snack"];
const abs = u => !u ? "" : /^https?:/.test(u) ? u : (C.apiBase || location.origin) + u;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
let S = { day: iso(new Date()), me: null };

// ---------------------------------------------------------------- API
async function api(path, opts = {}) {
  const json = opts.body !== undefined && !(opts.body instanceof FormData);
  const headers = { ...(json ? { "Content-Type": "application/json" } : {}) };
  const tok = store.get("tb_token"); if (tok) headers.Authorization = "Bearer " + tok;
  let r;
  try { r = await fetch((C.apiBase || "") + "/api" + path, { ...opts, headers, body: json ? JSON.stringify(opts.body) : opts.body }); }
  catch { throw Object.assign(new Error("Keine Verbindung. Bitte Internet prüfen."), { status: 0 }); }
  if (r.status === 401 && !path.startsWith("/auth/")) { store.set("tb_token", null); authScreen(); throw Object.assign(new Error("Bitte erneut anmelden."), { status: 401, silent: true }); }
  if (!r.ok) {
    let m = "Fehler " + r.status;
    try { const j = await r.json(); m = typeof j.detail === "string" ? j.detail : (j.detail || []).map(d => d.msg).join(", "); } catch {}
    throw Object.assign(new Error(m), { status: r.status });
  }
  return r.json();
}
const fail = e => { if (!e.silent) alert(e.message); };
function defaultMeal() { const h = new Date().getHours(); return h < 10 ? "Frühstück" : h < 15 ? "Mittagessen" : h < 21 ? "Abendessen" : "Snack"; }
function chrome(show) { document.getElementById("tabs").hidden = !show; document.getElementById("fab").hidden = !show; }

// ---------------------------------------------------------------- boot
async function boot() {
  if (!store.get("tb_token")) return authScreen();
  try {
    S.me = await api("/me");
    N.initPurchases(S.me.user_id).catch(() => {});
    if (!S.me.profile) return profileForm(true);
    chrome(true); tab("today");
  } catch (e) { if (e.status === 0) $v.innerHTML = `<div class="loading"><div style="text-align:center"><p>${esc(e.message)}</p><button class="btn" onclick="boot()">Erneut versuchen</button></div></div>`; }
}

// ---------------------------------------------------------------- auth
function authScreen(mode = "register") {
  chrome(false);
  const reg = mode === "register";
  $v.innerHTML = `<h1 style="margin-top:20px">Teller<span>blick</span></h1>
  <p class="muted" style="margin-top:-6px">Foto vom Essen machen – Kalorien und Eiweiß sind eingetragen.</p>
  <div class="card"><div class="seg"><button data-m="register" class="${reg ? "on" : ""}">Konto erstellen</button><button data-m="login" class="${reg ? "" : "on"}">Anmelden</button></div>
  <form id="af" novalidate>
    <label>E-Mail</label><input name="email" type="email" autocomplete="email" required>
    <label>Passwort${reg ? " (mind. 8 Zeichen)" : ""}</label><input name="password" type="password" autocomplete="${reg ? "new-password" : "current-password"}" minlength="8" required>
    ${reg ? `<label class="check"><input type="checkbox" name="consent_health"><span>Ich willige ein, dass Tellerblick meine Ernährungs-, Gewichts- und Körperdaten (Gesundheitsdaten) zur Berechnung meiner Ziele verarbeitet und Fotos meiner Mahlzeiten zur Analyse an einen KI-Dienst übermittelt. Ich kann die Einwilligung jederzeit durch Löschen meines Kontos widerrufen.</span></label>
      <label class="check"><input type="checkbox" name="consent_terms"><span>Ich akzeptiere die <button type="button" class="link" data-url="${esc(C.termsUrl)}">Nutzungsbedingungen</button> und habe die <button type="button" class="link" data-url="${esc(C.privacyUrl)}">Datenschutzerklärung</button> gelesen. Ich bin mindestens 16 Jahre alt.</span></label>` : ""}
    <div class="err" id="aerr"></div>
    <button class="btn block" style="margin-top:12px">${reg ? "Kostenlos starten" : "Anmelden"}</button>
    ${reg ? "" : `<p style="text-align:center"><button type="button" class="link" id="forgot">Passwort vergessen?</button></p>`}
  </form></div>
  <p class="muted small" style="text-align:center"><button class="link" data-url="${esc(C.imprintUrl)}">Impressum</button> · <button class="link" data-url="${esc(C.privacyUrl)}">Datenschutz</button></p>`;
  $v.querySelectorAll(".seg button").forEach(b => b.onclick = () => authScreen(b.dataset.m));
  $v.querySelectorAll("[data-url]").forEach(b => b.onclick = e => { e.preventDefault(); N.openUrl(abs(b.dataset.url)); });
  document.getElementById("forgot")?.addEventListener("click", forgot);
  document.getElementById("af").onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)), err = document.getElementById("aerr");
    const body = { email: (f.email || "").trim(), password: f.password || "" };
    if (reg) { body.consent_health = !!f.consent_health; body.consent_terms = !!f.consent_terms;
      if (!body.consent_health || !body.consent_terms) { err.textContent = "Bitte beide Einwilligungen bestätigen."; return; } }
    if (body.password.length < 8) { err.textContent = "Das Passwort muss mindestens 8 Zeichen haben."; return; }
    const btn = e.target.querySelector("button.btn"); btn.disabled = true;
    try { const r = await api("/auth/" + (reg ? "register" : "login"), { method: "POST", body }); store.set("tb_token", r.token); await boot(); }
    catch (er) { err.textContent = er.message; } finally { btn.disabled = false; }
  };
}
async function forgot() {
  const email = prompt("E-Mail-Adresse deines Kontos:"); if (!email) return;
  try { await api("/auth/forgot", { method: "POST", body: { email } }); alert("Falls ein Konto existiert, haben wir dir einen Link geschickt."); } catch (e) { fail(e); }
}

// ---------------------------------------------------------------- tabs
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => tab(b.dataset.t));
document.getElementById("fabSearch").onclick = () => openSearch();
document.getElementById("fabPhoto").onclick = () => openPhoto();
function tab(t) {
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.t === t));
  document.getElementById("fab").hidden = t !== "today";
  ({ today, progress, settings })[t]().catch?.(fail);
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- onboarding / profile
function profileHtml(p) {
  const opt = (v, cur, l) => `<option value="${v}" ${String(v) === String(cur) ? "selected" : ""}>${l}</option>`;
  return `<div class="grid2">
      <div><label>Geschlecht</label><select name="sex">${opt("w", p.sex, "weiblich")}${opt("m", p.sex, "männlich")}</select></div>
      <div><label>Alter</label><input name="age" inputmode="numeric" value="${p.age}"></div>
      <div><label>Größe (cm)</label><input name="height_cm" inputmode="numeric" value="${p.height_cm}"></div>
      <div><label>Gewicht (kg)</label><input name="weight_kg" inputmode="decimal" value="${String(p.weight_kg).replace(".", ",")}"></div></div>
    <label>Aktivität im Alltag</label><select name="activity">${opt("sitzend", p.activity, "Sitzend, kaum Bewegung")}${opt("leicht", p.activity, "Leicht aktiv (1–3× Sport/Woche)")}${opt("mittel", p.activity, "Mittel (3–5× Sport/Woche)")}${opt("aktiv", p.activity, "Aktiv (6–7× Sport/Woche)")}${opt("sehr_aktiv", p.activity, "Sehr aktiv (körperliche Arbeit + Sport)")}</select>
    <div class="grid2"><div><label>Ziel</label><select name="goal">${opt("abnehmen", p.goal, "Abnehmen")}${opt("halten", p.goal, "Gewicht halten")}${opt("zunehmen", p.goal, "Muskeln aufbauen")}</select></div>
      <div><label>Tempo (kg/Woche)</label><select name="rate_kg_week">${[0.25, 0.5, 0.75].map(v => opt(v, p.rate_kg_week, String(v).replace(".", ","))).join("")}</select></div></div>
    <label>Eiweiß (g pro kg Körpergewicht)</label><select name="protein_g_per_kg">${[1.2, 1.6, 1.8, 2.0, 2.2].map(v => opt(v, p.protein_g_per_kg, String(v).replace(".", ",") + (v === 1.8 ? " (empfohlen beim Abnehmen)" : v === 2.0 ? " (Muskelaufbau)" : ""))).join("")}</select>`;
}
function readProfile(form) {
  const f = Object.fromEntries(new FormData(form));
  for (const k of ["age", "height_cm", "weight_kg", "rate_kg_week", "protein_g_per_kg"]) f[k] = parseFloat(String(f[k]).replace(",", "."));
  return f;
}
function profileForm(first) {
  chrome(false);
  const p = S.me.profile || { sex: "w", age: 30, height_cm: 170, weight_kg: 70, activity: "leicht", goal: "abnehmen", rate_kg_week: 0.5, protein_g_per_kg: 1.8 };
  $v.innerHTML = `<h1>Teller<span>blick</span></h1>
  <div class="card"><h2>Dein persönliches Tagesziel</h2><p class="muted" style="margin:0">Ein paar Angaben – daraus berechnen wir Kalorien und Eiweiß für dich.</p></div>
  <form class="card" id="pf">${profileHtml(p)}<div class="err" id="perr"></div>
    <button class="btn block" style="margin-top:14px">Ziel berechnen</button>
    <p class="muted small">Berechnung nach Mifflin-St Jeor. Tellerblick ist kein Medizinprodukt. Bei Erkrankungen, Schwangerschaft, Stillzeit oder Essstörungen sprich bitte vorher mit einer Ärztin oder einem Arzt.</p></form>`;
  document.getElementById("pf").onsubmit = async e => {
    e.preventDefault();
    try { S.me = await api("/profile", { method: "PUT", body: readProfile(e.target) }); first ? goalReveal() : (chrome(true), tab("settings")); }
    catch (er) { document.getElementById("perr").textContent = er.message; }
  };
}
function goalReveal() {
  const t = S.me.targets;
  $v.innerHTML = `<h1>Teller<span>blick</span></h1><div class="card" style="text-align:center">
    <p class="muted">Dein Tagesziel</p><div style="font-size:48px;font-weight:800;letter-spacing:-.03em">${t.kcal} kcal</div>
    <p>Eiweiß <b>${t.protein} g</b> · Kohlenhydrate <b>${t.carbs} g</b> · Fett <b>${t.fat} g</b></p>
    ${t.floor_applied ? `<p class="muted" style="color:var(--c)">Wir haben dein Ziel auf das gesunde Minimum angehoben.</p>` : ""}
    <button class="btn block" id="go">Weiter</button></div>`;
  document.getElementById("go").onclick = () => S.me.premium ? (chrome(true), tab("today")) : paywall({ onboarding: true });
}

// ---------------------------------------------------------------- paywall (App Store guideline 3.1.2 compliant)
async function paywall({ onboarding = false, reason = "" } = {}) {
  chrome(false);
  const close = () => { chrome(true); tab("today"); };
  $v.innerHTML = `<div class="row between"><h1>Teller<span>blick</span> Premium</h1><button class="btn icon" id="pwx" aria-label="Schließen">✕</button></div>
    ${reason ? `<div class="card" style="background:var(--brand2);border:0">${esc(reason)}</div>` : ""}
    <div class="card">
      <div class="benefit"><span>📷</span><div><b>Jede Mahlzeit per Foto</b><div class="muted">KI erkennt Komponenten, Portionen und Nährwerte in Sekunden.</div></div></div>
      <div class="benefit"><span>💪</span><div><b>Eiweiß im Blick</b><div class="muted">Damit beim Abnehmen Fett geht – nicht Muskeln.</div></div></div>
      <div class="benefit"><span>📈</span><div><b>Trends & Motivation</b><div class="muted">Gewichtstrend, Streaks, Wochenauswertung.</div></div></div>
    </div>
    <div id="pkgs"><p class="muted">Angebote werden geladen …</p></div>
    <p class="muted small" style="text-align:center"><button class="link" id="restore">Käufe wiederherstellen</button> · <button class="link" data-url="${esc(C.termsUrl)}">Nutzungsbedingungen</button> · <button class="link" data-url="${esc(C.privacyUrl)}">Datenschutz</button></p>
    <p style="text-align:center"><button class="link" id="later">${onboarding ? "Erst kostenlos ausprobieren" : "Später"}</button></p>`;
  document.getElementById("pwx").onclick = close; document.getElementById("later").onclick = close;
  $v.querySelectorAll("[data-url]").forEach(b => b.onclick = () => N.openUrl(abs(b.dataset.url)));
  const box = document.getElementById("pkgs");
  document.getElementById("restore").onclick = async () => {
    if (!N.purchasesAvailable()) return alert("Käufe lassen sich in der App aus dem App Store bzw. Google Play wiederherstellen.");
    try { await N.restore(); S.me = await api("/me?refresh=true"); alert(S.me.premium ? "Premium ist wieder aktiv. 🎉" : "Kein aktives Abo gefunden."); if (S.me.premium) close(); } catch (e) { fail(e); }
  };
  if (!N.purchasesAvailable()) {
    box.innerHTML = `<div class="card"><p>Premium kannst du in der Tellerblick-App für iPhone und Android abschließen. Danach ist es hier automatisch freigeschaltet.</p>
      <p class="muted">Kostenlos enthalten: ${S.me.free_scans_left} Foto-Analysen, unbegrenzt Suche & manuelle Einträge.</p></div>`;
    return;
  }
  try {
    const pkgs = await N.getPackages();
    if (!pkgs.length) { box.innerHTML = `<p class="muted">Gerade keine Angebote verfügbar. Bitte später erneut versuchen.</p>`; return; }
    let sel = pkgs.findIndex(p => p.packageType === "ANNUAL"); if (sel < 0) sel = 0;
    const label = p => ({ ANNUAL: "Jährlich", MONTHLY: "Monatlich", WEEKLY: "Wöchentlich", LIFETIME: "Einmalig" }[p.packageType] || p.product.title);
    const per = p => ({ ANNUAL: " / Jahr", MONTHLY: " / Monat", WEEKLY: " / Woche" }[p.packageType] || "");
    const trial = p => p.product.introPrice && p.product.introPrice.price === 0 ? `${p.product.introPrice.periodNumberOfUnits} ${({ DAY: "Tage", WEEK: "Woche(n)", MONTH: "Monat(e)" })[p.product.introPrice.periodUnit] || ""} kostenlos, dann ` : "";
    const draw = () => {
      const p = pkgs[sel];
      box.innerHTML = pkgs.map((p, i) => `<button class="pkg ${i === sel ? "on" : ""}" data-i="${i}"><span><b>${esc(label(p))}</b><br><span class="muted">${esc(trial(p))}${esc(p.product.priceString)}${per(p)}</span></span>${p.packageType === "ANNUAL" ? '<span class="chip">Beliebt</span>' : ""}</button>`).join("") +
        `<button class="btn block" id="buy">${p.product.introPrice?.price === 0 ? "Kostenlos testen" : "Weiter"}</button>
        <p class="muted small" style="text-align:center">${esc(trial(p))}${esc(p.product.priceString)}${per(p)}. ${p.packageType === "LIFETIME" ? "Einmalige Zahlung." : `Das Abo verlängert sich automatisch, wenn du es nicht mindestens 24 Stunden vor Ablauf in den Einstellungen deines ${N.platform === "android" ? "Google-Play-" : "Apple-"}Kontos kündigst.`}</p>`;
      box.querySelectorAll(".pkg").forEach(b => b.onclick = () => { sel = +b.dataset.i; draw(); });
      document.getElementById("buy").onclick = async e => {
        e.target.disabled = true;
        try {
          await N.buy(pkgs[sel]);
          for (let i = 0; i < 5 && !(S.me = await api("/me?refresh=true")).premium; i++) await new Promise(r => setTimeout(r, 1500));
          if (S.me.premium) { alert("Willkommen bei Premium! 🎉"); close(); } else alert("Kauf erhalten – die Freischaltung kann einen Moment dauern. Tippe ggf. auf „Käufe wiederherstellen“.");
        } catch (er) { if (!/cancel/i.test(String(er?.message || er)) && !er?.userCancelled) fail(er); } finally { e.target.disabled = false; }
      };
    };
    draw();
  } catch (e) { box.innerHTML = `<p class="err">${esc(e.message || e)}</p>`; }
}

// ---------------------------------------------------------------- today
function ringSvg(eaten, target) {
  const R = 64, Cf = 2 * Math.PI * R, frac = Math.min(1, eaten / target), over = eaten > target;
  return `<svg class="ring" viewBox="0 0 150 150" role="img" aria-label="${r0(eaten)} von ${target} kcal"><circle cx="75" cy="75" r="${R}" fill="none" stroke="var(--line)" stroke-width="12"/>
    <circle cx="75" cy="75" r="${R}" fill="none" stroke="${over ? "var(--bad)" : "var(--brand)"}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${Cf * frac} ${Cf}" transform="rotate(-90 75 75)"/>
    <text x="75" y="70" text-anchor="middle" style="font-size:26px;font-weight:800;fill:var(--text)">${r0(Math.abs(target - eaten))}</text>
    <text x="75" y="92" text-anchor="middle" style="font-size:12px">${over ? "kcal zu viel" : "kcal übrig"}</text></svg>`;
}
const macro = (label, v, t, color) => `<div class="macro"><div class="row between" style="gap:6px"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span><span class="muted" style="white-space:nowrap">${r0(v)} / ${t} g</span></div>
  <div class="bar"><div style="width:${Math.min(100, 100 * v / t)}%;background:${color}"></div></div></div>`;

async function today() {
  const d = await api("/day/" + S.day), t = d.targets, tot = d.totals;
  const isToday = S.day === iso(new Date());
  const label = isToday ? "Heute" : new Date(S.day + "T12:00").toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
  $v.innerHTML = `<div class="row between"><h1>Teller<span>blick</span></h1>
    <div class="row" style="gap:2px"><button class="btn icon" id="prev" aria-label="Vorheriger Tag">‹</button><b id="dlabel">${label}</b><button class="btn icon" id="next" aria-label="Nächster Tag" ${isToday ? "disabled" : ""}>›</button></div></div>
  <div class="card row">${ringSvg(tot.kcal, t.kcal)}
    <div style="flex:1;min-width:0"><div class="muted">${r0(tot.kcal)} von ${t.kcal} kcal</div>
      ${macro("Eiweiß", tot.protein, t.protein, "var(--p)")}${macro("Kohlenhydrate", tot.carbs, t.carbs, "var(--c)")}${macro("Fett", tot.fat, t.fat, "var(--f)")}</div></div>
  ${tot.protein >= t.protein * 0.9 ? `<div class="card" style="background:var(--brand2);border:0">💪 Eiweißziel erreicht – stark!</div>` : ""}
  ${!S.me.premium ? `<div class="card row between" style="background:var(--brand2);border:0"><span class="muted" style="color:var(--text)">📷 Noch ${S.me.free_scans_left} kostenlose Foto-Analysen</span><button class="btn small" id="upsell">Premium</button></div>` : ""}
  ${MEALS.map(m => { const es = d.entries.filter(e => e.meal === m), k = es.reduce((s, e) => s + e.kcal, 0);
    return `<div class="card"><div class="row between"><h2 style="margin:0">${m}</h2><span class="muted">${r0(k)} kcal</span></div>
      ${es.map(e => `<div class="entry">${e.photo_url ? `<img src="${esc(abs(e.photo_url))}" alt="" loading="lazy">` : `<div class="ph">🥄</div>`}
        <div class="n"><div>${esc(e.name)}</div><div class="muted">${r0(e.grams)} g · E ${r0(e.protein)} · K ${r0(e.carbs)} · F ${r0(e.fat)}</div></div>
        <b>${r0(e.kcal)}</b><button class="btn icon" aria-label="Löschen" data-del="${e.id}">✕</button></div>`).join("") || `<div class="muted">Noch nichts eingetragen.</div>`}</div>`; }).join("")}`;
  document.getElementById("prev").onclick = () => shiftDay(-1);
  document.getElementById("next").onclick = () => shiftDay(1);
  document.getElementById("upsell")?.addEventListener("click", () => paywall());
  $v.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => { if (confirm("Eintrag löschen?")) { await api("/entries/" + b.dataset.del, { method: "DELETE" }).catch(fail); today(); } });
}
function shiftDay(n) { const d = new Date(S.day + "T12:00"); d.setDate(d.getDate() + n); if (iso(d) <= iso(new Date())) { S.day = iso(d); today().catch(fail); } }

// ---------------------------------------------------------------- sheets
function sheet(html) {
  const s = document.createElement("div"); s.className = "sheet"; s.innerHTML = `<div class="box">${html}</div>`;
  s.onclick = e => { if (e.target === s) s.remove(); }; document.body.appendChild(s);
  s.querySelector("[data-close]")?.addEventListener("click", () => s.remove());
  return s;
}
const mealSelect = (id = "meal") => `<label>Mahlzeit</label><select id="${id}">${MEALS.map(m => `<option ${m === defaultMeal() ? "selected" : ""}>${m}</option>`).join("")}</select>`;

async function openPhoto() {
  if (!S.me.premium && S.me.free_scans_left <= 0) return paywall({ reason: "Deine kostenlosen Foto-Analysen sind aufgebraucht. Suche und manuelle Einträge bleiben kostenlos." });
  let blob;
  try { blob = await N.takePhoto(); } catch (e) { return fail(new Error("Kamera nicht verfügbar: " + (e.message || e))); }
  if (!blob) return;
  const s = sheet(`<div class="row between"><h2 style="margin:0">Mahlzeit analysieren</h2><button class="btn icon" data-close aria-label="Schließen">✕</button></div>
    <img class="preview" src="${URL.createObjectURL(blob)}" alt="" style="margin-top:10px">
    <label>Hinweis (optional)</label><input id="hint" placeholder="z. B. „mit Sahnesoße“, „halbe Portion“">
    <button class="btn block" id="go" style="margin-top:10px">Analysieren</button><div id="res"></div>`);
  s.querySelector("#go").onclick = async () => {
    const res = s.querySelector("#res"), go = s.querySelector("#go"); go.disabled = true; go.textContent = "Analysiere …";
    const fd = new FormData(); fd.append("photo", blob, "meal.jpg"); fd.append("hint", s.querySelector("#hint").value);
    let a;
    try { a = await api("/analyze", { method: "POST", body: fd }); }
    catch (er) { go.disabled = false; go.textContent = "Analysieren"; if (er.status === 402) { s.remove(); return paywall({ reason: er.message }); } res.innerHTML = `<p class="err">${esc(er.message)}</p>`; return; }
    go.remove(); s.querySelector("#hint").closest("label")?.remove(); s.querySelector("#hint").remove();
    S.me = await api("/me").catch(() => S.me);
    if (!a.ai || !a.items.length) {
      res.innerHTML = `<p class="muted">${esc(a.notes || "Auf dem Foto wurde kein Essen erkannt.")}</p><button class="btn block" id="toSearch">Lebensmittel suchen</button>`;
      s.querySelector("#toSearch").onclick = () => { s.remove(); openSearch(a.photo); }; return;
    }
    const items = a.items.map(it => ({ ...it, base: { ...it }, on: true }));
    const draw = () => {
      const sum = items.reduce((acc, it) => acc + (it.on ? it.kcal : 0), 0);
      res.innerHTML = `<h2>${esc(a.meal_name)}</h2>${a.notes ? `<p class="muted">${esc(a.notes)}</p>` : ""}
        ${items.map((it, i) => `<div class="item" style="${it.on ? "" : "opacity:.45"}"><div class="row between"><label class="check" style="margin:0"><input type="checkbox" data-on="${i}" ${it.on ? "checked" : ""}><b>${esc(it.name)}</b></label><span class="chip">${esc(it.confidence)}</span></div>
          <div class="row" style="margin-top:6px"><input inputmode="numeric" data-g="${i}" value="${r0(it.grams)}" style="width:90px"> g <span class="muted" style="margin-left:auto">${r0(it.kcal)} kcal · E ${r0(it.protein)} g</span></div></div>`).join("")}
        ${mealSelect()}<button class="btn block" style="margin-top:14px" id="save">Eintragen (${r0(sum)} kcal)</button>
        <p class="muted small">KI-Schätzung – Mengen bei Bedarf anpassen.</p>`;
      res.querySelectorAll("[data-g]").forEach(inp => inp.onchange = () => {
        const it = items[inp.dataset.g], g = Math.max(1, parseFloat(inp.value.replace(",", ".")) || it.base.grams), k = g / it.base.grams;
        Object.assign(it, { grams: g, kcal: it.base.kcal * k, protein: it.base.protein * k, carbs: it.base.carbs * k, fat: it.base.fat * k }); draw();
      });
      res.querySelectorAll("[data-on]").forEach(cb => cb.onchange = () => { items[cb.dataset.on].on = cb.checked; draw(); });
      res.querySelector("#save").onclick = async () => {
        const meal = res.querySelector("#meal").value;
        const body = items.filter(it => it.on).map(it => ({ day: S.day, meal, name: it.name.slice(0, 120), grams: it.grams, kcal: it.kcal, protein: it.protein, carbs: it.carbs, fat: it.fat, photo: a.photo, source: "foto" }));
        if (!body.length) return;
        try { await api("/entries", { method: "POST", body }); s.remove(); today().catch(fail); } catch (er) { fail(er); }
      };
    };
    draw();
  };
}

function openSearch(photo = "") {
  const s = sheet(`<div class="row between"><h2 style="margin:0">Lebensmittel eintragen</h2><button class="btn icon" data-close aria-label="Schließen">✕</button></div>
    <input id="q" type="search" placeholder="z. B. Haferflocken, Banane, Döner …" style="margin-top:10px"><div id="list" style="margin-top:10px"></div>
    <details style="margin-top:8px"><summary class="muted">Eigenes Lebensmittel eintragen</summary>
      <div class="grid2"><div><label>Name</label><input id="cn"></div><div><label>Menge (g)</label><input id="cg" inputmode="decimal" value="100"></div>
      <div><label>kcal (gesamt)</label><input id="ck" inputmode="decimal"></div><div><label>Eiweiß (g)</label><input id="cp" inputmode="decimal" value="0"></div>
      <div><label>Kohlenhydrate (g)</label><input id="cc" inputmode="decimal" value="0"></div><div><label>Fett (g)</label><input id="cf" inputmode="decimal" value="0"></div></div>
      ${mealSelect("cmeal")}<button class="btn block" id="cadd" style="margin-top:10px">Eintragen</button></details>`);
  const num = v => parseFloat(String(v).replace(",", ".")) || 0;
  const add = async (food, grams, meal) => {
    const k = grams / 100;
    await api("/entries", { method: "POST", body: [{ day: S.day, meal, name: food.name, grams, kcal: food.kcal * k, protein: food.protein * k, carbs: food.carbs * k, fat: food.fat * k, photo, source: "suche" }] });
    s.remove(); today().catch(fail);
  };
  let timer;
  const load = async () => {
    const q = s.querySelector("#q").value.trim();
    const [recent, found] = await Promise.all([q ? [] : api("/recent").catch(() => []), api("/foods?q=" + encodeURIComponent(q))]);
    const list = [...recent, ...found.filter(f => !recent.some(r => r.name === f.name))];
    s.querySelector("#list").innerHTML = (recent.length ? `<div class="muted" style="margin-bottom:6px">Zuletzt gegessen</div>` : "") + list.map((f, i) => `<div class="item"><div class="row between"><b>${esc(f.name)}</b><span class="muted">${r0(f.kcal)} kcal/100 g</span></div>
      <div class="row" style="margin-top:6px"><input inputmode="decimal" data-i="${i}" value="${f.portion_g}" style="width:80px"> g <span class="muted">${esc(f.portion_label)}</span>
      <select data-m="${i}" style="width:auto;margin-left:auto">${MEALS.map(m => `<option ${m === defaultMeal() ? "selected" : ""}>${m}</option>`).join("")}</select>
      <button class="btn small" data-add="${i}" aria-label="Hinzufügen">+</button></div></div>`).join("") || `<p class="muted">Nichts gefunden – unten eigenes Lebensmittel eintragen.</p>`;
    s.querySelectorAll("[data-add]").forEach(b => b.onclick = () => add(list[b.dataset.add], num(s.querySelector(`[data-i="${b.dataset.add}"]`).value) || 100, s.querySelector(`[data-m="${b.dataset.add}"]`).value).catch(fail));
  };
  s.querySelector("#q").oninput = () => { clearTimeout(timer); timer = setTimeout(() => load().catch(fail), 200); };
  load().catch(fail);
  s.querySelector("#cadd").onclick = async () => {
    const v = id => num(s.querySelector(id).value), name = s.querySelector("#cn").value.trim();
    if (!name || !v("#ck")) return alert("Bitte Name und kcal angeben.");
    try { await api("/entries", { method: "POST", body: [{ day: S.day, meal: s.querySelector("#cmeal").value, name, grams: v("#cg") || 100, kcal: v("#ck"), protein: v("#cp"), carbs: v("#cc"), fat: v("#cf"), photo, source: "manuell" }] }); s.remove(); today().catch(fail); } catch (er) { fail(er); }
  };
}

// ---------------------------------------------------------------- progress
function weightChart(ws) {
  if (ws.length < 2) return `<p class="muted">Trag dein Gewicht ein paar Tage lang ein, dann erscheint hier der Verlauf.</p>`;
  const W = 520, H = 180, P = 28, kgs = ws.flatMap(w => [w.kg, w.avg]), lo = Math.floor(Math.min(...kgs) - 0.5), hi = Math.ceil(Math.max(...kgs) + 0.5);
  const t0 = new Date(ws[0].day).getTime(), t1 = new Date(ws.at(-1).day).getTime();
  const x = d => P + (W - 2 * P) * ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)), y = k => H - P - (H - 2 * P) * (k - lo) / (hi - lo);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%" role="img" aria-label="Gewichtsverlauf">
    ${[lo, (lo + hi) / 2, hi].map(k => `<line x1="${P}" x2="${W - P}" y1="${y(k)}" y2="${y(k)}" stroke="var(--line)"/><text x="2" y="${y(k) + 3}">${k.toFixed(1)}</text>`).join("")}
    ${ws.map(w => `<circle cx="${x(w.day)}" cy="${y(w.kg)}" r="3" fill="var(--muted)" opacity=".5"/>`).join("")}
    <polyline fill="none" stroke="var(--brand)" stroke-width="2.5" points="${ws.map(w => `${x(w.day)},${y(w.avg)}`).join(" ")}"/>
    <text x="${P}" y="${H - 6}">${new Date(ws[0].day).toLocaleDateString("de-DE")}</text><text x="${W - P}" y="${H - 6}" text-anchor="end">${new Date(ws.at(-1).day).toLocaleDateString("de-DE")}</text></svg>
    <p class="muted">Punkte = Tageswerte, Linie = 7-Tage-Durchschnitt.</p>`;
}
function kcalBars(days, target) {
  const W = 520, H = 120, bw = (W - 20) / days.length, max = Math.max(target * 1.3, ...days.map(d => d.kcal));
  return `<svg viewBox="0 0 ${W} ${H + 16}" style="width:100%" role="img" aria-label="Kalorien der letzten 14 Tage">${days.map((d, i) => { const h = H * d.kcal / max;
    return `<rect x="${10 + i * bw + 3}" y="${H - h}" width="${bw - 6}" height="${h}" rx="4" fill="${d.kcal > target * 1.05 ? "var(--bad)" : "var(--brand)"}" opacity="${d.kcal ? 1 : .2}"/>
      <text x="${10 + i * bw + bw / 2}" y="${H + 12}" text-anchor="middle">${new Date(d.day + "T12:00").toLocaleDateString("de-DE", { weekday: "narrow" })}</text>`; }).join("")}
    <line x1="10" x2="${W - 10}" y1="${H - H * target / max}" y2="${H - H * target / max}" stroke="var(--text)" stroke-dasharray="4 4" opacity=".5"/></svg>`;
}
async function progress() {
  const s = await api("/stats");
  $v.innerHTML = `<h1>Verlauf</h1>
  <div class="kpis"><div class="kpi"><b>🔥 ${s.streak}</b><span class="muted">Tage in Folge</span></div>
    <div class="kpi"><b>${s.avg_kcal_7d ?? "–"}</b><span class="muted">Ø kcal (7 Tage)</span></div>
    <div class="kpi"><b>${s.protein_days_7d}/${s.logged_days_7d}</b><span class="muted">Tage Eiweißziel</span></div></div>
  <div class="card" style="margin-top:12px"><h2>Kalorien – letzte 14 Tage</h2>${kcalBars(s.last14, s.targets.kcal)}<p class="muted">Gestrichelt: Tagesziel ${s.targets.kcal} kcal</p></div>
  <div class="card"><div class="row between"><h2 style="margin:0">Gewicht</h2>
    <div class="row" style="gap:6px"><input id="wkg" inputmode="decimal" placeholder="kg" style="width:90px"><button class="btn small" id="wsave">Speichern</button></div></div>
    ${weightChart(s.weights)}</div>`;
  document.getElementById("wsave").onclick = async () => {
    const kg = parseFloat(document.getElementById("wkg").value.replace(",", ".")); if (!kg) return;
    try { await api("/weights", { method: "POST", body: { day: iso(new Date()), kg } }); S.me = await api("/me"); progress().catch(fail); } catch (e) { fail(e); }
  };
}

// ---------------------------------------------------------------- settings (account deletion = Apple 5.1.1(v))
async function settings() {
  S.me = await api("/me");
  const m = S.me, t = m.targets;
  $v.innerHTML = `<h1>Einstellungen</h1>
  <div class="card"><div class="row between"><h2 style="margin:0">Tellerblick ${m.premium ? "Premium ✅" : "Kostenlos"}</h2>
    ${m.premium ? "" : `<button class="btn small" id="getp">Premium</button>`}</div>
    <p class="muted">${m.premium ? `Foto-Analysen heute übrig: ${m.scans_left_today}` : `Kostenlose Foto-Analysen übrig: ${m.free_scans_left}`}</p>
    ${N.isNative ? `<button class="list-row" id="manage">Abo verwalten <span>›</span></button><button class="list-row" id="restore">Käufe wiederherstellen <span>›</span></button>` : ""}</div>
  <form class="card" id="pf"><h2>Mein Ziel: ${t.kcal} kcal · ${t.protein} g Eiweiß</h2>${profileHtml(m.profile)}<div class="err" id="perr"></div>
    <button class="btn block" style="margin-top:14px">Speichern</button></form>
  <div class="card"><h2>Konto</h2><p class="muted" style="margin-top:-4px">${esc(m.email)}</p>
    <button class="list-row" id="export">Meine Daten exportieren <span>›</span></button>
    <button class="list-row" id="logout">Abmelden <span>›</span></button>
    <button class="list-row" id="logoutAll">Auf allen Geräten abmelden <span>›</span></button>
    <button class="list-row" id="delete" style="color:var(--bad)">Konto und alle Daten löschen <span>›</span></button></div>
  <div class="card"><h2>Hilfe & Rechtliches</h2>
    <button class="list-row" data-url="mailto:${esc(C.supportEmail)}">Support kontaktieren <span>›</span></button>
    <button class="list-row" data-url="${esc(C.privacyUrl)}">Datenschutzerklärung <span>›</span></button>
    <button class="list-row" data-url="${esc(C.termsUrl)}">Nutzungsbedingungen <span>›</span></button>
    <button class="list-row" data-url="${esc(C.imprintUrl)}">Impressum <span>›</span></button>
    <p class="muted small">Version ${esc(C.version)} · Nährwerte sind Schätzungen und ersetzen keine ärztliche oder ernährungsfachliche Beratung.</p></div>`;
  document.getElementById("getp")?.addEventListener("click", () => paywall());
  document.getElementById("manage")?.addEventListener("click", () => N.openUrl(N.manageSubscriptionsUrl()));
  document.getElementById("restore")?.addEventListener("click", async () => {
    try { await N.restore(); S.me = await api("/me?refresh=true"); alert(S.me.premium ? "Premium ist aktiv. 🎉" : "Kein aktives Abo gefunden."); settings().catch(fail); } catch (e) { fail(e); }
  });
  $v.querySelectorAll("[data-url]").forEach(b => b.onclick = () => { const u = b.dataset.url; u.startsWith("mailto:") ? (location.href = u) : N.openUrl(abs(u)); });
  document.getElementById("pf").onsubmit = async e => {
    e.preventDefault();
    try { S.me = await api("/profile", { method: "PUT", body: readProfile(e.target) }); settings().catch(fail); } catch (er) { document.getElementById("perr").textContent = er.message; }
  };
  document.getElementById("export").onclick = async () => {
    try {
      const data = await api("/me/export"), blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const file = new File([blob], "tellerblick-export.json", { type: "application/json" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "Tellerblick-Export" });
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); }
    } catch (e) { if (e.name !== "AbortError") fail(e); }
  };
  const logout = async () => { store.set("tb_token", null); await N.logoutPurchases(); S = { day: iso(new Date()), me: null }; authScreen("login"); };
  document.getElementById("logout").onclick = logout;
  document.getElementById("logoutAll").onclick = async () => { if (confirm("Auf allen Geräten abmelden?")) { await api("/auth/logout-everywhere", { method: "POST" }).catch(fail); logout(); } };
  document.getElementById("delete").onclick = async () => {
    if (!confirm("Konto wirklich löschen? Alle Einträge, Fotos und Gewichtsdaten werden sofort und endgültig gelöscht.")) return;
    const password = prompt("Zur Bestätigung dein Passwort eingeben:"); if (!password) return;
    try {
      await api("/me", { method: "DELETE", body: { password } });
      alert("Dein Konto wurde gelöscht." + (m.premium && N.isNative ? " Wichtig: Ein laufendes Abo kündigst du in den Abo-Einstellungen deines Store-Kontos." : ""));
      logout();
    } catch (e) { fail(e); }
  };
}

boot();

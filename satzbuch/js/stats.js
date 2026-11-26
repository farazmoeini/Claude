// Auswertungen: Fortschritt, Bestleistungen, Pausen. Reine Funktionen.
import { normName } from "./util.js";

export const uebungsSchluessel = normName;

/** Geschätztes Maximalgewicht für eine Wiederholung (Epley). */
export function e1rm(kg, wdh) {
  if (!kg || !wdh) return 0;
  return wdh === 1 ? kg : kg * (1 + wdh / 30);
}

function eintragVon(training, name) {
  const key = normName(name);
  return training.eintraege.find((e) => normName(e.uebungName) === key) ?? null;
}

function kennzahlen(eintrag) {
  let maxKg = 0, best = 0, volumen = 0;
  for (const s of eintrag.saetze) {
    const kg = s.kg || 0, wdh = s.wdh || 0;
    maxKg = Math.max(maxKg, kg);
    best = Math.max(best, e1rm(kg, wdh));
    volumen += kg * wdh;
  }
  return { maxKg, e1rm: best, volumen, maxWdh: Math.max(0, ...eintrag.saetze.map((s) => s.wdh || 0)) };
}

/** Übungsnamen (erste Schreibweise) aller Trainings, alphabetisch. */
export function alleUebungen(trainings) {
  const m = new Map();
  for (const t of trainings) for (const e of t.eintraege) if (!m.has(normName(e.uebungName))) m.set(normName(e.uebungName), e.uebungName.trim());
  return [...m.values()].sort((a, b) => a.localeCompare(b, "de"));
}

export function verlauf(trainings, name) {
  const out = [];
  for (const t of trainings) {
    const e = eintragVon(t, name);
    if (e && e.saetze.length) out.push({ datum: t.start, trainingId: t.id, ...kennzahlen(e) });
  }
  return out.sort((a, b) => a.datum - b.datum);
}

export function bestleistungen(trainings, name) {
  let best = null;
  for (const v of verlauf(trainings, name)) {
    if (!best || v.e1rm > best.maxE1rm || (v.e1rm === best.maxE1rm && v.maxKg > best.maxKg))
      best = { maxKg: Math.max(v.maxKg, best?.maxKg ?? 0), maxE1rm: v.e1rm, datum: v.datum };
    else best.maxKg = Math.max(best.maxKg, v.maxKg);
  }
  return best;
}

/** Übungen (normalisierte Namen), bei denen dieses Training eine neue Bestleistung bringt. */
export function neuePRs(trainings, training) {
  const vorher = trainings.filter((t) => t.id !== training.id && t.start < training.start);
  const prs = [];
  for (const e of training.eintraege) {
    const alt = verlauf(vorher, e.uebungName);
    if (!alt.length) continue;
    const k = kennzahlen(e);
    const altMaxKg = Math.max(...alt.map((a) => a.maxKg));
    const altE1rm = Math.max(...alt.map((a) => a.e1rm));
    if ((k.maxKg > altMaxKg && k.maxKg > 0) || k.e1rm > altE1rm + 1e-9) prs.push(normName(e.uebungName));
  }
  return prs;
}

/** Durchschnittliche gemessene Pause eines Trainings in Sekunden (gerundet). */
export function oPause(training) {
  const p = training.eintraege.flatMap((e) => e.saetze.map((s) => s.pauseVorher)).filter((x) => typeof x === "number");
  return p.length ? Math.round(p.reduce((a, b) => a + b, 0) / p.length) : null;
}

export function oPauseUebung(trainings, name) {
  const p = [];
  for (const t of trainings) {
    const e = eintragVon(t, name);
    if (e) for (const s of e.saetze) if (typeof s.pauseVorher === "number") p.push(s.pauseVorher);
  }
  return p.length ? Math.round(p.reduce((a, b) => a + b, 0) / p.length) : null;
}

export function zusammenfassung(training) {
  let volumen = 0, saetze = 0;
  for (const e of training.eintraege) for (const s of e.saetze) { volumen += (s.kg || 0) * (s.wdh || 0); saetze++; }
  return { dauerMin: Math.round(((training.ende ?? training.start) - training.start) / 60000), volumen, saetze, oPause: oPause(training) };
}

export function restzeit(endetUm, jetzt = Date.now()) {
  return Math.max(0, Math.ceil((endetUm - jetzt) / 1000));
}

export function wochenStart(jetzt = Date.now()) {
  const d = new Date(jetzt);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function trainingsDieseWoche(trainings, jetzt = Date.now()) {
  const ab = wochenStart(jetzt);
  return trainings.filter((t) => t.start >= ab && t.start <= jetzt).length;
}

export function formatDauer(sek) {
  if (sek == null) return "–";
  const m = Math.floor(sek / 60), s = sek % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Soll jetzt der Pausenton kommen? Einmal pro Pause; auch wenn die App erst später wieder
 *  aktiv wird (Android friert Apps im Hintergrund ein), aber nicht mehr nach 2 Minuten. */
export const SIGNAL_NACHLAUF_MS = 2 * 60_000;
export function sollSignal(endetUm, jetzt, schonGemeldet) {
  return !schonGemeldet && jetzt >= endetUm && jetzt - endetUm < SIGNAL_NACHLAUF_MS;
}

/** Erster noch nicht abgehakter Satz im laufenden Training. */
export function naechsterSatz(aktiv) {
  for (const e of aktiv?.eintraege ?? []) {
    const i = e.saetze.findIndex((s) => !s.erledigtUm);
    if (i >= 0) return { uebung: e.uebungName, satz: i + 1, kg: e.saetze[i].kg ?? null, wdh: e.saetze[i].wdh ?? null };
  }
  return null;
}

/** Text für die Benachrichtigung am Pausenende. */
export function pausenText(aktiv) {
  const n = naechsterSatz(aktiv);
  if (!n) return "Alle Sätze erledigt – Training beenden?";
  const werte = [n.kg != null ? `${String(n.kg).replace(".", ",")} kg` : "", n.wdh != null ? `${n.wdh}` : ""].filter(Boolean).join(" × ");
  return `Weiter: ${n.uebung}, Satz ${n.satz}${werte ? " – " + werte : ""}`;
}

// ---------- Langhantel: Scheiben pro Seite ----------
export const SCHEIBEN = [20, 15, 10, 5, 2.5, 1.25];

/** Scheiben je Seite für ein Gesamtgewicht (Stange 20 kg); null, wenn nicht genau ladbar. */
export function scheibenProSeite(kg, stange = 20, verfuegbar = SCHEIBEN) {
  if (kg == null || kg < stange) return null;
  let rest = Math.round(((kg - stange) / 2) * 100) / 100;
  const out = [];
  for (const s of verfuegbar) {
    while (rest >= s - 1e-9) { out.push(s); rest = Math.round((rest - s) * 100) / 100; }
  }
  return rest < 1e-9 ? out : null;
}

export function istLanghantel(name) {
  const n = String(name ?? "");
  if (/\bdb\b|kurzhantel|kabel|maschine|smith|hammer|einbeinig/i.test(n)) return false;
  return /kniebeuge|deadlift|kreuzheben|bench|bankdr|close-grip|romanian|military|langhantel/i.test(n);
}

// ---------- Wochenleiste ----------
export function wochenTage(trainings, jetzt = Date.now()) {
  const ab = wochenStart(jetzt);
  const heute = new Date(jetzt); heute.setHours(0, 0, 0, 0);
  return ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((kurz, i) => {
    const tag = new Date(ab); tag.setDate(tag.getDate() + i);
    const bis = new Date(tag); bis.setDate(bis.getDate() + 1);
    return {
      kurz,
      trainiert: trainings.some((t) => t.start >= tag.getTime() && t.start < bis.getTime()),
      heute: tag.getTime() === heute.getTime(),
      vorbei: tag.getTime() < heute.getTime(),
    };
  });
}

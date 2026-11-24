// Erkennt Trainingspläne in reinem Text (z. B. aus einem PDF extrahiert).
import { uid, parseZahl, STANDARD } from "./util.js";

const WDH = String.raw`(\d+(?:\s*[-–]\s*\d+)?)`;
const RE_SXW = new RegExp(String.raw`(\d+)\s*[x×*\/]\s*` + WDH, "i");
const RE_SAETZE = new RegExp(String.raw`(\d+)\s*S[äa]tze?(?![a-zäöüß])[^\d]{0,12}` + WDH + String.raw`\s*(?:Wdh\.?|Wiederholungen|Reps)?`, "i");
const RE_KG = /(\d+(?:[.,]\d+)?)\s*kg(?![a-z])/i;
const RE_MMSS = /(\d{1,2}):(\d{2})/;
const RE_MIN = /(\d+(?:[.,]\d+)?)\s*(?:min(?:uten|\.)?)(?![a-zäöüß])/i;
const RE_SEK = /(\d+)\s*(?:sek(?:unden|\.)?|s)(?![a-zäöüß])/i;

const RE_UEBERSCHRIFT = new RegExp(
  "^(" +
    [
      String.raw`tag\s*[\wäöü]+`,
      String.raw`training(?:seinheit|stag)?\s*[\wäöü]*`,
      String.raw`einheit\s*\w+`,
      String.raw`woche\s*\d+`,
      "montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag",
      "push|pull|beine|legs|brust|rücken|schultern|arme",
      "oberkörper|unterkörper|ganzkörper|upper|lower|full ?body",
    ].join("|") +
    String.raw`)(?![a-zäöüß])`,
  "i"
);
const RE_IGNORIEREN = /^(trainingsplan|name\s*:|datum|seite\s*\d|erstellt|hinweis|notiz|gültig)/i;
const RE_KOPFZEILE = /s[äa]tze/i;

function pauseAus(text) {
  let m = text.match(RE_MMSS);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = text.match(RE_MIN);
  if (m) return Math.round(parseZahl(m[1]) * 60);
  m = text.match(RE_SEK);
  if (m) return Number(m[1]);
  return undefined;
}

function wdhText(s) {
  return s.replace(/\s+/g, "").replace("–", "-");
}

function nameAus(text) {
  const bisZahl = text.split(/\d/)[0];
  return bisZahl.replace(/[\s:–\-|,;.•·*]+$/g, "").replace(/^[\s•·*\-–\d.)]+/, "").trim();
}

function uebung(name, felder = {}) {
  const u = { id: uid(), name, saetze: STANDARD.saetze, wdh: STANDARD.wdh, pause: STANDARD.pause };
  if (felder.saetze) u.saetze = felder.saetze;
  if (felder.wdh) u.wdh = felder.wdh;
  if (felder.gewicht != null) u.gewicht = felder.gewicht;
  if (felder.pause) u.pause = felder.pause;
  if (felder.pruefen) u.pruefen = true;
  return u;
}

/** Eine Zeile als Übung lesen, oder null, wenn keine Sätze/Wdh. erkennbar sind. */
function leseUebungszeile(zeile) {
  const zellen = zeile.split(/\s*[|\t;]\s*/).filter(Boolean);
  if (zellen.length >= 3 && parseZahl(zellen[1]) != null && /^\d+(\s*[-–]\s*\d+)?$/.test(zellen[2])) {
    const rest = zellen.slice(3).join(" ");
    const kg = rest.match(RE_KG) ?? rest.match(/^(\d+(?:[.,]\d+)?)$/);
    return uebung(zellen[0].trim(), {
      saetze: parseZahl(zellen[1]),
      wdh: wdhText(zellen[2]),
      gewicht: kg ? parseZahl(kg[1]) : undefined,
      pause: pauseAus(rest.replace(RE_KG, "")),
    });
  }
  // Tabelle, deren Spalten nur durch Leerzeichen getrennt sind: "Brustpresse 3 10 45 kg"
  const sp = zeile.match(/^(\D*?[a-zäöüß][^\d]*?)\s+(\d{1,2})\s+(\d+(?:\s*[-–]\s*\d+)?)(?:\s+(.*))?$/i);
  if (sp && Number(sp[2]) <= 10 && !RE_SXW.test(zeile) && !RE_SAETZE.test(zeile)) {
    const rest = sp[4] ?? "";
    const kg = rest.match(RE_KG) ?? rest.match(/^(\d+(?:[.,]\d+)?)$/);
    return uebung(nameAus(sp[1]) || sp[1].trim(), {
      saetze: Number(sp[2]),
      wdh: wdhText(sp[3]),
      gewicht: kg ? parseZahl(kg[1]) : undefined,
      pause: pauseAus(rest.replace(RE_KG, "")),
    });
  }
  const m = zeile.match(RE_SXW) ?? zeile.match(RE_SAETZE);
  if (!m) return null;
  const name = nameAus(zeile.slice(0, m.index) || zeile);
  if (!name) return null;
  const rest = zeile.slice(0, m.index) + " " + zeile.slice(m.index + m[0].length);
  const kg = rest.match(RE_KG);
  return uebung(name, {
    saetze: Number(m[1]),
    wdh: wdhText(m[2]),
    gewicht: kg ? parseZahl(kg[1]) : undefined,
    pause: pauseAus(rest.replace(RE_KG, "")),
  });
}

// ---------- Tabellen (aus js/pdf.js: Zellen durch Tabs getrennt) ----------
const RE_TAB_KOPF = /^(übung|uebung|übungen)$/i;
const RE_WOCHENTAG = /^(mo|di|mi|do|fr|sa|so)\s*[:.–-]\s*(.*)$/i;
const ZAHL = String.raw`\d+(?:[.,]\d+)?`;

/** Oberste Ebene an Trennzeichen teilen (nicht innerhalb von Klammern). */
function teileAussen(text, trenner) {
  const out = [];
  let tiefe = 0, akt = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(") tiefe++;
    if (c === ")") tiefe = Math.max(0, tiefe - 1);
    if (tiefe === 0 && text.startsWith(trenner, i)) { out.push(akt); akt = ""; i += trenner.length - 1; continue; }
    akt += c;
  }
  out.push(akt);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** Zelle „Sätze x Wdh.“ lesen. */
export function leseSatzZelle(zelle) {
  let text = String(zelle ?? "").trim();
  const ausnahmen = {}; // Woche -> Satzanzahl der ersten Gruppe, z. B. "(W4: 2 x 3)"
  text = text.replace(/\(\s*W(\d+)\s*:\s*(\d+)\s*[x×]\s*[^)]*\)/gi, (_, w, n) => { ausnahmen[Number(w)] = Number(n); return ""; }).trim();
  if (!text) return null;
  if (!/[x×]/i.test(text) && text.includes("/")) {
    const liste = text.split("/").map((x) => x.trim()).filter(Boolean);
    if (liste.every((x) => /^\d/.test(x))) return { liste, gruppen: [], ausnahmen };
  }
  const gruppen = [];
  for (const teil of teileAussen(text, " + ")) {
    let bisWoche = null;
    const t = teil.replace(/\(\s*W\s*1\s*[-–]\s*(\d+)\s*\)/i, (_, n) => { bisWoche = Number(n); return ""; }).trim();
    const m = t.match(/^(\d+)(?:\s*[-–]\s*\d+)?\s*[x×]\s*(.+)$/i);
    if (m) gruppen.push({ anzahl: Number(m[1]), wdh: m[2].trim().replace(/^\((.*)\)$/, "$1").trim(), bisWoche });
    else if (/^\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+)?\s*(min|minuten|sek|s|m)\.?$/i.test(t)) gruppen.push({ anzahl: 1, wdh: t, bisWoche });
    else return null;
  }
  return gruppen.length ? { liste: null, gruppen, ausnahmen } : null;
}

/** Zelle „Gewicht“ lesen: Werte in kg, Notiz, Verweis auf die Blocktabelle. */
export function leseGewichtZelle(zelle) {
  const text = String(zelle ?? "").trim();
  if (!text || /^[-–—]$/.test(text)) return { werte: [], notiz: "" };
  if (/siehe\s+block/i.test(text)) {
    const ab = text.replace(/^.*?W\s*1\s*:/i, "");
    const werte = [...ab.matchAll(new RegExp(ZAHL, "g"))].map((m) => parseZahl(m[0]));
    return { werte, notiz: "", block: true };
  }
  const werte = [];
  let plus = false, spanne = false;
  for (const teil of text.split("/")) {
    const m = teil.match(new RegExp(String.raw`(\+)?\s*(${ZAHL})(\s*[-–]\s*${ZAHL})?(\s*(?:cm|m|sek|s|min)\b)?`, "i"));
    if (!m || m[4]) continue;
    if (m[1]) plus = true;
    if (m[3]) spanne = true;
    werte.push(parseZahl(m[2]));
  }
  const rest = text.replace(/[+\d.,\/–-]/g, " ").replace(/\s+/g, " ").trim().replace(/^,\s*|,\s*$/g, "");
  let notiz = spanne || /\d\s*(cm|m)\b/i.test(text) ? text : rest;
  if (plus) notiz = notiz ? `${notiz} · Zusatzgewicht` : "Zusatzgewicht";
  return { werte, notiz };
}

function mitNotiz(u, ...teile) {
  const n = [u.notiz, ...teile].filter(Boolean).join(" · ");
  if (n) u.notiz = n;
  return u;
}

/** Eine Tabellenzeile [Name, Sätze x Wdh., Gewicht] in Übungen umwandeln (Supersatz = zwei Übungen). */
function leseTabellenzeile(zellen) {
  const name = (zellen[0] ?? "").trim();
  const satz = leseSatzZelle(zellen[1]);
  if (!name || !satz) return null;
  const gew = leseGewichtZelle(zellen.slice(2).join(" "));

  const sup = name.match(/^Superset:\s*(.+?)\s+\+\s+(.+)$/i);
  if (sup && satz.gruppen.length === 1) {
    const wdhs = satz.gruppen[0].wdh.split("/").map((x) => x.trim());
    const gewTeile = zellen.slice(2).join(" ").split("/");
    const zweiGewichte = gewTeile.length === 2;
    return [sup[1], sup[2]].map((n, i) => {
      const g = zweiGewichte ? leseGewichtZelle(gewTeile[i]) : gew;
      const kg = zweiGewichte ? g.werte[0] : gew.werte[i] ?? gew.werte[0];
      return mitNotiz(uebung(n.trim(), { saetze: satz.gruppen[0].anzahl, wdh: wdhs[i] ?? wdhs[0], gewicht: kg }), g.notiz, `Superset mit ${(i ? sup[1] : sup[2]).trim()}`);
    });
  }
  const u = uebung(name);
  if (satz.liste) {
    u.ziele = satz.liste.map((wdh, i) => {
      const kg = gew.werte.length === 1 ? gew.werte[0] : gew.werte[i];
      return kg != null ? { wdh, kg } : { wdh };
    });
    u.saetze = u.ziele.length;
    u.wdh = u.ziele[0].wdh;
  } else {
    const [g] = satz.gruppen;
    u.saetze = g.anzahl;
    u.wdh = g.wdh;
    if (satz.gruppen.length > 1 && gew.werte.length === satz.gruppen.length) {
      u.ziele = satz.gruppen.flatMap((gr, i) => Array.from({ length: gr.anzahl }, () => ({ wdh: gr.wdh, kg: gew.werte[i] })));
      u.saetze = u.ziele.length;
    } else if (gew.werte.length) u.gewicht = gew.werte[0];
  }
  mitNotiz(u, gew.notiz);
  u._satz = satz;
  u._block = !!gew.block || /\(block\)/i.test(name);
  return [u];
}

function woerter(name) {
  const stop = new Set(["block", "back-off", "backoff", "siehe", "flat", "mit", "und"]);
  return new Set((name.toLowerCase().replace(/\([^)]*\)/g, " ").match(/[a-zäöüß][a-zäöüß-]*/g) || []).filter((w) => !stop.has(w)));
}

/** Blocktabelle (Spalten W1…Wn) mit den Übungen der Trainingstage verknüpfen. */
function verknuepfeBlock(tage, blockZeilen, nWochen) {
  for (const tag of tage) {
    if (!tag.kurz) continue;
    const zeilen = blockZeilen.filter((b) => b.tag === tag.kurz);
    const haupt = zeilen.filter((b) => !b.backoff);
    for (const b of haupt) {
      const bw = woerter(b.name);
      let best = null, bestPunkte = 0;
      for (const u of tag.uebungen) {
        if (u.wochen) continue;
        const uw = woerter(u.name);
        const punkte = [...bw].filter((w) => uw.has(w)).length + (u._block ? 0.5 : 0);
        if (punkte > bestPunkte && [...bw].some((w) => uw.has(w))) { best = u; bestPunkte = punkte; }
      }
      if (!best) continue;
      const backoffs = zeilen.filter((x) => x.backoff && [...woerter(x.name)].some((w) => bw.has(w)));
      best.wochen = Array.from({ length: nWochen }, (_, w) => {
        const saetze = [];
        const kg = b.kgs[w];
        if (kg != null) saetze.push(...Array.from({ length: b.ausnahmen[w + 1] ?? b.anzahl }, () => ({ wdh: b.wdh, kg })));
        for (const bo of backoffs) if (bo.kgs[w] != null) saetze.push(...Array.from({ length: bo.anzahl }, () => ({ wdh: bo.wdh, kg: bo.kgs[w] })));
        return saetze;
      });
      best.saetze = best.wochen[0].length || best.saetze;
      delete best.ziele;
      delete best.gewicht;
      best.name = best.name.replace(/\s*\(block\)/i, "").replace(/\s*\+\s*back-?off\s*$/i, "").trim();
    }
  }
}

export function parsePlanText(text, name = "Importierter Plan") {
  const tage = [];
  let tag = null;
  let titel = null;
  let kopf = null; // null | { block: false } | { block: true, wochen: [Spaltenindex...] }
  const blockZeilen = [];
  const quelle = String(text ?? "");
  const tabellenDok = /^(übung|uebung|übungen)\t/im.test(quelle);
  const neuerTag = (n, kurz) => {
    tag = { id: uid(), name: n, uebungen: [] };
    if (kurz) tag.kurz = kurz;
    tage.push(tag);
  };

  for (const roh of quelle.split(/\r?\n/)) {
    if (roh.includes("\t")) {
      const zellen = roh.split("\t").map((z) => z.replace(/\s+/g, " ").trim());
      if (RE_TAB_KOPF.test(zellen[0])) {
        const wochen = zellen.map((z, i) => (/^W\d+\b/i.test(z) ? i : -1)).filter((i) => i >= 0);
        kopf = wochen.length ? { block: true, wochen } : { block: false };
        continue;
      }
      if (kopf?.block) {
        const satz = leseSatzZelle(zellen[1]);
        const tagM = zellen[0].match(/\((mo|di|mi|do|fr|sa|so)\)/i);
        if (satz?.gruppen.length && tagM) {
          blockZeilen.push({
            name: zellen[0], tag: tagM[1].toLowerCase(), backoff: /back-?off/i.test(zellen[0]),
            anzahl: satz.gruppen[0].anzahl, wdh: satz.gruppen[0].wdh, ausnahmen: satz.ausnahmen,
            kgs: kopf.wochen.map((i) => parseZahl(zellen[i] ?? "")),
          });
        }
        continue;
      }
      if (kopf) {
        const neu = leseTabellenzeile(zellen);
        if (neu) {
          if (!tag) neuerTag(`Training ${tage.length + 1}`);
          tag.uebungen.push(...neu);
        }
        continue;
      }
    }
    const zeile = roh.replace(/\s+/g, " ").trim();
    if (!zeile) continue;
    if (RE_IGNORIEREN.test(zeile)) {
      if (!titel && /^trainingsplan\s+\S/i.test(zeile) && zeile.length <= 60) titel = zeile;
      continue;
    }
    if (RE_KOPFZEILE.test(zeile) && !/\d/.test(zeile)) continue;

    const wt = zeile.match(RE_WOCHENTAG);
    if (wt && zeile.length <= 70) {
      const rest = wt[2].replace(/\s*\(ca\.[^)]*\)\s*$/i, "").trim();
      const kurz = wt[1][0].toUpperCase() + wt[1][1].toLowerCase();
      neuerTag(rest ? `${kurz} – ${rest}` : kurz, kurz.toLowerCase());
      kopf = null;
      continue;
    }
    if (tabellenDok) {
      if (RE_UEBERSCHRIFT.test(zeile) && zeile.length <= 40) { neuerTag(zeile.replace(/:$/, "")); kopf = null; }
      else if (!titel && !tage.length && !kopf && zeile.length <= 50 && !blockZeilen.length) titel = zeile;
      continue;
    }

    const u = leseUebungszeile(zeile);
    if (u) {
      if (!tag) neuerTag(`Training ${tage.length + 1}`);
      tag.uebungen.push(u);
      continue;
    }
    if (RE_UEBERSCHRIFT.test(zeile) || (/:$/.test(zeile) && zeile.length <= 40)) {
      neuerTag(zeile.replace(/:$/, ""));
      continue;
    }
    if (/^(pause|ca\.)/i.test(zeile)) continue;
    if (/[a-zäöüß]/i.test(zeile) && zeile.length <= 40 && !/[.!?]$/.test(zeile)) {
      if (!tag) neuerTag(`Training ${tage.length + 1}`);
      tag.uebungen.push(uebung(nameAus(zeile) || zeile, { pruefen: true }));
    }
  }
  const nWochen = blockZeilen.length ? Math.max(...blockZeilen.map((b) => b.kgs.length)) : 0;
  if (nWochen) verknuepfeBlock(tage, blockZeilen, nWochen);
  for (const t of tage) {
    delete t.kurz;
    for (const u of t.uebungen) { delete u._satz; delete u._block; }
  }
  const plan = { id: uid(), name: titel || name, quelle: "pdf", tage: tage.filter((t) => t.uebungen.length) };
  if (nWochen > 1) plan.wochen = nWochen;
  return plan;
}

/** Satz-Ziele in Kurzschrift: "4-5@34p210 / 2x8@28" -> [{wdh,kg?,pause?}, ...] (p = Pause in s). */
export function parseZiele(text) {
  const out = [];
  for (const teilRoh of String(text ?? "").split("/")) {
    const teil = teilRoh.trim();
    if (!teil) continue;
    let anzahl = 1, rest = teil;
    const m = teil.match(/^(\d+)\s*[x×]\s*(.+)$/i);
    if (m) { anzahl = Number(m[1]); rest = m[2]; }
    let pause;
    const pm = rest.match(/\s*p(\d+)\s*$/i);
    if (pm) { pause = Number(pm[1]); rest = rest.slice(0, pm.index); }
    const [wdhRoh, kgRoh, ...zuviel] = rest.split("@");
    const wdh = (wdhRoh ?? "").trim();
    if (!wdh || zuviel.length) throw new Error(`Satz-Ziel „${teil}“ nicht verstanden (Beispiel: 3x8@60 / 10@50)`);
    const ziel = { wdh };
    if (kgRoh !== undefined) {
      const kg = parseZahl(kgRoh.trim());
      if (kg == null) throw new Error(`Gewicht in „${teil}“ ist keine Zahl`);
      ziel.kg = kg;
    }
    if (pause) ziel.pause = pause;
    for (let i = 0; i < anzahl; i++) out.push({ ...ziel });
  }
  return out;
}

export function zieleText(ziele) {
  const teile = [];
  const einzeln = (z) => z.wdh + (z.kg != null ? "@" + String(z.kg).replace(".", ",") : "") + (z.pause ? "p" + z.pause : "");
  for (let i = 0; i < (ziele?.length ?? 0); ) {
    let j = i + 1;
    while (j < ziele.length && einzeln(ziele[j]) === einzeln(ziele[i])) j++;
    teile.push((j - i > 1 ? `${j - i}x` : "") + einzeln(ziele[i]));
    i = j;
  }
  return teile.join(" / ");
}

function pruefeZiele(liste, wo) {
  if (!Array.isArray(liste)) throw new Error(`${wo}: Satz-Ziele müssen eine Liste sein`);
  return liste.map((z) => {
    if (!z || z.wdh == null || !String(z.wdh).trim()) throw new Error(`${wo}: Satz-Ziel ohne Wiederholungen`);
    const out = { wdh: String(z.wdh).trim() };
    const kg = parseZahl(z.kg);
    if (kg != null) out.kg = kg;
    const p = parseZahl(z.pause);
    if (p && p > 0) out.pause = Math.round(p);
    return out;
  });
}

/** Prüft einen Plan aus fremder Quelle (JSON-Import, Claude) und ergänzt fehlende Felder. */
export function validierePlan(obj) {
  if (!obj || typeof obj !== "object") throw new Error("Kein Plan-Objekt");
  if (typeof obj.name !== "string" || !obj.name.trim()) throw new Error("Plan braucht einen Namen");
  if (!Array.isArray(obj.tage)) throw new Error("Plan braucht eine Liste von Tagen");
  const plan = {
    id: obj.id || uid(),
    name: obj.name.trim(),
    quelle: obj.quelle || "manuell",
    tage: obj.tage.map((t, i) => {
      if (!t || !Array.isArray(t.uebungen)) throw new Error(`Tag ${i + 1} hat keine Übungen`);
      return {
        id: t.id || uid(),
        name: String(t.name || `Training ${i + 1}`),
        uebungen: t.uebungen.map((u, j) => {
          if (!u || typeof u.name !== "string" || !u.name.trim())
            throw new Error(`Übung ${j + 1} in „${t.name}“ hat keinen Namen`);
          const neu = uebung(u.name.trim(), {
            saetze: parseZahl(u.saetze) || undefined,
            wdh: u.wdh != null && String(u.wdh).trim() ? String(u.wdh).trim() : undefined,
            gewicht: parseZahl(u.gewicht) ?? undefined,
            pause: parseZahl(u.pause) || undefined,
            pruefen: u.pruefen,
          });
          if (u.id) neu.id = u.id;
          if (u.notiz) neu.notiz = String(u.notiz);
          if (u.ziele != null) {
            const z = pruefeZiele(u.ziele, u.name);
            if (z.length) { neu.ziele = z; neu.saetze = z.length; if (u.wdh == null) neu.wdh = z[0].wdh; }
          }
          if (u.wochen != null) {
            if (!Array.isArray(u.wochen)) throw new Error(`${u.name}: Wochen müssen eine Liste sein`);
            const w = u.wochen.map((x, k) => pruefeZiele(x, `${u.name}, Woche ${k + 1}`));
            if (w.some((x) => x.length)) {
              neu.wochen = w;
              neu.saetze = w[0].length || neu.saetze;
              if (u.wdh == null && w[0][0]) neu.wdh = w[0][0].wdh;
            }
          }
          return neu;
        }),
      };
    }),
  };
  const wochen = Math.max(0, ...plan.tage.flatMap((t) => t.uebungen.map((u) => u.wochen?.length ?? 0)));
  if (wochen > 1) plan.wochen = wochen;
  if (obj.notiz) plan.notiz = String(obj.notiz);
  if (Number.isInteger(obj.version) && obj.version > 0) plan.version = obj.version;
  return plan;
}

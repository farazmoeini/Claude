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

export function parsePlanText(text, name = "Importierter Plan") {
  const tage = [];
  let tag = null;
  let titel = null;
  const neuerTag = (n) => {
    tag = { id: uid(), name: n, uebungen: [] };
    tage.push(tag);
  };

  for (const roh of String(text ?? "").split(/\r?\n/)) {
    const zeile = roh.replace(/\s+/g, " ").trim();
    if (!zeile) continue;
    if (RE_IGNORIEREN.test(zeile)) {
      if (!titel && /^trainingsplan\s+\S/i.test(zeile) && zeile.length <= 60) titel = zeile;
      continue;
    }
    if (RE_KOPFZEILE.test(zeile) && !/\d/.test(zeile)) continue;

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
    if (/^pause/i.test(zeile)) continue;
    if (/[a-zäöüß]/i.test(zeile) && zeile.length <= 40 && !/[.!?]$/.test(zeile)) {
      if (!tag) neuerTag(`Training ${tage.length + 1}`);
      tag.uebungen.push(uebung(nameAus(zeile) || zeile, { pruefen: true }));
    }
  }
  return { id: uid(), name: titel || name, quelle: "pdf", tage: tage.filter((t) => t.uebungen.length) };
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
  return plan;
}

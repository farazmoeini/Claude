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
  const neuerTag = (n) => {
    tag = { id: uid(), name: n, uebungen: [] };
    tage.push(tag);
  };

  for (const roh of String(text ?? "").split(/\r?\n/)) {
    const zeile = roh.replace(/\s+/g, " ").trim();
    if (!zeile || RE_IGNORIEREN.test(zeile)) continue;
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
  return { id: uid(), name, quelle: "pdf", tage: tage.filter((t) => t.uebungen.length) };
}

/** Prüft einen Plan aus fremder Quelle (JSON-Import, Claude) und ergänzt fehlende Felder. */
export function validierePlan(obj) {
  if (!obj || typeof obj !== "object") throw new Error("Kein Plan-Objekt");
  if (typeof obj.name !== "string" || !obj.name.trim()) throw new Error("Plan braucht einen Namen");
  if (!Array.isArray(obj.tage)) throw new Error("Plan braucht eine Liste von Tagen");
  return {
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
          return neu;
        }),
      };
    }),
  };
}

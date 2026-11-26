// Kleine Helfer ohne Abhängigkeiten (Browser und Node).

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** "72,5" -> 72.5; alles, was keine Zahl ist -> null */
export function parseZahl(s) {
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  if (s == null) return null;
  const t = String(s).trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Schlüssel, unter dem eine Übung über Trainings hinweg gefunden wird. */
export function normName(s) {
  return String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export const STANDARD = { saetze: 3, wdh: "10", pause: 90 };

/** Kopie der Liste, in der Eintrag i um eine Position nach oben (-1) oder unten (+1) gerückt ist. */
export function verschiebe(liste, i, richtung) {
  const j = i + richtung;
  if (i < 0 || i >= liste.length || j < 0 || j >= liste.length) return [...liste];
  const neu = [...liste];
  [neu[i], neu[j]] = [neu[j], neu[i]];
  return neu;
}

/** Übungshinweis in Zeilen zerlegen: getrennt an " · ", Stichwort vor einem Doppelpunkt, "3 x 5" → "3 × 5". */
export function hinweisTeile(notiz) {
  return String(notiz ?? "")
    .split(/\s+·\s+/)
    .map((t) => t.trim().replace(/(\d(?:\s*kg)?)\s*x\s*(\d)/gi, "$1 × $2"))
    .filter(Boolean)
    .map((t) => {
      const m = t.match(/^([^:]{2,40}):\s+(.+)$/);
      return m ? { stichwort: m[1].trim(), text: m[2].trim() } : { stichwort: "", text: t };
    });
}

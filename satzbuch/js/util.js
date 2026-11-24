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

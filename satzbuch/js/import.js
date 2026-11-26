// Ein Import für alle Dateiarten: erkennen, lesen, in einen Plan umwandeln.
import { dateiArt, docxZuText, xlsxZuText, csvZuText } from "./dateien.js";
import { parsePlanText, validierePlan } from "./parser.js";
import { uid } from "./util.js";

export const IMPORT_ACCEPT = ".pdf,.docx,.xlsx,.csv,.tsv,.txt,.md,.json,image/*,application/pdf";

/** Fehler mit einer verständlichen Meldung und einem Hinweis, was stattdessen geht. */
export class ImportFehler extends Error {
  constructor(meldung, rat) { super(meldung); this.rat = rat; }
}

const RAT_CLAUDE = "Mit einem Claude-API-Schlüssel (Einstellungen) liest die App auch Scans und Fotos. Oder schick die Datei an Claude im Chat.";

/**
 * Datei → { plan, art, weg } . `weg` sagt, wie der Plan entstanden ist (für die Vorschau).
 * werkzeuge: { pdfZuText, planMitClaude, planAusTextMitClaude } – im Test ersetzbar.
 */
export async function dateiZuPlan(datei, { apiKey = "", werkzeuge = {} } = {}) {
  const art = dateiArt(datei);
  const name = String(datei.name || "Importierter Plan").replace(/\.[^.]+$/, "");
  const w = { ...werkzeuge };
  const claudeDatei = async () => ({ ...(await (w.planMitClaude ?? (await import("./claude.js")).planMitClaude)(datei, apiKey)), id: uid() });
  const claudeText = async (text) => ({ ...(await (w.planAusTextMitClaude ?? (await import("./claude.js")).planAusTextMitClaude)(text, apiKey)), id: uid() });

  if (!art) throw new ImportFehler("Diese Dateiart kann die App nicht lesen.", "Möglich sind PDF, Word (.docx), Excel (.xlsx), CSV, Text, Fotos und Plan-Dateien (.json).");

  if (art === "json") {
    let roh;
    try { roh = JSON.parse(await datei.text()); } catch { throw new ImportFehler("Die Datei ist keine gültige Plan-Datei.", "Plan-Dateien entstehen über „Als Datei teilen“ in der App."); }
    if (roh?.version === 1 && Array.isArray(roh.trainings)) throw new ImportFehler("Das ist eine Sicherung, kein einzelner Plan.", "Sicherungen lädst du unter Einstellungen → Sicherung laden.");
    return { plan: { ...validierePlan(roh), id: uid() }, art, weg: "Plan-Datei" };
  }

  if (art === "bild") {
    if (!apiKey) throw new ImportFehler("Fotos kann die App ohne Claude nicht lesen.", RAT_CLAUDE);
    return { plan: await claudeDatei(), art, weg: "von Claude aus dem Foto gelesen" };
  }

  let text = "";
  if (art === "pdf") text = await (w.pdfZuText ?? (await import("./pdf.js")).pdfZuText)(datei);
  else if (art === "docx") text = await docxZuText(await datei.arrayBuffer());
  else if (art === "xlsx") text = await xlsxZuText(await datei.arrayBuffer());
  else if (art === "csv") text = csvZuText(await datei.text());
  else text = await datei.text();

  const plan = parsePlanText(text, name);
  const uebungen = plan.tage.reduce((n, t) => n + t.uebungen.length, 0);
  const unsicher = plan.tage.reduce((n, t) => n + t.uebungen.filter((u) => u.pruefen).length, 0);
  const schwach = !uebungen || unsicher / uebungen > 0.5;

  if (schwach && apiKey) {
    const besser = art === "pdf" ? await claudeDatei() : await claudeText(text);
    return { plan: besser, art, weg: "von Claude gelesen" };
  }
  if (!uebungen) {
    const scan = art === "pdf" && !text.trim();
    throw new ImportFehler(scan ? "In diesem PDF steht kein lesbarer Text, wahrscheinlich ist es ein Scan." : "In der Datei wurden keine Übungen erkannt.", RAT_CLAUDE);
  }
  return { plan, art, weg: "aus der Datei gelesen", unsicher };
}

// Optional: PDF direkt von Claude lesen lassen (eigener API-Schlüssel, bleibt auf dem Gerät).
import { validierePlan } from "./parser.js";

export const MODELL = "claude-opus-5-5";

const UEBUNG = {
  type: "object",
  properties: {
    name: { type: "string" },
    saetze: { type: "integer" },
    wdh: { type: "string", description: "Wiederholungen, z. B. \"10\", \"8-12\" oder \"30 s\"" },
    gewicht: { anyOf: [{ type: "number" }, { type: "null" }], description: "kg, null wenn nicht angegeben" },
    pause: { type: "integer", description: "Pause zwischen Sätzen in Sekunden, 90 wenn nicht angegeben" },
    notiz: { type: "string", description: "Hinweise zur Ausführung, Gerät, Sitzposition; sonst leer" },
    ziele: {
      type: "array",
      description: "Ein Eintrag pro Satz, nur wenn Sätze unterschiedliche Wdh. oder Gewichte haben (Top-Satz, Back-off, Pyramide); sonst leer",
      items: {
        type: "object",
        properties: { wdh: { type: "string" }, kg: { anyOf: [{ type: "number" }, { type: "null" }] } },
        required: ["wdh", "kg"],
        additionalProperties: false,
      },
    },
  },
  required: ["name", "saetze", "wdh", "gewicht", "pause", "notiz", "ziele"],
  additionalProperties: false,
};
export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    tage: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, uebungen: { type: "array", items: UEBUNG } },
        required: ["name", "uebungen"],
        additionalProperties: false,
      },
    },
  },
  required: ["name", "tage"],
  additionalProperties: false,
};

const ANWEISUNG = `Der angehängte Inhalt (PDF, Foto oder Text) ist ein Trainingsplan fürs Fitnessstudio. Übertrage ihn vollständig in das JSON-Format.
- Ein Eintrag in "tage" pro Trainingstag bzw. Einheit (z. B. "Tag A – Push", "Montag", "Ganzkörper 1"). Gibt es nur eine Einheit, nimm einen Tag namens "Training".
- Übungsnamen auf Deutsch so, wie sie im Plan stehen; Gerätenummern oder Einstellungen in "notiz".
- Haben die Sätze einer Übung verschiedene Wdh. oder Gewichte (z. B. "4-5 / 8 / 8" mit "34 / 28 / 28"), trage jeden Satz in "ziele" ein. Supersätze als zwei Übungen mit Hinweis in "notiz".
- Zusatzgewicht (z. B. "+12,5" bei Klimmzügen) als gewicht 12.5 mit Notiz "Zusatzgewicht"; "pro Hantel" ebenfalls in die Notiz.
- Fehlen Angaben: saetze 3, wdh "10", gewicht null, pause 90.
- Aufwärmen und Cardio nur aufnehmen, wenn sie als eigene Übung im Plan stehen.
- "name" ist ein kurzer Name für den ganzen Plan.`;

function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function planMitClaude(file, apiKey, fetchFn = globalThis.fetch) {
  if (!apiKey) throw new Error("Kein API-Schlüssel hinterlegt (Einstellungen).");
  const istBild = file.type?.startsWith("image/");
  const daten = base64(await file.arrayBuffer());
  const anhang = istBild
    ? { type: "image", source: { type: "base64", media_type: file.type, data: daten } }
    : { type: "document", source: { type: "base64", media_type: "application/pdf", data: daten } };
  return anfrage(anhang, apiKey, fetchFn);
}

/** Plan aus bereits gelesenem Text (z. B. Word, Excel, CSV) von Claude strukturieren lassen. */
export async function planAusTextMitClaude(text, apiKey, fetchFn = globalThis.fetch) {
  if (!apiKey) throw new Error("Kein API-Schlüssel hinterlegt (Einstellungen).");
  const anhang = { type: "text", text: `Hier der Trainingsplan als Text (Tabellenzellen durch Tabs getrennt):\n\n${String(text).slice(0, 60000)}` };
  return anfrage(anhang, apiKey, fetchFn);
}

async function anfrage(anhang, apiKey, fetchFn) {

  const res = await fetchFn("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2026-10-21",
      "anthropic-beta": "server-side-fallback-2026-07-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODELL,
      max_tokens: 16000,
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: PLAN_SCHEMA } },
      messages: [{ role: "user", content: [anhang, { type: "text", text: ANWEISUNG }] }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || `HTTP ${res.status}`;
    if (res.status === 401) throw new Error("API-Schlüssel ungültig.");
    throw new Error("Claude-Fehler: " + msg);
  }
  if (body.stop_reason === "refusal") throw new Error("Claude hat die Anfrage abgelehnt.");
  if (body.stop_reason === "max_tokens") throw new Error("Der Plan ist zu lang für eine Antwort.");
  const text = (body.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let roh;
  try {
    roh = JSON.parse(text);
  } catch {
    throw new Error("Antwort von Claude war kein gültiger Plan.");
  }
  return { ...validierePlan(roh), quelle: "claude" };
}

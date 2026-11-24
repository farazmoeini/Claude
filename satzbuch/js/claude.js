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
  },
  required: ["name", "saetze", "wdh", "gewicht", "pause", "notiz"],
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

const ANWEISUNG = `Das angehängte PDF ist ein Trainingsplan fürs Fitnessstudio. Übertrage ihn vollständig in das JSON-Format.
- Ein Eintrag in "tage" pro Trainingstag bzw. Einheit (z. B. "Tag A – Push", "Montag", "Ganzkörper 1"). Gibt es nur eine Einheit, nimm einen Tag namens "Training".
- Übungsnamen auf Deutsch so, wie sie im Plan stehen; Gerätenummern oder Einstellungen in "notiz".
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

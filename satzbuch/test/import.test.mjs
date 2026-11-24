import { test } from "node:test";
import assert from "node:assert/strict";
import { stueckeZuZeilen } from "../js/pdf.js";
import { planMitClaude, MODELL } from "../js/claude.js";
import { parsePlanText } from "../js/parser.js";

test("PDF-Textstücke werden zu Zeilen, Spaltenlücken zu Tabs", () => {
  const z = stueckeZuZeilen([
    { str: "Kreuzheben", x: 50, y: 700, w: 60, h: 10 },
    { str: "3", x: 250, y: 700, w: 5, h: 10 },
    { str: "6", x: 320, y: 701, w: 5, h: 10 },
    { str: "Tag 1", x: 50, y: 720, w: 30, h: 12 },
    { str: "Bank", x: 50, y: 680, w: 24, h: 10 },
    { str: "drücken 3x10", x: 75, y: 680, w: 60, h: 10 },
  ]);
  assert.deepEqual(z, ["Tag 1", "Kreuzheben\t3\t6", "Bankdrücken 3x10"]);
  const p = parsePlanText(z.join("\n"));
  assert.equal(p.tage[0].uebungen[0].name, "Kreuzheben");
  assert.equal(p.tage[0].uebungen[0].saetze, 3);
});

test("Claude-Import schickt PDF als Dokument und prüft die Antwort", async () => {
  let gesendet;
  const fetchFn = async (url, opt) => {
    gesendet = { url, headers: opt.headers, body: JSON.parse(opt.body) };
    const plan = { name: "Hypertrophie", tage: [{ name: "Tag A", uebungen: [{ name: "Beinpresse", saetze: 4, wdh: "12", gewicht: null, pause: 120, notiz: "" }] }] };
    return { ok: true, status: 200, json: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(plan) }] }) };
  };
  const file = new Blob([new Uint8Array([37, 80, 68, 70])], { type: "application/pdf" });
  const plan = await planMitClaude(file, "sk-test", fetchFn);
  assert.equal(gesendet.body.model, MODELL);
  assert.equal(gesendet.headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.equal(gesendet.body.messages[0].content[0].type, "document");
  assert.equal(gesendet.body.messages[0].content[0].source.data, "JVBERg==");
  assert.equal(plan.quelle, "claude");
  assert.equal(plan.tage[0].uebungen[0].pause, 120);
  assert.equal(plan.tage[0].uebungen[0].gewicht, undefined);
});

test("Claude-Import meldet ungültigen Schlüssel verständlich", async () => {
  const fetchFn = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "invalid x-api-key" } }) });
  await assert.rejects(planMitClaude(new Blob(["x"]), "falsch", fetchFn), /ungültig/);
  await assert.rejects(planMitClaude(new Blob(["x"]), "", fetchFn), /Kein API-Schlüssel/);
});

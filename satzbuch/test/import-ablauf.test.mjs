import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dateiZuPlan, ImportFehler } from "../js/import.js";

const datei = (inhalt, name, type = "") => new File([inhalt], name, { type });
const fixture = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url));
const claudePlan = { name: "Von Claude", quelle: "claude", tage: [{ name: "A", uebungen: [{ name: "Kniebeuge", saetze: 3, wdh: "5" }] }] };

test("Word-Datei wird direkt zum Plan", async () => {
  const r = await dateiZuPlan(datei(fixture("plan.docx"), "plan.docx"));
  assert.equal(r.art, "docx");
  assert.equal(r.plan.name, "Testplan Oberkörper");
  assert.equal(r.plan.tage.length, 2);
});

test("Excel-Datei: Dateiname wird Planname, wenn keine Überschrift da ist", async () => {
  const r = await dateiZuPlan(datei(fixture("plan.xlsx"), "Beinplan.xlsx"));
  assert.equal(r.plan.name, "Beinplan");
  assert.equal(r.plan.tage.length, 2);
});

test("Text- und CSV-Dateien", async () => {
  const t = await dateiZuPlan(datei("Tag 1\nKniebeuge 5x5 100kg\nRudern 3x10 60kg", "plan.txt", "text/plain"));
  assert.equal(t.plan.tage[0].uebungen.length, 2);
  const c = await dateiZuPlan(datei("Übung;Sätze x Wdh.;Gewicht (kg)\nDips;3 x 8;+10", "plan.csv", "text/csv"));
  assert.equal(c.plan.tage[0].uebungen[0].gewicht, 10);
});

test("Sicherung statt Plan, Foto ohne Schlüssel, unbekannte Art: verständliche Fehler", async () => {
  await assert.rejects(dateiZuPlan(datei(JSON.stringify({ version: 1, plaene: [], trainings: [] }), "s.json")), (e) => e instanceof ImportFehler && /Sicherung/.test(e.message));
  await assert.rejects(dateiZuPlan(datei("x", "foto.jpg", "image/jpeg")), (e) => e instanceof ImportFehler && /Claude/.test(e.rat));
  await assert.rejects(dateiZuPlan(datei("x", "plan.pages")), (e) => e instanceof ImportFehler && /PDF, Word/.test(e.rat));
});

test("Gescanntes PDF: ohne Schlüssel klarer Fehler, mit Schlüssel liest Claude", async () => {
  const pdf = datei("%PDF", "scan.pdf", "application/pdf");
  const werkzeuge = { pdfZuText: async () => "", planMitClaude: async () => claudePlan };
  await assert.rejects(dateiZuPlan(pdf, { werkzeuge }), (e) => e instanceof ImportFehler && /Scan/.test(e.message));
  const r = await dateiZuPlan(pdf, { apiKey: "sk-test", werkzeuge });
  assert.equal(r.plan.name, "Von Claude");
  assert.match(r.weg, /Claude/);
});

test("Kaum erkannte Word-Datei geht mit Schlüssel als Text an Claude", async () => {
  let gesendet = "";
  const werkzeuge = { planAusTextMitClaude: async (text) => { gesendet = text; return claudePlan; } };
  const r = await dateiZuPlan(datei("Irgendein Fließtext ohne Übungen", "notiz.txt", "text/plain"), { apiKey: "sk-test", werkzeuge });
  assert.equal(r.plan.name, "Von Claude");
  assert.match(gesendet, /Fließtext/);
});

// Import aus Word, Excel, CSV und Text (Beispieldateien mit ausgedachten Übungen).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { docxZuText, xlsxZuText, csvZuText, dateiArt } from "../js/dateien.js";
import { parsePlanText } from "../js/parser.js";

const lade = (n) => { const b = readFileSync(new URL(`./fixtures/${n}`, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const finde = (plan, name) => plan.tage.flatMap((t) => t.uebungen).find((u) => u.name === name);

test("Dateiart erkennen", () => {
  assert.equal(dateiArt({ name: "Plan.PDF", type: "" }), "pdf");
  assert.equal(dateiArt({ name: "x.docx", type: "" }), "docx");
  assert.equal(dateiArt({ name: "x.xlsx", type: "" }), "xlsx");
  assert.equal(dateiArt({ name: "x.csv", type: "text/csv" }), "csv");
  assert.equal(dateiArt({ name: "notiz.txt", type: "text/plain" }), "text");
  assert.equal(dateiArt({ name: "foto.jpg", type: "image/jpeg" }), "bild");
  assert.equal(dateiArt({ name: "plan.json", type: "application/json" }), "json");
  assert.equal(dateiArt({ name: "x.pages", type: "" }), null);
});

test("Word (.docx): Überschriften und Tabellen werden zum Plan", async () => {
  const text = await docxZuText(lade("plan.docx"));
  const p = parsePlanText(text, "datei");
  assert.equal(p.name, "Testplan Oberkörper");
  assert.deepEqual(p.tage.map((t) => t.name), ["Mo – Drücken", "Do – Ziehen"]);
  assert.deepEqual([finde(p, "Bankdrücken").saetze, finde(p, "Bankdrücken").wdh, finde(p, "Bankdrücken").gewicht], [3, "8", 60]);
  assert.equal(finde(p, "Seitheben").gewicht, 8);
  assert.equal(finde(p, "Dips & Co").gewicht, 10);
  assert.deepEqual(finde(p, "Rudern").ziele, [{ wdh: "4-5", kg: 70 }, { wdh: "8", kg: 60 }, { wdh: "8", kg: 60 }]);
});

test("Excel (.xlsx): jedes Blatt ein Trainingstag", async () => {
  const text = await xlsxZuText(lade("plan.xlsx"));
  const p = parsePlanText(text, "Mein Excel-Plan");
  assert.deepEqual(p.tage.map((t) => t.name), ["Tag A Beine", "Tag B Rücken"]);
  assert.deepEqual([finde(p, "Kniebeuge").saetze, finde(p, "Kniebeuge").wdh, finde(p, "Kniebeuge").gewicht], [3, "5", 100]);
  assert.equal(finde(p, "Beinpresse").gewicht, 180.5);
  assert.equal(finde(p, "Latzug").gewicht, 55);
});

test("CSV mit Semikolon oder Komma, Anführungszeichen", () => {
  const a = parsePlanText(csvZuText('Tag 1:\nÜbung;Sätze x Wdh.;Gewicht (kg)\nBankdrücken;3 x 8;62,5\n"Rudern; eng";3 x 10;50'));
  assert.equal(finde(a, "Bankdrücken").gewicht, 62.5);
  assert.equal(finde(a, "Rudern; eng").gewicht, 50);
  const b = parsePlanText(csvZuText("Übung,Sätze x Wdh.,Gewicht (kg)\nKniebeuge,5 x 5,100"));
  assert.deepEqual([finde(b, "Kniebeuge").saetze, finde(b, "Kniebeuge").gewicht], [5, 100]);
});

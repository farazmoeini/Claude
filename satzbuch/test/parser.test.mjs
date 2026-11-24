import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlanText, validierePlan } from "../js/parser.js";
import { parseZahl, normName } from "../js/util.js";

const pick = (u) => ({ name: u.name, saetze: u.saetze, wdh: u.wdh, gewicht: u.gewicht, pause: u.pause });

test("parseZahl und normName", () => {
  assert.equal(parseZahl("72,5"), 72.5);
  assert.equal(parseZahl("80"), 80);
  assert.equal(parseZahl("abc"), null);
  assert.equal(normName("  Bankdrücken "), "bankdrücken");
});

test("Überschrift und Kurzschreibweise 3x10", () => {
  const p = parsePlanText("Tag A – Push\nBankdrücken 3x10 80kg 90s\nSchulterdrücken 4 x 8-12");
  assert.equal(p.quelle, "pdf");
  assert.equal(p.tage.length, 1);
  assert.equal(p.tage[0].name, "Tag A – Push");
  assert.deepEqual(pick(p.tage[0].uebungen[0]), { name: "Bankdrücken", saetze: 3, wdh: "10", gewicht: 80, pause: 90 });
  assert.deepEqual(pick(p.tage[0].uebungen[1]), { name: "Schulterdrücken", saetze: 4, wdh: "8-12", gewicht: undefined, pause: 90 });
});

test("Sätze à Wdh. und Pause in Minuten", () => {
  const p = parsePlanText("Montag\nKniebeuge 5 Sätze à 5 Wdh. 2 min Pause");
  assert.equal(p.tage[0].name, "Montag");
  assert.deepEqual(pick(p.tage[0].uebungen[0]), { name: "Kniebeuge", saetze: 5, wdh: "5", gewicht: undefined, pause: 120 });
});

test("Tabellenzeile mit Trennern", () => {
  const p = parsePlanText("Kreuzheben | 3 | 6 | 100 kg");
  assert.deepEqual(pick(p.tage[0].uebungen[0]), { name: "Kreuzheben", saetze: 3, wdh: "6", gewicht: 100, pause: 90 });
});

test("Übungen ohne Überschrift landen in Training 1", () => {
  const p = parsePlanText("Rudern 3x12\n\nTag 2\nDips 3x8");
  assert.deepEqual(p.tage.map((t) => t.name), ["Training 1", "Tag 2"]);
});

test("Pause im Format 1:30", () => {
  const p = parsePlanText("Latzug 3x10 Pause 1:30");
  assert.equal(p.tage[0].uebungen[0].pause, 90);
});

test("Gewicht mit Komma", () => {
  const p = parsePlanText("Seitheben 3x15 7,5 kg");
  assert.equal(p.tage[0].uebungen[0].gewicht, 7.5);
});

test("Kopfzeilen werden ignoriert, unbekannte Zeile wird zur Prüf-Übung", () => {
  const p = parsePlanText("Tag 1\nÜbung | Sätze | Wdh. | Gewicht\nPlank\nBeinpresse 3x10");
  const u = p.tage[0].uebungen;
  assert.deepEqual(u.map((x) => x.name), ["Plank", "Beinpresse"]);
  assert.equal(u[0].pruefen, true);
  assert.equal(u[0].saetze, 3);
  assert.equal(u[0].wdh, "10");
  assert.equal(u[1].pruefen, undefined);
});

test("Leerer Text ergibt keine Tage", () => {
  assert.deepEqual(parsePlanText("   \n ").tage, []);
});

test("validierePlan wirft bei falscher Struktur und ergänzt Standardwerte", () => {
  assert.throws(() => validierePlan({}));
  assert.throws(() => validierePlan({ name: "x", tage: [{ name: "A", uebungen: [{}] }] }));
  const p = validierePlan({ name: "Mein Plan", tage: [{ name: "A", uebungen: [{ name: "Dips" }] }] });
  assert.ok(p.id && p.tage[0].id && p.tage[0].uebungen[0].id);
  assert.deepEqual(pick(p.tage[0].uebungen[0]), { name: "Dips", saetze: 3, wdh: "10", gewicht: undefined, pause: 90 });
});

test("Tabellenzeile ohne Trenner: Name Sätze Wdh. Gewicht", () => {
  const p = parsePlanText("Tag 1\nÜbung Sätze Wdh. Gewicht\nBrustpresse 3 10 45 kg\nLatzug breit 3 8-12 50 kg\nCrunches 3 20");
  assert.deepEqual(p.tage[0].uebungen.map(pick), [
    { name: "Brustpresse", saetze: 3, wdh: "10", gewicht: 45, pause: 90 },
    { name: "Latzug breit", saetze: 3, wdh: "8-12", gewicht: 50, pause: 90 },
    { name: "Crunches", saetze: 3, wdh: "20", gewicht: undefined, pause: 90 },
  ]);
});

test("Titelzeile „Trainingsplan …“ wird zum Plannamen", () => {
  const p = parsePlanText("Trainingsplan Halle41 – Muskelaufbau\nTag 1\nDips 3x8", "datei");
  assert.equal(p.name, "Trainingsplan Halle41 – Muskelaufbau");
  assert.equal(parsePlanText("Dips 3x8", "datei").name, "datei");
});

// Pläne als Tabellen (so liefert js/pdf.js Tabellen: Zellen durch Tabs getrennt).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlanText } from "../js/parser.js";

const T = (...zeilen) => zeilen.map((z) => (Array.isArray(z) ? z.join("\t") : z)).join("\n");
const KOPF = ["Übung", "Sätze x Wdh.", "Gewicht (kg)"];
const finde = (plan, name) => plan.tage.flatMap((t) => t.uebungen).find((u) => u.name === name);

test("Tabelle mit Gewichtsspalte ohne „kg“, Listen, Zusatzgewicht, Spannen, Supersätze", () => {
  const p = parsePlanText(T(
    "Plan X",
    "Überblick | Mo Push | Di Pull",
    "Mo: Push",
    KOPF,
    ["Seitheben", "3 x 12-15", "18"],
    ["DB Bank (Top-Satz zuerst)", "4-5 / 8 / 8", "34 / 28 / 28 pro Hantel"],
    ["Klimmzüge", "4-5 / 5-6", "+12,5 / +10"],
    ["Dips", "2 x 6-10", "+25"],
    ["Schulterdrücken", "3 x 8-10", "18-20 pro Hantel"],
    ["Superset: Pushdown + Curl", "2 x 10-12 / 8-10", "41 / 10"],
    ["Plank", "2 x 30-45 Sek. pro Seite", "Körpergewicht"],
    ["Dehnung", "2 x 8", "-"],
    "ca. 58 Min.",
    "Hinweis: Top-Satz 6 Wdh. geschafft: +2 kg pro Hantel.",
    "Sa: Power (ca. 70 Min.)",
    KOPF,
    ["Rad-Sprint", "6-8 x 6-10 Sek.", "hoher Widerstand"],
    ["Box Jump", "3 x 3", "50-60 cm"],
    ["Rotation + Crunch", "2 x (10 pro Seite + 10-12)", "Gewicht wählen"],
    ["Aufwärmen Rad", "6 Min.", "-"],
  ));
  assert.equal(p.name, "Plan X");
  assert.deepEqual(p.tage.map((t) => t.name), ["Mo – Push", "Sa – Power"]);
  assert.equal(p.tage.flatMap((t) => t.uebungen).filter((u) => u.pruefen).length, 0);
  assert.equal(p.tage[0].uebungen.length, 9);

  assert.deepEqual([finde(p, "Seitheben").saetze, finde(p, "Seitheben").wdh, finde(p, "Seitheben").gewicht], [3, "12-15", 18]);
  assert.deepEqual(finde(p, "DB Bank (Top-Satz zuerst)").ziele, [{ wdh: "4-5", kg: 34 }, { wdh: "8", kg: 28 }, { wdh: "8", kg: 28 }]);
  assert.match(finde(p, "DB Bank (Top-Satz zuerst)").notiz, /pro Hantel/);
  assert.deepEqual(finde(p, "Klimmzüge").ziele, [{ wdh: "4-5", kg: 12.5 }, { wdh: "5-6", kg: 10 }]);
  assert.match(finde(p, "Klimmzüge").notiz, /Zusatzgewicht/);
  assert.equal(finde(p, "Dips").gewicht, 25);
  assert.equal(finde(p, "Schulterdrücken").gewicht, 18);
  assert.match(finde(p, "Schulterdrücken").notiz, /18-20 pro Hantel/);
  const push = finde(p, "Pushdown"), curl = finde(p, "Curl");
  assert.deepEqual([push.saetze, push.wdh, push.gewicht], [2, "10-12", 41]);
  assert.deepEqual([curl.saetze, curl.wdh, curl.gewicht], [2, "8-10", 10]);
  assert.match(push.notiz, /Superset mit Curl/);
  assert.deepEqual([finde(p, "Plank").wdh, finde(p, "Plank").gewicht], ["30-45 Sek. pro Seite", undefined]);
  assert.equal(finde(p, "Plank").notiz, "Körpergewicht");
  assert.equal(finde(p, "Dehnung").gewicht, undefined);
  assert.deepEqual([finde(p, "Rad-Sprint").saetze, finde(p, "Rad-Sprint").wdh], [6, "6-10 Sek."]);
  assert.equal(finde(p, "Box Jump").gewicht, undefined);
  assert.equal(finde(p, "Box Jump").notiz, "50-60 cm");
  assert.deepEqual([finde(p, "Rotation + Crunch").saetze, finde(p, "Rotation + Crunch").wdh], [2, "10 pro Seite + 10-12"]);
  assert.deepEqual([finde(p, "Aufwärmen Rad").saetze, finde(p, "Aufwärmen Rad").wdh], [1, "6 Min."]);
});

test("Blocktabelle W1–W3 wird mit den Tagen verknüpft (inkl. Back-off und Wochen-Ausnahme)", () => {
  const p = parsePlanText(T(
    "Kraftblock",
    "3-Wochen-Block",
    ["Übung", "Sätze", "W1 75 %", "W2 80 %", "W3 85 %"],
    ["Kniebeuge (Mo)", "3 x 3 (W3: 2 x 3)", "100", "105", "110"],
    ["Bank Volumen (Mo)", "4 x 5", "70", "70", "72,5"],
    ["Kniebeuge Back-off (Mo)", "1 x 5", "85", "90", "-"],
    ["Kreuzheben leicht (Di)", "3 x 3", "90", "90", "95"],
    "Basis: geschätzte Maxima. Back-off nach den 3 x 3, in Woche 3 entfällt er.",
    "Mo: Schwer",
    KOPF,
    ["Kniebeuge (Block) + Back-off", "3 x 3 + 1 x 5 (W1-2)", "siehe Block (W1: 100, dann 85)"],
    ["Flat Bank Volumen", "4 x 5", "70"],
    ["Rudern", "3 x 10", "35"],
    "Di: Zug",
    KOPF,
    ["Kreuzheben leicht", "3 x 3", "siehe Block (W1: 90)"],
  ));
  assert.equal(p.name, "Kraftblock");
  assert.deepEqual(p.tage.map((t) => t.uebungen.map((u) => u.name)), [["Kniebeuge", "Flat Bank Volumen", "Rudern"], ["Kreuzheben leicht"]]);
  const kb = finde(p, "Kniebeuge");
  const s = (n, wdh, kg) => Array.from({ length: n }, () => ({ wdh, kg }));
  assert.deepEqual(kb.wochen, [[...s(3, "3", 100), ...s(1, "5", 85)], [...s(3, "3", 105), ...s(1, "5", 90)], s(2, "3", 110)]);
  assert.deepEqual(finde(p, "Flat Bank Volumen").wochen, [s(4, "5", 70), s(4, "5", 70), s(4, "5", 72.5)]);
  assert.equal(finde(p, "Rudern").wochen, undefined);
  assert.equal(finde(p, "Rudern").gewicht, 35);
  assert.deepEqual(finde(p, "Kreuzheben leicht").wochen, [s(3, "3", 90), s(3, "3", 90), s(3, "3", 95)]);
});

test("Info-Tabellen ohne Sätze x Wdh. werden ignoriert; Supersatz-Hinweise je Übung", () => {
  const p = parsePlanText(T(
    "Plan Y",
    "Fr: Volumen",
    KOPF,
    ["Superset: Schrägbank + Rudern", "3 x 8-12", "26 pro Hantel / 59"],
    "Aufwärmen und Hinweise",
    "Info",
    ["Kniebeuge", "60 kg x 5, 80 kg x 2"],
    ["Pausen", "Schwer 3-4 Min., Volumen 2-3 Min."],
    ["Woche 5", "Entlastung: Gewichte ca. 10 % leichter"],
  ));
  assert.deepEqual(p.tage.map((t) => t.uebungen.map((u) => u.name)), [["Schrägbank", "Rudern"]]);
  assert.equal(finde(p, "Schrägbank").notiz, "pro Hantel · Superset mit Rudern");
  assert.equal(finde(p, "Rudern").notiz, "Superset mit Schrägbank");
  assert.equal(finde(p, "Rudern").gewicht, 59);
});

test("Freie Überschrift mit Doppelpunkt (z. B. Excel-Blattname) wird Trainingstag", () => {
  const p = parsePlanText(T("Zirkel am Abend:", KOPF, ["Bankdrücken", "3 x 8", "60"], "Kraftausdauer:", KOPF, ["Kniebeuge", "3 x 5", "100"]), "Plan");
  assert.deepEqual(p.tage.map((t) => t.name), ["Zirkel am Abend", "Kraftausdauer"]);
});

test("Umgebrochene Zeitangabe im Tagesnamen wird entfernt", () => {
  const p = parsePlanText(T("Plan", "Sa: Kniebeuge moderat + Overhead (ca. 71", "Min.)", KOPF, ["Kniebeuge", "3 x 5", "90"]), "Plan");
  assert.deepEqual(p.tage.map((t) => t.name), ["Sa – Kniebeuge moderat + Overhead"]);
});

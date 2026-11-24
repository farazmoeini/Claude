import { test } from "node:test";
import assert from "node:assert/strict";
import { e1rm, verlauf, bestleistungen, neuePRs, oPause, zusammenfassung, restzeit, trainingsDieseWoche, uebungsSchluessel, alleUebungen } from "../js/stats.js";

const tag = (d) => Date.UTC(2026, 10, d, 17);
const tr = (id, d, eintraege) => ({ id, start: tag(d), ende: tag(d) + 3_600_000, eintraege });
const satz = (kg, wdh, pauseVorher = null) => ({ kg, wdh, erledigtUm: 1, pauseVorher });

const t1 = tr("1", 16, [{ uebungName: "Bankdrücken", saetze: [satz(70, 10), satz(70, 8, 100)] }]);
const t2 = tr("2", 19, [{ uebungName: "bankdrücken ", saetze: [satz(75, 8, 80), satz(80, 5, 120)] }, { uebungName: "Klimmzüge", saetze: [satz(null, 8)] }]);

test("e1rm nach Epley", () => {
  assert.equal(Math.round(e1rm(100, 10) * 10) / 10, 133.3);
  assert.equal(e1rm(100, 1), 100);
  assert.equal(e1rm(null, 10), 0);
});

test("gleiche Übung trotz anderer Schreibweise", () => {
  assert.equal(uebungsSchluessel("Bankdrücken "), uebungsSchluessel("bankdrücken"));
  assert.deepEqual(alleUebungen([t1, t2]), ["Bankdrücken", "Klimmzüge"]);
});

test("Verlauf je Training", () => {
  const v = verlauf([t1, t2], "Bankdrücken");
  assert.equal(v.length, 2);
  assert.equal(v[0].maxKg, 70);
  assert.equal(v[0].volumen, 70 * 10 + 70 * 8);
  assert.equal(v[1].maxKg, 80);
  assert.equal(Math.round(v[1].e1rm), 95); // 75*(1+8/30)=95
});

test("Bestleistungen und neue PRs", () => {
  const b = bestleistungen([t1, t2], "Bankdrücken");
  assert.equal(b.maxKg, 80);
  assert.equal(b.datum, tag(19));
  assert.deepEqual(neuePRs([t1, t2], t2), ["bankdrücken"]);
  assert.deepEqual(neuePRs([t1], t1), []); // erstes Training ist kein PR
});

test("Durchschnittliche Pause ignoriert leere Werte", () => {
  assert.equal(oPause(t2), 100);
  assert.equal(oPause(tr("x", 1, [{ uebungName: "a", saetze: [satz(1, 1)] }])), null);
});

test("Zusammenfassung", () => {
  assert.deepEqual(zusammenfassung(t2), { dauerMin: 60, volumen: 75 * 8 + 80 * 5, saetze: 3, oPause: 100 });
});

test("Restzeit aus Zeitstempeln, nie negativ", () => {
  const start = 1_000_000;
  assert.equal(restzeit(start + 90_000, start + 30_000), 60);
  assert.equal(restzeit(start + 90_000, start + 200_000), 0);
});

test("Trainings dieser Woche ab Montag", () => {
  // 23.11.2026 ist ein Montag
  const jetzt = Date.UTC(2026, 10, 25, 12);
  assert.equal(trainingsDieseWoche([t1, t2, tr("3", 23, []), tr("4", 24, [])], jetzt), 2);
});

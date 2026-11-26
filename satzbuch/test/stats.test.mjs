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

import { sollSignal } from "../js/stats.js";

test("Pausenton: auch nach dem Zurückkehren in die App, nur einmal, nicht nach Ewigkeiten", () => {
  const ende = 1_000_000;
  assert.equal(sollSignal(ende, ende - 1000, false), false); // läuft noch
  assert.equal(sollSignal(ende, ende + 300, false), true); // gerade vorbei
  assert.equal(sollSignal(ende, ende + 20_000, false), true); // App war 20 s weg (früher: still)
  assert.equal(sollSignal(ende, ende + 20_000, true), false); // schon gemeldet
  assert.equal(sollSignal(ende, ende + 5 * 60_000, false), false); // nach 5 Min. kein Ton mehr
});

import { naechsterSatz, pausenText } from "../js/stats.js";

test("Benachrichtigung nennt den nächsten offenen Satz", () => {
  const aktiv = { eintraege: [
    { uebungName: "Kniebeuge", saetze: [{ erledigtUm: 1 }, { erledigtUm: 2 }] },
    { uebungName: "Bankdrücken", saetze: [{ erledigtUm: 3 }, { erledigtUm: null, kg: 72.5, wdh: 8 }, { erledigtUm: null }] },
  ] };
  assert.deepEqual(naechsterSatz(aktiv), { uebung: "Bankdrücken", satz: 2, kg: 72.5, wdh: 8 });
  assert.equal(pausenText(aktiv), "Weiter: Bankdrücken, Satz 2 – 72,5 kg × 8");
  const fertig = { eintraege: [{ uebungName: "Dips", saetze: [{ erledigtUm: 1 }] }] };
  assert.equal(naechsterSatz(fertig), null);
  assert.equal(pausenText(fertig), "Alle Sätze erledigt – Training beenden?");
});

import { scheibenProSeite, istLanghantel, wochenTage } from "../js/stats.js";

test("Scheiben pro Seite für eine 20-kg-Stange", () => {
  assert.deepEqual(scheibenProSeite(105), [20, 20, 2.5]);
  assert.deepEqual(scheibenProSeite(117.5), [20, 20, 5, 2.5, 1.25]);
  assert.deepEqual(scheibenProSeite(62.5), [20, 1.25]);
  assert.deepEqual(scheibenProSeite(20), []);
  assert.equal(scheibenProSeite(19), null); // leichter als die Stange
  assert.equal(scheibenProSeite(101), null); // mit diesen Scheiben nicht ladbar
  assert.equal(scheibenProSeite(null), null);
});

test("Langhantel-Übungen erkennen, Kurzhantel/Kabel/Maschine nicht", () => {
  for (const n of ["Kniebeuge", "Kniebeuge moderat", "Deadlift", "Flat Bench Volumen", "Close-Grip Bench", "Romanian Deadlift", "Bankdrücken"]) assert.equal(istLanghantel(n), true, n);
  for (const n of ["DB Bench 15°", "Schrägbank Kurzhanteln (30°)", "Biceps Hammer Kabel", "Pectoral Fly Maschine", "Pull-ups", "Einbeiniges RDL"]) assert.equal(istLanghantel(n), false, n);
});

test("Wochenleiste Mo–So mit trainierten Tagen", () => {
  const mi = Date.UTC(2026, 10, 25, 12); // Mittwoch
  const tr = [{ start: Date.UTC(2026, 10, 23, 17) }, { start: Date.UTC(2026, 10, 25, 9) }, { start: Date.UTC(2026, 10, 20, 9) }];
  const w = wochenTage(tr, mi);
  assert.deepEqual(w.map((t) => t.kurz), ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]);
  assert.deepEqual(w.map((t) => t.trainiert), [true, false, true, false, false, false, false]);
  assert.deepEqual(w.map((t) => t.heute), [false, false, true, false, false, false, false]);
  assert.deepEqual(w.map((t) => t.vorbei), [true, true, false, false, false, false, false]);
});

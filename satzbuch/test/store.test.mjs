import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../js/store.js";

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const plan = {
  name: "PPL",
  tage: [{ id: "a", name: "Tag A", uebungen: [{ name: "Bankdrücken", saetze: 3, wdh: "8-12", gewicht: 60, pause: 120 }, { name: "Dips", saetze: 2, wdh: "10" }] }],
};
const T0 = Date.UTC(2026, 10, 23, 17, 0, 0);

test("leerer Start mit Standardeinstellungen", () => {
  const s = createStore(fakeStorage());
  assert.equal(s.state.version, 1);
  assert.deepEqual(s.state.plaene, []);
  assert.equal(s.state.einstellungen.pause, 90);
  assert.equal(s.state.aktiv, null);
});

test("Plan speichern, aktiv setzen und nach Neustart wiederfinden", () => {
  const st = fakeStorage();
  const s = createStore(st);
  const p = s.setPlan(plan);
  assert.equal(s.aktiverPlan().id, p.id);
  const s2 = createStore(st);
  assert.equal(s2.aktiverPlan().name, "PPL");
});

test("Training startet mit Planwerten und übersteht einen Neustart", () => {
  const st = fakeStorage();
  const s = createStore(st);
  const p = s.setPlan(plan);
  const t = s.starteTraining(p.id, "a", T0);
  assert.equal(t.eintraege.length, 2);
  assert.equal(t.eintraege[0].saetze.length, 3);
  assert.deepEqual({ kg: t.eintraege[0].saetze[0].kg, wdh: t.eintraege[0].saetze[0].wdh }, { kg: 60, wdh: 8 });
  assert.equal(t.eintraege[0].pause, 120);
  s.satzAbhaken(0, 0, T0 + 1000);
  const s2 = createStore(st);
  assert.ok(s2.state.aktiv);
  assert.equal(s2.state.aktiv.eintraege[0].saetze[0].erledigtUm, T0 + 1000);
});

test("gemessene Pause zwischen zwei abgehakten Sätzen", () => {
  const s = createStore(fakeStorage());
  const p = s.setPlan(plan);
  s.starteTraining(p.id, "a", T0);
  s.satzAbhaken(0, 0, T0 + 10_000);
  s.satzAbhaken(0, 1, T0 + 105_000);
  assert.equal(s.state.aktiv.eintraege[0].saetze[0].pauseVorher, null);
  assert.equal(s.state.aktiv.eintraege[0].saetze[1].pauseVorher, 95);
});

test("Beenden behält nur erledigte Sätze; nächstes Training übernimmt die letzten Werte", () => {
  const s = createStore(fakeStorage());
  const p = s.setPlan(plan);
  s.starteTraining(p.id, "a", T0);
  s.aktualisiereSatz(0, 0, { kg: 72.5, wdh: 10 });
  s.aktualisiereSatz(0, 1, { kg: 72.5, wdh: 9 });
  s.satzAbhaken(0, 0, T0 + 60_000);
  s.satzAbhaken(0, 1, T0 + 180_000);
  const fertig = s.beendeTraining(T0 + 3_600_000);
  assert.equal(s.state.aktiv, null);
  assert.equal(s.state.trainings.length, 1);
  assert.equal(fertig.eintraege.length, 1); // Dips ohne erledigten Satz fällt weg
  assert.equal(fertig.eintraege[0].saetze.length, 2);

  const t2 = s.starteTraining(p.id, "a", T0 + 86_400_000);
  const saetze = t2.eintraege[0].saetze;
  assert.equal(saetze.length, 3);
  assert.deepEqual(saetze.map((x) => [x.kg, x.wdh]), [[72.5, 10], [72.5, 9], [72.5, 9]]);
  assert.deepEqual([t2.eintraege[1].saetze[0].kg, t2.eintraege[1].saetze[0].wdh], [null, 10]);
});

test("Training ohne erledigten Satz wird verworfen", () => {
  const s = createStore(fakeStorage());
  const p = s.setPlan(plan);
  s.starteTraining(p.id, "a", T0);
  assert.equal(s.beendeTraining(T0 + 1000), null);
  assert.equal(s.state.trainings.length, 0);
});

test("Export und Import ergeben denselben Zustand, ohne API-Schlüssel", () => {
  const s = createStore(fakeStorage());
  s.state.einstellungen.apiKey = "geheim";
  const p = s.setPlan(plan);
  s.starteTraining(p.id, "a", T0);
  s.satzAbhaken(0, 0, T0 + 1000);
  s.beendeTraining(T0 + 2000);
  const json = s.exportJSON(T0 + 5000);
  assert.ok(!json.includes("geheim"));
  const s2 = createStore(fakeStorage());
  s2.importJSON(json);
  assert.deepEqual(s2.state.trainings, s.state.trainings);
  assert.deepEqual(s2.state.plaene, s.state.plaene);
  assert.equal(s.state.einstellungen.letzteSicherung, T0 + 5000);
});

test("kaputte oder fremde Sicherung wirft und ändert nichts", () => {
  const s = createStore(fakeStorage());
  s.setPlan(plan);
  const vorher = JSON.stringify(s.state);
  assert.throws(() => s.importJSON("{kaputt"));
  assert.throws(() => s.importJSON(JSON.stringify({ hallo: 1 })));
  assert.equal(JSON.stringify(s.state), vorher);
});

test("beschädigter Speicher führt zu leerem Start statt Absturz", () => {
  const st = fakeStorage();
  st.setItem("satzbuch.v1", "{nicht json");
  const s = createStore(st);
  assert.deepEqual(s.state.trainings, []);
});

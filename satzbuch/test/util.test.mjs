import { test } from "node:test";
import assert from "node:assert/strict";
import { verschiebe } from "../js/util.js";

test("verschiebe: Eintrag eine Position hoch oder runter, an den Rändern unverändert", () => {
  const l = ["Lat Pulldown", "Y-Raise", "Biceps Hammer Kabel"];
  assert.deepEqual(verschiebe(l, 2, -1), ["Lat Pulldown", "Biceps Hammer Kabel", "Y-Raise"]);
  assert.deepEqual(verschiebe(l, 0, 1), ["Y-Raise", "Lat Pulldown", "Biceps Hammer Kabel"]);
  assert.deepEqual(verschiebe(l, 0, -1), l);
  assert.deepEqual(verschiebe(l, 2, 1), l);
  assert.deepEqual(l, ["Lat Pulldown", "Y-Raise", "Biceps Hammer Kabel"]); // Original unverändert
});

import { hinweisTeile } from "../js/util.js";

test("Hinweise: je Punkt eine Zeile, Stichwort vor dem Doppelpunkt, × statt x", () => {
  assert.deepEqual(hinweisTeile("Aufwärmen: 60 kg x 5, 80 kg x 2 · Back-off ca. 85 %, entfällt in Woche 4"), [
    { stichwort: "Aufwärmen", text: "60 kg × 5, 80 kg × 2" },
    { stichwort: "", text: "Back-off ca. 85 %, entfällt in Woche 4" },
  ]);
  assert.deepEqual(hinweisTeile("pro Hantel · Superset mit Pushdown"), [
    { stichwort: "", text: "pro Hantel" },
    { stichwort: "", text: "Superset mit Pushdown" },
  ]);
  assert.deepEqual(hinweisTeile("Top-Satz 6 Wdh. geschafft: +2 kg pro Hantel"), [{ stichwort: "Top-Satz 6 Wdh. geschafft", text: "+2 kg pro Hantel" }]);
  assert.deepEqual(hinweisTeile("bei 3 x 10 sauber: +2 kg"), [{ stichwort: "bei 3 × 10 sauber", text: "+2 kg" }]);
  assert.deepEqual(hinweisTeile(""), []);
  assert.deepEqual(hinweisTeile(null), []);
});

import { aehnlicherPlan } from "../js/util.js";

test("ähnlichen vorhandenen Plan zum Import finden", () => {
  const plaene = [{ id: "k", name: "Kraft" }, { id: "p", name: "Kompakt" }, { id: "b", name: "Push / Pull / Beine" }];
  assert.equal(aehnlicherPlan("Kraftplan 4 Tage", plaene)?.id, "k");
  assert.equal(aehnlicherPlan("Plan Kompakt", plaene)?.id, "p");
  assert.equal(aehnlicherPlan("kompakt", plaene)?.id, "p");
  assert.equal(aehnlicherPlan("Ganzkörper Anfänger", plaene), null);
  assert.equal(aehnlicherPlan("Plan", plaene), null); // zu allgemein
});

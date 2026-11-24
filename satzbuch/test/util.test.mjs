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

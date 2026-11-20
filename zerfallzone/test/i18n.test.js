// Jede Sprache muss jeden Text haben – sonst fällt ein Spieler mitten im Spiel auf eine andere Sprache zurück
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STR, LANGS, translate } from '../shared/i18n.js';
import { WEAPON_IDS, ABILITY_IDS, EVENTS, DIFF_IDS } from '../shared/sim.js';

const keys = Object.keys(STR.de);

for (const l of Object.keys(LANGS)) {
  test(`Sprache ${LANGS[l]} ist vollständig`, () => {
    const missing = keys.filter((k) => STR[l][k] === undefined);
    assert.deepEqual(missing, []);
    for (const k of ['help.kb', 'help.pad', 'help.rules']) assert.equal(STR[l][k].length, STR.de[k].length, `${k} gleich lang`);
    for (const k of keys) {
      if (typeof STR.de[k] !== 'string') continue;
      const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
      assert.equal(ph(STR[l][k]), ph(STR.de[k]), `Platzhalter in ${k}`);
    }
  });
}

test('alle Waffen, Fähigkeiten, Events und Stufen haben Texte', () => {
  for (const id of WEAPON_IDS) assert.ok(STR.de['w.' + id], id);
  for (const id of ABILITY_IDS) { assert.ok(STR.de['a.' + id], id); assert.ok(STR.de['a.' + id + '.d'], id); }
  for (const e of EVENTS) { assert.ok(STR.de['e.' + e.id], e.id); assert.ok(STR.de['e.' + e.id + '.d'], e.id); }
  for (const d of DIFF_IDS) assert.ok(STR.de['diff.' + d], d);
});

test('Platzhalter werden ersetzt', () => {
  assert.equal(translate('en', 'ov.place', { p: 3, n: 8 }), 'Place 3 of 8');
  assert.equal(translate('de', 'ov.place', { p: 3, n: 8 }), 'Platz 3 von 8');
});

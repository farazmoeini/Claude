// Headless-Tests des Spielkerns: ganze Runden in Solo, Duos und Trios
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim, generateWorld } from '../shared/sim.js';

const idle = (seq) => ({ seq, dt: 1 / 30, yaw: 0, pitch: 0 });

test('Welt ist für denselben Seed identisch (Client und Server)', () => {
  const a = generateWorld(1234), b = generateWorld(1234);
  assert.equal(a.boxes.length, b.boxes.length);
  assert.deepEqual(a.boxes[17].mx, b.boxes[17].mx);
  assert.deepEqual(a.pads, b.pads);
});

for (const mode of ['solo', 'duo', 'trio']) {
  test(`komplette Runde im Modus ${mode} endet mit einem Gewinnerteam`, () => {
    const sim = new Sim({ seed: 42, mode, botConfig: { leicht: 3, mittel: 6, schwer: 3, elite: 2 }, humans: [{ id: 'h1', name: 'A' }, { id: 'h2', name: 'B' }] });
    const size = { solo: 1, duo: 2, trio: 3 }[mode];
    assert.equal(sim.teamCount, Math.ceil(16 / size));
    if (size > 1) assert.equal(sim.byId.get('h1').team, sim.byId.get('h2').team, 'Freunde im selben Team');
    else assert.notEqual(sim.byId.get('h1').team, sim.byId.get('h2').team);
    let seq = 0;
    for (let i = 0; i < 30 * 900 && !sim.over; i++) {
      sim.applyInput('h1', idle(++seq));
      sim.applyInput('h2', idle(seq));
      sim.step(1 / 30);
      sim.snapshotFor('h1');
      sim.clearEvents();
    }
    assert.ok(sim.over, 'Runde ist beendet');
    const places = Object.values(sim.over.placements).sort((a, b) => a - b);
    assert.equal(places.length, sim.teamCount);
    assert.equal(places[0], 1);
  });
}

test('kein Eigenbeschuss im Team, Geist und Rückkehr per Teamkill', () => {
  const sim = new Sim({ seed: 7, mode: 'duo', botConfig: { leicht: 2 }, humans: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
  const a = sim.byId.get('a'), b = sim.byId.get('b');
  const enemy = sim.entities.find((e) => e.team !== a.team);
  const hp = b.hp;
  sim.damage(b, 50, a);
  assert.equal(b.hp, hp, 'Teamkamerad nimmt keinen Schaden');
  b.armor = 0;
  sim.damage(b, 500, enemy);
  assert.equal(b.alive, false);
  assert.equal(b.ghost, true, 'B ist Geist, weil A noch lebt');
  enemy.armor = 0;
  sim.damage(enemy, 500, a);
  assert.equal(b.alive, true, 'Kill von A holt B zurück');
  assert.equal(b.hp, 60);
});

test('Solo: Rückkehr über die Säule', () => {
  const sim = new Sim({ seed: 9, mode: 'solo', botConfig: { leicht: 3 }, humans: [{ id: 'a', name: 'A' }] });
  const a = sim.byId.get('a');
  a.armor = 0;
  sim.damage(a, 500, sim.entities[1]);
  assert.equal(a.ghost, true);
  assert.equal(a.beacons.length, 3);
  const bc = a.beacons[0];
  a.pos.set(bc.x, 0, bc.z);
  for (let i = 0; i < 100 && !a.alive; i++) { sim.applyInput('a', { ...idle(i + 1), useHeld: true }); sim.step(1 / 30); }
  assert.equal(a.alive, true);
});

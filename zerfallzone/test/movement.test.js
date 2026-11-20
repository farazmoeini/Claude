// Tests der Bewegung: Dash, verzeihende Sprünge, Wandlauf, Wandsprung, Flanken, Rutschsprung, schnelles Fallen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { movePlayer, MOVE_DEFAULTS, DASH_REGEN } from '../shared/sim.js';

const DT = 1 / 60;
const box = (x0, x1, y0, y1, z0, z1) => ({ mn: [x0, y0, z0], mx: [x1, y1, z1], gone: false });
// Lange Wand entlang der z-Achse bei x = 2…3, 20 m hoch; eine Kiste bei z = -20
const ctx = { boxes: [box(2, 3, 0, 20, -100, 100), box(-1, 1, 0, 1.4, -21, -19)], pads: [], gravMul: 1, speedMul: 1 };
const player = (x = 0, y = 0, z = 0) => ({ pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), ...MOVE_DEFAULTS });
const inp = (o = {}) => ({ yaw: 0, pitch: 0, ...o }); // yaw 0 = Blick nach −z
const run = (p, frames, o = {}, c = ctx) => { let last = {}; for (let i = 0; i < frames; i++) { const r = movePlayer(p, typeof o === 'function' ? o(i) : inp(o), DT, c); last = { ...last, ...r }; } return last; };
const hspeed = (p) => Math.hypot(p.vel.x, p.vel.z);

test('Dash: schneller Schub, verbraucht Ladung, lädt wieder auf', () => {
  const p = player(-5, 0, 0);
  run(p, 10, { az: 1 });
  const out = movePlayer(p, inp({ az: 1, dash: true }), DT, ctx);
  assert.ok(out.dash);
  assert.ok(hspeed(p) >= 23, `Tempo nach Dash ${hspeed(p)}`);
  assert.equal(p.dashN, 1);
  movePlayer(p, inp({ dash: true }), DT, ctx);
  run(p, 12);
  const out3 = movePlayer(p, inp({ dash: true }), DT, ctx);
  assert.equal(p.dashN, 0);
  assert.ok(!movePlayer(p, inp({ dash: true }), DT, ctx).dash, 'ohne Ladung kein Dash');
  run(p, Math.ceil(DASH_REGEN / DT) + 2);
  assert.equal(p.dashN, 1, 'Ladung kommt zurück');
  void out3;
});

test('Coyote-Time: Sprung kurz nach dem Verlassen der Kante zählt als Bodensprung', () => {
  const c = { ...ctx, boxes: [box(-5, 5, 0, 10, -5, 5)] };
  const p = player(0, 10, 4.0);
  run(p, 2, {}, c);
  let n = 0;
  while (p.onGround && n++ < 120) movePlayer(p, inp({ b: true }), DT, c); // rückwärts (+z) über die Kante
  run(p, 3, { b: true }, c);
  assert.equal(p.onGround, false);
  assert.ok(p.pos.y > 9.8, 'noch nahe der Kante');
  movePlayer(p, inp({ jump: true }), DT, c);
  assert.equal(p.jumps, 1, 'Bodensprung, nicht Doppelsprung');
  assert.ok(p.vel.y > 9);
});

test('Sprungpuffer: kurz vor der Landung gedrückter Sprung wird nachgeholt', () => {
  const p = player(-5, 1, 0);
  p.vel.y = -8;
  movePlayer(p, inp({ jump: true }), DT, ctx); // noch in der Luft, keine Ladung für Doppelsprung verwenden
  p.jumps = 2;
  run(p, 8);
  assert.ok(p.vel.y > 5, 'springt direkt nach der Landung');
});

test('Wandlauf entlang einer Hauswand und Wandsprung weg von der Wand', () => {
  const p = player(1.2, 3, 30);
  p.vel.set(0, 2, -14);
  p.airT = 0.3;
  const o = run(p, 40, { az: 1, ax: 0.6 }); // schräg in die Wand
  assert.ok(o.wallrun, 'Wandlauf startet');
  assert.ok(p.wrT > 0);
  const y0 = p.pos.y;
  run(p, 20, { az: 1, ax: 0.6 });
  assert.ok(p.wrT > 0, 'läuft weiter');
  assert.ok(p.pos.y > y0 - 1.5, 'fällt beim Wandlauf kaum');
  const out = movePlayer(p, inp({ az: 1, ax: 0.6, jump: true }), DT, ctx);
  assert.ok(out.walljump);
  assert.ok(p.vel.x < -5, 'stößt sich von der Wand ab');
  assert.equal(p.wrT, 0);
});

test('Flanken: beim Laufen über eine Kiste', () => {
  const p = player(0, 0, -16);
  let maxZspeed = 0;
  const o = run(p, 80, (i) => { if (i > 0) maxZspeed = Math.max(maxZspeed, -p.vel.z); return inp({ az: 1, sprint: true, f: true }); });
  assert.ok(o.mantle, 'flankt');
  assert.ok(hspeed(p) > 10, `behält Sprinttempo nach dem Flanken (${hspeed(p).toFixed(1)})`);
  assert.ok(p.pos.z < -21.3, `ist über der Kiste (z=${p.pos.z.toFixed(2)})`);
});

test('Rutschsprung behält das Tempo', () => {
  const p = player(-10, 0, 60);
  run(p, 40, { f: true, sprint: true });
  const o = movePlayer(p, inp({ f: true, sprint: true, slide: true }), DT, ctx);
  assert.ok(o.slide);
  const s0 = hspeed(p);
  movePlayer(p, inp({ f: true, jump: true }), DT, ctx);
  run(p, 20, { f: true });
  assert.ok(hspeed(p) > s0 * 0.85, `Tempo bleibt in der Luft (${s0.toFixed(1)} → ${hspeed(p).toFixed(1)})`);
});

test('Schnell fallen in der Luft', () => {
  const a = player(-10, 30, 0), b = player(-10, 30, 0);
  run(a, 30); run(b, 30, { slide: true });
  assert.ok(b.pos.y < a.pos.y - 3, 'fällt deutlich schneller');
});

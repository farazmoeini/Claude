// Zerfallzone – gemeinsamer Spielkern (läuft im Browser und auf dem Node-Server)
// Enthält Welt-Erzeugung, Physik, Waffen, Fähigkeiten, Bots, Zerfall, Kern, Teams und Snapshots.
import * as THREE from 'three';

const V = THREE.Vector3;
export const HALF = 200, SECTOR = 50, NS = 8, GRAV = 24, EYE = 1.6, BODY_H = 1.8, NODE = 25;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- Daten
export const WEAPONS = {
  funke: { name: 'Funke', desc: 'MP', color: 0x2cf3ff, dmg: 9, rate: 0.075, mag: 32, reload: 1.4, spread: 0.03, range: 70, pellets: 1, auto: true },
  puls: { name: 'Puls', desc: 'Salvengewehr', color: 0x7dff6b, dmg: 15, rate: 0.42, mag: 24, reload: 1.8, spread: 0.012, range: 120, pellets: 1, burst: 3, auto: true },
  hagel: { name: 'Hagel', desc: 'Schrotflinte', color: 0xff9b2c, dmg: 11, rate: 0.85, mag: 6, reload: 2.0, spread: 0.085, range: 28, pellets: 9, auto: false },
  lanze: { name: 'Lanze', desc: 'Railgun', color: 0xff4dd2, dmg: 60, rate: 1.0, mag: 5, reload: 2.2, spread: 0, range: 250, pellets: 1, auto: false, zoom: true, len: 0.9 },
  dorn: { name: 'Dorn', desc: 'Präzisionspistole', color: 0xd9e4ff, dmg: 26, rate: 0.28, mag: 10, reload: 1.3, spread: 0.004, range: 150, pellets: 1, auto: false, len: 0.35 },
  moerser: { name: 'Mörser', desc: 'Granatwerfer', color: 0xff5c2c, dmg: 70, rate: 0.85, mag: 4, reload: 2.4, spread: 0, range: 100, pellets: 1, auto: false, projectile: true },
};
export const WEAPON_IDS = Object.keys(WEAPONS);
const BOT_WEAPON_IDS = WEAPON_IDS.filter((id) => !WEAPONS[id].projectile);
export const LEVEL_NAMES = ['', 'I', 'II', 'III', 'IV'];
export const lvlDmg = (lvl) => 1 + (lvl - 1) * 0.15;
export const lvlMag = (w, lvl) => Math.round(w.mag * (1 + (lvl - 1) * 0.2));

export const ABILITIES = {
  sprung: { name: 'Sprung', desc: 'Blinzeln 14 m', cd: 8 },
  bollwerk: { name: 'Bollwerk', desc: 'Schutzwand', cd: 14 },
  scan: { name: 'Scan', desc: 'Gegner sichtbar', cd: 20 },
  heilung: { name: 'Heilung', desc: '+60 HP über 3 s', cd: 18 },
  katapult: { name: 'Katapult', desc: 'Superhoher Sprung', cd: 10 },
  tarnung: { name: 'Tarnung', desc: 'Unsichtbar 6 s', cd: 22 },
  schockwelle: { name: 'Schockwelle', desc: 'Stößt Gegner weg', cd: 14 },
  mine: { name: 'Mine', desc: 'Explodiert bei Nähe', cd: 12 },
  stampfer: { name: 'Stampfer', desc: 'Aus der Luft einschlagen', cd: 12 },
  bastion: { name: 'Bastion', desc: '−75 % Schaden für 4 s', cd: 20 },
  enterhaken: { name: 'Enterhaken', desc: 'Zieht dich bis 50 m an Wände und Dächer', cd: 9 },
};
export const ABILITY_IDS = Object.keys(ABILITIES);
export const abilityCd = (a) => ABILITIES[a.id].cd * (1 - (a.level - 1) * 0.15);

export const DIFFS = {
  leicht: { label: 'Leicht', short: 'L', color: 0x3dff9a, acc: 2.4, react: [1.0, 1.5], fire: 1.9, view: 50, strafe: 0.4, abil: false, jump: 0.005, head: 0.0 },
  mittel: { label: 'Mittel', short: 'M', color: 0xffd34d, acc: 1.4, react: [0.55, 0.9], fire: 1.45, view: 70, strafe: 0.7, abil: false, jump: 0.015, head: 0.1 },
  schwer: { label: 'Schwer', short: 'S', color: 0xff9b2c, acc: 0.85, react: [0.3, 0.5], fire: 1.15, view: 95, strafe: 0.9, abil: true, jump: 0.025, head: 0.25 },
  elite: { label: 'Elite', short: 'E', color: 0xff3355, acc: 0.5, react: [0.15, 0.28], fire: 1.0, view: 120, strafe: 1.0, abil: true, jump: 0.035, head: 0.45 },
};
export const DIFF_IDS = Object.keys(DIFFS);
export const BOT_LIMIT = 40;
export const MAX_PLAYERS = 48;

export const MODES = {
  solo: { size: 1, label: 'Solo' },
  duo: { size: 2, label: 'Duos' },
  trio: { size: 3, label: 'Trios' },
};

export const EVENTS = [
  { id: 'schwerelos', name: 'Niedrige Schwerkraft', desc: 'Alle springen höher' },
  { id: 'munition', name: 'Endlose Munition', desc: 'Magazine leeren sich nicht' },
  { id: 'aufladung', name: 'Schnelle Fähigkeiten', desc: 'Abklingzeiten ×3 schneller' },
  { id: 'radar', name: 'Radar', desc: 'Alle Gegner sichtbar' },
  { id: 'turbo', name: 'Turbo', desc: '+35 % Tempo für alle' },
];
export const TEAM_COLORS = [0x2cf3ff, 0xff4dd2, 0x7dff6b, 0xffd34d, 0xb06cff, 0xff9b2c, 0x2c8bff, 0xff3355];

const BOT_NAMES = ['Vex', 'Nyra', 'Kobalt', 'Ion', 'Rhea', 'Spektr', 'Lumen', 'Orca', 'Taiga', 'Flux', 'Zinn', 'Mira', 'Quarz', 'Sable', 'Juno', 'Pixel', 'Nova', 'Haze'];
const WAVES = [8, 9, 9, 9, 8, 7, 6, 4, 3];
const FIRST_WAVE = 45;
export const WARN = 12;
export const CORE_TIME = 30;

// ---------------------------------------------------------------- Hilfen
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Tageszeit einer Runde – aus dem Seed, damit online alle dieselbe sehen */
export const TIMES_OF_DAY = ['tag', 'abend', 'nacht'];
export const timeOfDay = (seed) => TIMES_OF_DAY[Math.abs(seed | 0) % 3];
export const sectorOf = (x, z) => {
  const sx = clamp(Math.floor((x + HALF) / SECTOR), 0, NS - 1);
  const sz = clamp(Math.floor((z + HALF) / SECTOR), 0, NS - 1);
  return sz * NS + sx;
};
export const sectorCenter = (i) => ({ x: -HALF + (i % NS) * SECTOR + SECTOR / 2, z: -HALF + Math.floor(i / NS) * SECTOR + SECTOR / 2 });
export const neighbors = (i) => {
  const x = i % NS, z = Math.floor(i / NS), out = [];
  if (x > 0) out.push(i - 1); if (x < NS - 1) out.push(i + 1);
  if (z > 0) out.push(i - NS); if (z < NS - 1) out.push(i + NS);
  return out;
};
const snapNode = (v) => clamp(Math.round(v / NODE) * NODE, -HALF + NODE, HALF - NODE);
export const aimDir = (yaw, pitch) => new V(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));

// ---------------------------------------------------------------- Welt (deterministisch aus Seed)
export function generateWorld(seed) {
  const R = mulberry32(seed);
  const r = (a, b) => a + R() * (b - a);
  const pk = (arr) => arr[Math.floor(R() * arr.length)];
  const boxes = [], pads = [];
  const bySector = Array.from({ length: NS * NS }, () => []);
  const edgeColors = [0x2cf3ff, 0xff4dd2, 0xb06cff, 0xffd34d];
  const add = (x0, x1, y0, y1, z0, z1, kind, edge) => {
    const b = { id: boxes.length, mn: [x0, y0, z0], mx: [x1, y1, z1], kind, edge, sector: sectorOf((x0 + x1) / 2, (z0 + z1) / 2), y0, h0: y1 - y0, off: R() * 1.5, gone: false, flicker: false };
    boxes.push(b);
    if (kind !== 'crate') bySector[b.sector].push(b);
    return b;
  };
  for (let sz = 0; sz < NS; sz++) for (let sx = 0; sx < NS; sx++) {
    const x0 = -HALF + sx * SECTOR, z0 = -HALF + sz * SECTOR;
    const centrality = 1 - Math.hypot(sx - 3.5, sz - 3.5) / 5;
    for (let lx = 0; lx < 2; lx++) for (let lz = 0; lz < 2; lz++) {
      const lotX = x0 + (lx ? 27 : 4), lotZ = z0 + (lz ? 27 : 4), LOT = 19;
      const roll = R();
      if (roll < 0.12) continue;
      const n = roll < 0.75 ? 1 : 2;
      for (let k = 0; k < n; k++) {
        const w = n === 1 ? r(9, LOT) : r(6, 9), d = n === 1 ? r(9, LOT) : r(6, LOT);
        const bx = n === 1 ? lotX + r(0, LOT - w) : lotX + (k ? LOT - w : 0);
        const bz = lotZ + r(0, LOT - d);
        const h = 4 + Math.pow(R(), 1.6) * (22 + 26 * Math.max(0, centrality));
        const bb = add(bx, bx + w, 0, h, bz, bz + d, 'building', pk(edgeColors));
        bb.style = h > 30 && R() < 0.6 ? 0 : Math.floor(R() * 4); bb.tint = R();
        if (w > 10 && d > 10 && R() < 0.5) {
          const cx = bx + r(2, w - 6), cz = bz + r(2, d - 6);
          add(cx, cx + 4, h, h + r(1.2, 3.5), cz, cz + 4, 'roof', 0x2cf3ff);
        }
      }
    }
    for (let i = 0; i < 2; i++) {
      const alongX = R() < 0.5;
      const line = (alongX ? z0 : x0) + (R() < 0.5 ? 0 : 25);
      const off = R() < 0.5 ? 2.6 : -2.6;
      const t = (alongX ? x0 : z0) + r(6, 44);
      const px = alongX ? t : line + off, pz = alongX ? line + off : t;
      if (Math.abs(px) > HALF - 3 || Math.abs(pz) > HALF - 3) continue;
      pads.push({ x: px, z: pz });
    }
  }
  for (let i = 0; i < 160; i++) {
    const alongX = R() < 0.5;
    const line = -HALF + Math.floor(r(1, NS)) * SECTOR;
    const off = (R() < 0.5 ? 1 : -1) * 3.0;
    const t = r(-HALF + 5, HALF - 5);
    const cx = alongX ? t : line + off, cz = alongX ? line + off : t;
    add(cx - 0.7, cx + 0.7, 0, r(1.0, 1.6), cz - 0.7, cz + 0.7, 'crate', 0xff4dd2);
  }
  // Gerichtete Sprungfelder: etwa jedes zweite schleudert auf ein nahes Dach
  const buildings = boxes.filter((b) => b.kind === 'building');
  // Flugbahn prüfen: Die Form der Bahn hängt nicht von der Schwerkraft ab, nur von Start, Ziel und Scheitel
  const arcClear = (pd, b, t) => {
    const g = GRAV, peak = t[1] + 4, vy = Math.sqrt(2 * g * peak), T = vy / g + Math.sqrt(8 / g);
    const vx = (t[0] - pd.x) / T, vz = (t[2] - pd.z) / T, r = 0.6;
    for (let i = 1; i <= 60; i++) {
      const tt = (T * i) / 60, x = pd.x + vx * tt, y = vy * tt - 0.5 * g * tt * tt, z = pd.z + vz * tt;
      for (const q of boxes) {
        if (x + r <= q.mn[0] || x - r >= q.mx[0] || z + r <= q.mn[2] || z - r >= q.mx[2]) continue;
        if (y + BODY_H <= q.mn[1] || y >= q.mx[1] - 0.05) continue;
        if (q === b && i === 60) continue;
        return false;
      }
    }
    return true;
  };
  for (const pd of pads) {
    if (R() < 0.5) continue;
    const cands = buildings.filter((b) => {
      const cx = (b.mn[0] + b.mx[0]) / 2, cz = (b.mn[2] + b.mx[2]) / 2, d = Math.hypot(cx - pd.x, cz - pd.z);
      return d > 10 && d < 32 && b.h0 > 8 && b.h0 < 42;
    });
    for (let tries = 0; tries < 4 && cands.length; tries++) {
      const b = cands.splice(Math.floor(R() * cands.length), 1)[0];
      const t = [(b.mn[0] + b.mx[0]) / 2, b.mx[1] + 0.2, (b.mn[2] + b.mx[2]) / 2];
      if (arcClear(pd, b, t)) { pd.t = t; break; }
    }
  }
  // Seilbahnen zwischen hohen Dächern
  const ziplines = [];
  const tall = buildings.filter((b) => b.h0 > 16);
  const top = (b) => [(b.mn[0] + b.mx[0]) / 2, b.mx[1] + 3, (b.mn[2] + b.mx[2]) / 2];
  for (const A of tall) {
    if (ziplines.length >= 30 || R() > 0.4) continue;
    const pa = top(A);
    const cands = buildings.filter((B) => B !== A && B.h0 > 10 && (() => { const d = Math.hypot((B.mn[0] + B.mx[0]) / 2 - pa[0], (B.mn[2] + B.mx[2]) / 2 - pa[2]); return d > 22 && d < 70; })());
    if (!cands.length) continue;
    const B = cands[Math.floor(R() * cands.length)];
    if (ziplines.some((z) => (z.a === A && z.b === B) || (z.a === B && z.b === A))) continue;
    const pb = top(B);
    const d = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const len = Math.hypot(...d);
    const n = d.map((v) => v / len);
    // Seil darf nichts schneiden (2,5 m Platz darunter für den Spieler)
    const blocked = boxes.some((b) => b !== A && b !== B && (rayBox(pa, n, b, len) < len || rayBox([pa[0], pa[1] - 2.5, pa[2]], n, b, len) < len));
    if (blocked) continue;
    ziplines.push({ id: ziplines.length, p0: pa, p1: pb, a: A, b: B, ha: A.mx[1], hb: B.mx[1], len, n });
  }
  // Dachaufbauten (Klimageräte, Wassertanks, Lüfter) als echte Deckung.
  // Nicht in der Dachmitte (Ziel der Sprungfelder, Seilbahnmasten) und nicht unter Seilen.
  const PROPS = { ac: [2.2, 1.3, 1.6], tank: [2.2, 2.4, 2.2], vent: [1.1, 0.9, 1.1] };
  for (const b of buildings) {
    const w = b.mx[0] - b.mn[0], d = b.mx[2] - b.mn[2];
    if (w < 9 || d < 9) continue;
    const n = Math.floor(R() * 3.2);
    const cx = (b.mn[0] + b.mx[0]) / 2, cz = (b.mn[2] + b.mx[2]) / 2;
    for (let k = 0; k < n; k++) {
      const type = ['ac', 'ac', 'vent', 'tank'][Math.floor(R() * 4)];
      const [pw, ph, pd] = PROPS[type];
      const px = b.mn[0] + 0.8 + R() * (w - pw - 1.6), pz = b.mn[2] + 0.8 + R() * (d - pd - 1.6);
      const mx = px + pw / 2, mz = pz + pd / 2;
      if (Math.hypot(mx - cx, mz - cz) < 4) continue;
      const box2 = { mn: [px, b.mx[1], pz], mx: [px + pw, b.mx[1] + ph, pz + pd] };
      if (boxes.some((q) => q !== b && q.mn[0] < box2.mx[0] + 0.5 && q.mx[0] > box2.mn[0] - 0.5 && q.mn[2] < box2.mx[2] + 0.5 && q.mx[2] > box2.mn[2] - 0.5 && q.mx[1] > box2.mn[1] && q.mn[1] < box2.mx[1])) continue;
      const underCable = ziplines.some((zl) => {
        const t = clamp(((mx - zl.p0[0]) * zl.n[0] + (mz - zl.p0[2]) * zl.n[2]) / (zl.len * Math.hypot(zl.n[0], zl.n[2]) ** 2 || 1), 0, 1);
        return Math.hypot(mx - (zl.p0[0] + (zl.p1[0] - zl.p0[0]) * t), mz - (zl.p0[2] + (zl.p1[2] - zl.p0[2]) * t)) < 3;
      });
      if (underCable) continue;
      const pb = add(px, px + pw, b.mx[1], b.mx[1] + ph, pz, pz + pd, 'prop', 0);
      pb.prop = type;
    }
  }
  // Aufwind-Säulen an den breiten Straßen (neben den Laufwegen der Bots)
  const updrafts = [];
  for (let i = 0; i < NS * NS; i++) {
    if (R() > 0.45) continue;
    const sx = i % NS, sz = Math.floor(i / NS);
    const alongX = R() < 0.5;
    const line = alongX ? -HALF + sz * SECTOR : -HALF + sx * SECTOR;
    if (line <= -HALF) continue;
    const off = R() < 0.5 ? 2.6 : -2.6;
    const t = (alongX ? -HALF + sx * SECTOR : -HALF + sz * SECTOR) + r(8, 42);
    updrafts.push({ x: alongX ? t : line + off, z: alongX ? line + off : t, r: 1.8, h: 55 });
  }
  return { seed, boxes, pads, bySector, ziplines, updrafts };
}

/** Gebäude in zerfallenen Sektoren versinken – reine Funktion der Zeit, damit Client und Server übereinstimmen. */
export function applyDissolve(world, decayAt, time) {
  let changed = false;
  for (let i = 0; i < NS * NS; i++) {
    if (decayAt[i] < 0) continue;
    for (const b of world.bySector[i]) {
      if (b.gone) continue;
      const d = time - decayAt[i];
      if (d < 1.5) { b.flicker = d >= 0; continue; }
      b.flicker = false;
      const f = clamp(1 - (d - 1.5) / 5, 0, 1);
      b.mn[1] = b.y0 * f;
      b.mx[1] = b.mn[1] + b.h0 * f;
      if (f <= 0) { b.gone = true; changed = true; }
    }
  }
  return changed;
}

// ---------------------------------------------------------------- Physik
export function moveEntity(e, dt, boxes) {
  const r = 0.45;
  e.onGround = false;
  e.wallBox = null;
  e.wallN = null;
  e.pos.x += e.vel.x * dt;
  for (const b of boxes) {
    if (b.gone || e.pos.y >= b.mx[1] - 0.001 || e.pos.y + BODY_H <= b.mn[1]) continue;
    if (e.pos.z + r <= b.mn[2] || e.pos.z - r >= b.mx[2]) continue;
    if (e.pos.x + r > b.mn[0] && e.pos.x - r < b.mx[0]) {
      const pl = e.pos.x + r - b.mn[0], pr = b.mx[0] - (e.pos.x - r);
      e.pos.x += pl < pr ? -pl : pr;
      e.vel.x = 0; e.wallBox = b; e.wallN = [pl < pr ? -1 : 1, 0];
    }
  }
  e.pos.z += e.vel.z * dt;
  for (const b of boxes) {
    if (b.gone || e.pos.y >= b.mx[1] - 0.001 || e.pos.y + BODY_H <= b.mn[1]) continue;
    if (e.pos.x + r <= b.mn[0] || e.pos.x - r >= b.mx[0]) continue;
    if (e.pos.z + r > b.mn[2] && e.pos.z - r < b.mx[2]) {
      const pl = e.pos.z + r - b.mn[2], pr = b.mx[2] - (e.pos.z - r);
      e.pos.z += pl < pr ? -pl : pr;
      e.vel.z = 0; e.wallBox = b; e.wallN = [0, pl < pr ? -1 : 1];
    }
  }
  const prevY = e.pos.y;
  e.pos.y += e.vel.y * dt;
  for (const b of boxes) {
    if (b.gone) continue;
    if (e.pos.x + r <= b.mn[0] || e.pos.x - r >= b.mx[0] || e.pos.z + r <= b.mn[2] || e.pos.z - r >= b.mx[2]) continue;
    if (e.vel.y <= 0 && prevY >= b.mx[1] - 0.25 && e.pos.y < b.mx[1]) {
      e.pos.y = b.mx[1]; e.vel.y = 0; e.onGround = true;
    } else if (e.vel.y > 0 && prevY + BODY_H <= b.mn[1] + 0.05 && e.pos.y + BODY_H > b.mn[1]) {
      e.pos.y = b.mn[1] - BODY_H; e.vel.y = 0;
    }
  }
  if (e.pos.y <= 0) { e.pos.y = 0; e.vel.y = 0; e.onGround = true; }
  e.pos.x = clamp(e.pos.x, -HALF + 0.5, HALF - 0.5);
  e.pos.z = clamp(e.pos.z, -HALF + 0.5, HALF - 0.5);
}

export function rayBox(o, d, b, maxT) {
  let tmin = 0, tmax = maxT;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < b.mn[a] || o[a] > b.mx[a]) return Infinity;
    } else {
      let t1 = (b.mn[a] - o[a]) / d[a], t2 = (b.mx[a] - o[a]) / d[a];
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}
function raySphere(o, d, c, rad) {
  const ox = o[0] - c[0], oy = o[1] - c[1], oz = o[2] - c[2];
  const b = ox * d[0] + oy * d[1] + oz * d[2];
  const cc = ox * ox + oy * oy + oz * oz - rad * rad;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : Infinity;
}
export function rayWorld(o, d, maxT, boxes) {
  let best = maxT;
  for (const b of boxes) {
    if (b.gone) continue;
    const t = rayBox(o, d, b, best);
    if (t < best) best = t;
  }
  if (d[1] < 0) { const t = -o[1] / d[1]; if (t < best) best = t; }
  return best;
}

/** Startwerte aller Bewegungs-Zustände (für Server, Snapshot und Client-Vorhersage) */
export const MOVE_DEFAULTS = {
  onGround: false, jumps: 0, climb: 1.1, slideT: 0, slideCd: 0, slamT: 0, slamming: false, lastWall: false, ghost: false,
  coyote: 0, jumpBuf: 0, dashN: 2, dashRegen: 0, dashT: 0, wrT: 0, wrNx: 0, wrNz: 0, wrCd: 0, airT: 0, vaultV: 0, padT: 0,
  zlId: -1, zlT: 0, zlDir: 1, zlV: 0, zlCd: 0, zipBuf: 0, grT: 0, grX: 0, grY: 0, grZ: 0, hang: 0, hangY: 0, updraft: false,
};
export const MOVE_FIELDS = Object.keys(MOVE_DEFAULTS);
export const DASH_MAX = 2, DASH_REGEN = 2.2;
const MAX_SPEED = 30;

/**
 * Bewegung eines gesteuerten Spielers. Identisch auf Client (Vorhersage) und Server.
 * Enthält: verzeihende Sprünge (Coyote-Time + Sprungpuffer), Schwung in der Luft, Dash mit Ladungen,
 * Rutschen mit Tempo-Mitnahme, Wandlauf + Wandsprung, Klettern, Hochziehen/Flanken, schnelles Fallen.
 * Rückgabe: Ereignisse für Klang und Kamera ({ dash, slide, dj, walljump, wallrun, mantle, land, pad, slam }).
 */
export function movePlayer(p, inp, dt, ctx) {
  const out = {};
  for (const k in MOVE_DEFAULTS) if (p[k] === undefined) p[k] = MOVE_DEFAULTS[k];
  const sy = Math.sin(inp.yaw), cy = Math.cos(inp.yaw);
  const fx = -sy, fz = -cy; // vorwärts
  let wx = 0, wz = 0;
  if (inp.f) { wx += fx; wz += fz; }
  if (inp.b) { wx -= fx; wz -= fz; }
  if (inp.r) { wx += cy; wz -= sy; }
  if (inp.l) { wx -= cy; wz += sy; }
  // Analoger Stick (Controller): ax = rechts, az = vorwärts, jeweils −1…1
  const ax = clamp(+inp.ax || 0, -1, 1), az = clamp(+inp.az || 0, -1, 1);
  if (ax || az) { wx += fx * az + cy * ax; wz += fz * az - sy * ax; }
  let wl = Math.hypot(wx, wz);
  if (wl > 1) { wx /= wl; wz /= wl; wl = 1; }
  const fwdHeld = inp.f || az > 0.5;
  const sprint = inp.sprint && fwdHeld && !inp.aim;
  const speed = (p.ghost ? 12 : sprint ? 12.5 : 8.5) * ctx.speedMul;
  const hs = Math.hypot(p.vel.x, p.vel.z);

  // Zeitgeber
  p.coyote = Math.max(0, p.coyote - dt);
  p.jumpBuf = Math.max(0, p.jumpBuf - dt);
  p.slideCd = Math.max(0, p.slideCd - dt);
  p.wrCd = Math.max(0, p.wrCd - dt);
  if (p.dashN < DASH_MAX) { p.dashRegen += dt; if (p.dashRegen >= DASH_REGEN) { p.dashN++; p.dashRegen = 0; } } else p.dashRegen = 0;

  p.zlCd = Math.max(0, p.zlCd - dt);
  if (p.padT > 0) p.padT = p.onGround ? 0 : p.padT - dt;
  // Seilbahn fahren: Position folgt dem Seil, Springen oder Dash löst
  if (p.zlId >= 0) {
    const z = ctx.ziplines && ctx.ziplines[p.zlId];
    if (!z || !zipAlive(z) || p.ghost) { p.zlId = -1; }
    else {
      const slope = z.n[1] * p.zlDir; // bergab schneller
      p.zlV = clamp(p.zlV + (20 - p.zlV) * Math.min(1, 1.5 * dt) - slope * GRAV * 0.5 * dt, 10, 30);
      p.zlT += (p.zlDir * p.zlV * dt) / z.len;
      const t = clamp(p.zlT, 0, 1);
      p.pos.set(z.p0[0] + (z.p1[0] - z.p0[0]) * t, z.p0[1] + (z.p1[1] - z.p0[1]) * t - 2.1, z.p0[2] + (z.p1[2] - z.p0[2]) * t);
      p.vel.set(z.n[0] * p.zlDir * p.zlV, z.n[1] * p.zlDir * p.zlV, z.n[2] * p.zlDir * p.zlV);
      p.onGround = false; p.airT = 0.2; p.jumps = 1; p.wrT = 0;
      if (inp.jump || inp.dash || p.zlT <= 0 || p.zlT >= 1) {
        p.zlId = -1; p.zlCd = 0.6;
        p.vel.y = Math.max(p.vel.y, inp.jump ? 9 : 4);
        out.zipoff = true;
        if (!inp.dash) return out;
      } else { out.zipping = true; return out; }
    }
  }
  // An der Kante hängen: Zielen halten. Springen zieht hoch, Loslassen lässt fallen
  if (p.hang) {
    if (inp.jump) {
      p.hang = 0; p.vel.y = Math.sqrt(2 * GRAV * ctx.gravMul * 1.9); p.vel.x = fx * 6; p.vel.z = fz * 6; p.vaultV = 8;
      out.mantle = true;
    } else if (!inp.aim || inp.slide || p.ghost) { p.hang = 0; p.vel.set(0, -1, 0); }
    else { p.vel.set(0, 0, 0); p.pos.y = p.hangY; p.onGround = false; p.jumps = 1; p.coyote = 0; out.hanging = true; return out; }
  }
  // Dash: kurzer Schub in Laufrichtung (ohne Eingabe: Blickrichtung), am Boden und in der Luft
  if (inp.dash && p.dashN > 0 && !p.ghost && !(p.dashT > 0)) {
    let dx = wx, dz = wz;
    if (wl < 0.2) { dx = fx; dz = fz; } else { dx /= wl; dz /= wl; }
    const v = Math.max(24 * ctx.speedMul, p.vel.x * dx + p.vel.z * dz);
    p.vel.x = dx * v; p.vel.z = dz * v;
    if (!p.onGround) p.vel.y = Math.max(p.vel.y, 1.5);
    p.dashT = 0.16; p.dashN--; p.wrT = 0;
    out.dash = true;
  }
  // Rutschen: beim Sprinten oder mit Schwung (z. B. direkt nach einem Dash)
  if (inp.slide && p.onGround && !(p.slideT > 0) && !(p.slideCd > 0) && !p.ghost && (sprint || hs > 10)) {
    const v = Math.min(22, Math.max(hs + 3, 15));
    const dx = hs > 1 ? p.vel.x / hs : fx, dz = hs > 1 ? p.vel.z / hs : fz;
    p.vel.x = dx * v; p.vel.z = dz * v;
    p.slideT = 0.85; p.slideCd = 0.9;
    out.slide = true;
  }
  if (p.slamT > 0) { p.slamT -= dt; if (p.slamT <= 0) { p.vel.y = -45; p.slamming = true; } }

  // Springen: Puffer + Coyote-Time, Wandsprung, Doppelsprung
  let jumped = false;
  if (inp.jump) p.jumpBuf = 0.13;
  if (p.jumpBuf > 0 && (p.onGround || p.coyote > 0)) {
    p.vel.y = 9.5; p.jumps = 1; p.jumpBuf = 0; p.coyote = 0; jumped = true;
    if (p.slideT > 0) { p.slideT = 0; out.slidejump = true; } // Tempo aus dem Rutschen bleibt erhalten
  } else if (inp.jump && p.wrT > 0) {
    p.vel.x += p.wrNx * 9; p.vel.z += p.wrNz * 9; p.vel.y = 10;
    p.wrT = 0; p.wrCd = 0.35; p.jumps = 1; p.jumpBuf = 0; jumped = true;
    out.walljump = true;
  } else if (inp.jump && !p.onGround && p.jumps < 2 && !p.lastWall) {
    p.vel.y = 9; p.jumps = 2; p.jumpBuf = 0;
    // Doppelsprung lenkt den Schwung in die gewünschte Richtung um
    if (wl > 0.2) {
      const h = Math.hypot(p.vel.x, p.vel.z), v = Math.max(h * 0.9, speed);
      p.vel.x = p.vel.x * 0.3 + (wx / wl) * v * 0.7; p.vel.z = p.vel.z * 0.3 + (wz / wl) * v * 0.7;
    }
    out.dj = true;
  }

  // Horizontal
  const grounded = p.onGround && !jumped;
  if (p.dashT > 0) {
    p.dashT -= dt;
  } else if (p.slideT > 0 && grounded) {
    p.slideT -= dt;
    const k = 1 - 1.1 * dt;
    p.vel.x *= k; p.vel.z *= k;
  } else if (grounded) {
    const accel = 14;
    p.vel.x += (wx * speed - p.vel.x) * Math.min(1, accel * dt);
    p.vel.z += (wz * speed - p.vel.z) * Math.min(1, accel * dt);
  } else {
    if (p.slideT > 0) p.slideT -= dt;
    // Luft: Schwung bleibt, man kann lenken, aber nicht über das bisherige Tempo hinaus beschleunigen
    const cap = Math.max(hs, speed);
    p.vel.x += wx * 30 * dt; p.vel.z += wz * 30 * dt;
    let nh = Math.hypot(p.vel.x, p.vel.z);
    if (nh > cap) { p.vel.x *= cap / nh; p.vel.z *= cap / nh; nh = cap; }
    if (nh > speed && !(p.padT > 0)) { const k = 1 - 0.35 * dt; p.vel.x *= k; p.vel.z *= k; }
  }
  // Wandlauf: Tempo entlang der Wand halten und leicht an die Wand drücken
  if (p.wrT > 0) {
    const tx = -p.wrNz, tz = p.wrNx;
    const vt = p.vel.x * tx + p.vel.z * tz;
    const v = Math.sign(vt || 1) * Math.max(Math.abs(vt), 10);
    p.vel.x = tx * v - p.wrNx * 1.5; p.vel.z = tz * v - p.wrNz * 1.5;
    if (p.vel.y < -1.5) p.vel.y = -1.5;
  }

  // Enterhaken: zieht zum Ziel
  if (p.grT > 0) {
    p.grT -= dt;
    const dx = p.grX - p.pos.x, dy = p.grY - (p.pos.y + 1.2), dz = p.grZ - p.pos.z, d = Math.hypot(dx, dy, dz);
    if (d < 2.2 || p.grT <= 0 || inp.jump) {
      p.grT = 0; p.vel.y = Math.max(p.vel.y, 7); out.grappleEnd = true;
    } else {
      p.vel.x += (dx / d * 28 - p.vel.x) * Math.min(1, 8 * dt);
      p.vel.y += (dy / d * 28 - p.vel.y) * Math.min(1, 8 * dt);
      p.vel.z += (dz / d * 28 - p.vel.z) * Math.min(1, 8 * dt);
    }
  }
  // Aufwind: hebt sanft nach oben, Doppelsprung danach wieder frei
  p.updraft = false;
  if (ctx.updrafts) for (const u of ctx.updrafts) {
    if (p.pos.y < u.h && Math.hypot(p.pos.x - u.x, p.pos.z - u.z) < u.r + 0.4) {
      p.updraft = true; p.jumps = Math.min(p.jumps, 1); p.wrT = 0;
      p.vel.y += (16 - p.vel.y) * Math.min(1, 4 * dt);
      out.updraft = true;
      break;
    }
  }
  // Vertikal
  let g = GRAV * ctx.gravMul;
  if (p.dashT > 0 || p.grT > 0 || p.updraft) g = 0;
  else if (p.wrT > 0) g *= 0.25;
  else if (inp.slide && !p.onGround && p.airT > 0.12 && !p.ghost) { g *= 2.8; out.fastfall = true; }
  p.vel.y = Math.max(-45, p.vel.y - g * dt);
  if (p.lastWall && inp.jumpHeld && fwdHeld && p.climb > 0 && !p.onGround && !(p.wrT > 0)) {
    p.vel.y = Math.max(p.vel.y, 7);
    p.climb -= dt;
  }
  const h2 = Math.hypot(p.vel.x, p.vel.z);
  if (h2 > MAX_SPEED) { p.vel.x *= MAX_SPEED / h2; p.vel.z *= MAX_SPEED / h2; }

  const preVx = p.vel.x, preVz = p.vel.z, fallV = p.vel.y, wasGround = p.onGround;
  moveEntity(p, dt, ctx.boxes);
  if (p.slamming && p.onGround) { p.slamming = false; out.slam = true; }
  if (p.onGround) {
    if (!wasGround && fallV < -12) out.land = -fallV;
    p.jumps = 0; p.climb = 1.1; p.coyote = 0.12; p.airT = 0; p.wrT = 0;
    if (p.jumpBuf > 0) { p.vel.y = 9.5; p.jumps = 1; p.jumpBuf = 0; p.coyote = 0; p.onGround = false; } // gepufferter Sprung bei Landung
  } else p.airT += dt;
  p.lastWall = !!p.wallBox;

  // Wandlauf beenden oder beginnen
  if (p.wrT > 0) {
    p.wrT += dt;
    const contact = p.wallN && p.wallN[0] === p.wrNx && p.wallN[1] === p.wrNz;
    if (!contact || p.onGround || p.wrT > 1.4) { p.wrT = 0; p.wrCd = 0.3; }
  } else if (!p.onGround && p.wallN && !(p.wrCd > 0) && !p.ghost && p.airT > 0.05 && wl > 0.3 && p.wallBox.mx[1] - p.pos.y > 1.6) {
    const nx = p.wallN[0], nz = p.wallN[1], tx = -nz, tz = nx;
    const vt = preVx * tx + preVz * tz;
    if (Math.abs(vt) > 6) {
      const v = Math.sign(vt) * Math.max(Math.abs(vt), 11);
      p.wrT = 0.0001; p.wrNx = nx; p.wrNz = nz;
      p.vel.x = tx * v; p.vel.z = tz * v; p.vel.y = Math.max(p.vel.y, 3);
      p.jumps = 1;
      out.wallrun = true;
    }
  }
  // Hochziehen an Kanten (in der Luft) und Flanken über niedrige Hindernisse (beim Laufen)
  if (p.wallBox && inp.aim && !p.onGround && !(p.wrT > 0) && p.vel.y < 3 && !p.ghost) {
    const rise = p.wallBox.mx[1] - p.pos.y;
    if (rise > 1.2 && rise < 2.3) { p.hang = 1; p.hangY = p.wallBox.mx[1] - 1.45; p.pos.y = p.hangY; p.vel.set(0, 0, 0); out.hang = true; }
  }
  // Seilbahn: nur auf Interaktion (X / F). Ein kurz vorher gedrückter Knopf wird 0,3 s gemerkt.
  if (inp.zip) p.zipBuf = 0.3;
  p.zipBuf = Math.max(0, p.zipBuf - dt);
  if (p.zipBuf > 0 && !p.hang && p.zlId < 0 && !(p.zlCd > 0) && !p.ghost && ctx.ziplines) {
    const hit = nearZipline(p, ctx.ziplines, 1.8);
    if (hit) {
      const z = hit.z;
      const along = p.vel.x * z.n[0] + p.vel.z * z.n[2];
      const look = fx * z.n[0] + fz * z.n[2];
      p.zlId = z.id; p.zlT = hit.t; p.zlDir = (Math.abs(along) > 3 ? along : look) >= 0 ? 1 : -1;
      p.zlV = Math.max(14, Math.abs(along)); p.dashT = 0; p.grT = 0; p.zipBuf = 0; p.onGround = false;
      out.zipon = true;
    }
  }
  if (p.wallBox && fwdHeld && !p.hang && !(p.wrT > 0) && p.vel.y < 6) {
    const rise = p.wallBox.mx[1] - p.pos.y;
    const ok = p.onGround ? rise > 0.3 && rise < 1.7 && Math.hypot(preVx, preVz) > 4 : rise > 0 && rise < 2.3;
    if (ok) {
      p.vel.y = Math.sqrt(2 * GRAV * ctx.gravMul * (rise + 0.3));
      p.vaultV = Math.max(p.vaultV, Math.min(16, Math.max(Math.hypot(preVx, preVz), speed)));
      p.vel.x += fx * 4; p.vel.z += fz * 4;
      p.onGround = false;
      out.mantle = true;
    }
  }
  // Nach dem Flanken das vorherige Tempo zurückgeben, sobald die Kante frei ist
  if (p.vaultV > 0 && !out.mantle) {
    if (!p.wallBox && !p.onGround) {
      p.vel.x = fx * p.vaultV; p.vel.z = fz * p.vaultV; p.vaultV = 0;
    } else if (p.onGround && !p.wallBox) p.vaultV = 0;
  }
  if (checkJumpPad(p, ctx.pads, GRAV * ctx.gravMul)) { out.pad = true; p.jumps = 1; p.dashT = 0; }
  return out;
}
/** Sprungfelder: senkrecht (30 m/s) oder gerichtet auf ein Dach (ballistische Bahn, 1,4 s Flug) */
export function checkJumpPad(e, pads, g = GRAV) {
  if (!e.onGround || e.pos.y > 0.2) return false;
  for (const p of pads) {
    if (Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < 1.2) {
      if (p.t) {
        // hoher Bogen: Scheitel 4 m über dem Dach, damit man sicher über die Kante kommt
        const peak = p.t[1] + 4 - e.pos.y;
        const vy = Math.sqrt(2 * g * peak);
        const T = vy / g + Math.sqrt(2 * 4 / g);
        e.vel.set((p.t[0] - e.pos.x) / T, vy, (p.t[2] - e.pos.z) / T);
        e.padT = T;
      } else e.vel.y = 30;
      e.onGround = false;
      return true;
    }
  }
  return false;
}
/** Nächstes nutzbares Seil in Reichweite der Hände (für Interaktion und Hinweis) */
export function nearZipline(p, ziplines, reach) {
  const hx = p.pos.x, hy = p.pos.y + 2.0, hz = p.pos.z;
  let best = null;
  for (const z of ziplines) {
    if (!zipAlive(z)) continue;
    const t = clamp(((hx - z.p0[0]) * z.n[0] + (hy - z.p0[1]) * z.n[1] + (hz - z.p0[2]) * z.n[2]) / z.len, 0, 1);
    if (t < 0.02 || t > 0.98) continue;
    const d = Math.hypot(hx - (z.p0[0] + (z.p1[0] - z.p0[0]) * t), hy - (z.p0[1] + (z.p1[1] - z.p0[1]) * t), hz - (z.p0[2] + (z.p1[2] - z.p0[2]) * t));
    if (d < reach && (!best || d < best.d)) best = { z, t, d };
  }
  return best;
}
/** Seilbahn nutzbar, solange beide Gebäude stehen */
export const zipAlive = (z) => !z.a.gone && !z.b.gone && z.a.mx[1] > z.ha - 0.3 && z.b.mx[1] > z.hb - 0.3;

// ---------------------------------------------------------------- Simulation
export class Sim {
  /**
   * @param {object} o
   * @param {number} o.seed
   * @param {'solo'|'duo'|'trio'} o.mode
   * @param {object} o.botConfig  Anzahl Bots je Schwierigkeit
   * @param {{id:string,name:string}[]} o.humans  in Team-Reihenfolge
   */
  constructor({ seed, mode = 'solo', botConfig = {}, humans = [] }) {
    this.seed = seed;
    this.modeId = MODES[mode] ? mode : 'solo';
    this.mode = MODES[this.modeId];
    this.world = generateWorld(seed);
    this.walls = [];
    this.allBoxes = this.world.boxes.slice();
    this.time = 0;
    this.events = [];
    this.entities = [];
    this.byId = new Map();
    this.loot = [];
    this.lootSeq = 1;
    this.mines = [];
    this.projectiles = [];
    this.sectors = new Array(NS * NS).fill(0);
    this.decayAt = new Array(NS * NS).fill(-1);
    this.decay = { wave: 0, nextAt: FIRST_WAVE, warning: [], attractor: { x: rand(-120, 120), z: rand(-120, 120) } };
    this.core = null;
    this.cityEvent = null;
    this.nextEventAt = 75;
    this.gravMul = 1;
    this.over = null;
    this.eliminated = new Map(); // team -> Platz

    // Teams zusammenstellen: Menschen zuerst, dann mit Bots auffüllen
    const size = this.mode.size;
    const diffs = DIFF_IDS.flatMap((k) => Array(clamp(botConfig[k] | 0, 0, BOT_LIMIT)).fill(k));
    for (let i = diffs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [diffs[i], diffs[j]] = [diffs[j], diffs[i]]; }
    let slot = 0;
    for (const h of humans) { this.addEntity({ id: h.id, name: h.name, isBot: false, team: Math.floor(slot / size) }); slot++; }
    let bi = 0;
    for (const d of diffs) {
      if (this.entities.length >= MAX_PLAYERS) break;
      const D = DIFFS[d];
      const base = BOT_NAMES[bi % BOT_NAMES.length] + (bi >= BOT_NAMES.length ? ' ' + (Math.floor(bi / BOT_NAMES.length) + 1) : '');
      this.addEntity({ id: 'b' + bi, name: `${base} [${D.short}]`, isBot: true, diff: d, team: Math.floor(slot / size) });
      slot++; bi++;
    }
    this.teamCount = Math.ceil(slot / size);

    // Absprung: Teams landen gemeinsam
    for (let t = 0; t < this.teamCount; t++) {
      const bx = snapNode(rand(-HALF, HALF)), bz = snapNode(rand(-HALF, HALF));
      this.teamMembers(t).forEach((e, k) => e.pos.set(bx + k * 2.5, 70 + rand(0, 25), bz + (k % 2) * 2));
    }
    this.spawnAllLoot();
  }

  addEntity({ id, name, isBot, diff, team }) {
    const e = {
      id, name, isBot, diff: diff || null, team, alive: true, ghost: false, soloGhost: false, left: false,
      hp: 100, armor: isBot ? 0 : 50, pos: new V(), vel: new V(), yaw: 0, pitch: 0,
      ...MOVE_DEFAULTS, wallBox: null, wallN: null,
      weapons: [null, null], cur: 0, abilities: [null, null],
      fireCd: 0, burstLeft: 0, burstCd: 0, reloading: 0, healLeft: 0, rev: {}, cloak: 0, shieldT: 0,
      kills: 0, usedRevive: false, ghostT: 0, reviveHold: 0, beacons: [], seq: 0, lastFire: false, aim: false,
    };
    if (isBot) {
      const D = DIFFS[diff];
      const lvlBonus = diff === 'elite' ? 1 : diff === 'schwer' && Math.random() < 0.5 ? 1 : 0;
      e.weapons[0] = this.newWeapon(pick(BOT_WEAPON_IDS), Math.min(4, randi(1, 2) + lvlBonus));
      e.armor = clamp(randi(0, 2) * 25 + (diff === 'elite' ? 50 : diff === 'schwer' ? 25 : 0), 0, 100);
      e.D = D;
      e.ai = { path: [], goal: null, scanCd: rand(0, 0.3), target: null, strafe: 1, strafeCd: 0, stuckT: 0, lastPos: new V(), jumpCd: 0, abilityCd: rand(5, 15), followCd: 0 };
    } else {
      e.weapons[0] = this.newWeapon('funke', 1);
      e.abilities[0] = { id: 'sprung', level: 1, cd: 0 };
    }
    this.entities.push(e);
    this.byId.set(id, e);
    return e;
  }
  newWeapon(id, level = 1) { return { id, level, ammo: lvlMag(WEAPONS[id], level) }; }
  teamMembers(t) { return this.entities.filter((e) => e.team === t); }
  ev(id) { return this.cityEvent && this.cityEvent.id === id; }
  ctx() { return { boxes: this.allBoxes, pads: this.world.pads, ziplines: this.world.ziplines, updrafts: this.world.updrafts, gravMul: this.gravMul, speedMul: this.ev('turbo') ? 1.35 : 1 }; }
  emit(e) { this.events.push(e); }
  /** Nachricht als Sprachschlüssel – jeder Client übersetzt in seine Sprache (shared/i18n.js) */
  msg(key, p, to) { this.emit({ k: 'msg', key, ...(p ? { p } : {}), ...(to !== undefined ? { to } : {}) }); }
  reveal(e, team, t) { e.rev[team] = Math.max(e.rev[team] || 0, t); }
  revealedTo(e, team) { return (e.rev[team] || 0) > 0 || (e.rev.all || 0) > 0; }
  teamInPlay(t) { return this.teamMembers(t).some((m) => m.alive || (m.ghost && m.soloGhost)); }

  // ------------------------------------------------ Schleife
  step(dt) {
    if (this.over) return;
    this.time += dt;
    for (const e of this.entities) {
      if (e.isBot && e.alive) this.updateBot(e, dt);
      for (const k in e.rev) e.rev[k] -= dt;
      if (e.alive && e.healLeft > 0) { const h = Math.min(e.healLeft, 20 * dt); e.healLeft -= h; e.hp = Math.min(100, e.hp + h); }
      if (e.cloak > 0) e.cloak -= dt;
      if (e.shieldT > 0) e.shieldT -= dt;
      if (!e.isBot) {
        for (const a of e.abilities) if (a && a.cd > 0) a.cd -= dt * (this.ev('aufladung') ? 3 : 1);
        if (e.reloading > 0 && e.alive) {
          e.reloading -= dt;
          const w = e.weapons[e.cur];
          if (e.reloading <= 0 && w) w.ammo = lvlMag(WEAPONS[w.id], w.level);
        }
        if (e.ghost && e.soloGhost) this.updateSoloGhost(e, dt);
      }
    }
    this.updateDecay(dt);
    this.updateCore(dt);
    this.updateEvents(dt);
    this.updateWalls(dt);
    this.updateProjectiles(dt);
    this.updateMines(dt);
    this.autoPickup();
  }

  // ------------------------------------------------ Eingaben von Menschen
  /** inp: { seq, dt, yaw, pitch, f,b,l,r, jump, jumpHeld, sprint, slide, fire, aim, reload, use, useHeld, q, e, w1, w2, swap } */
  applyInput(id, inp) {
    const p = this.byId.get(id);
    if (!p || this.over || p.left) return;
    const dt = clamp(+inp.dt || 0, 0, 0.1);
    p.seq = inp.seq | 0;
    p.yaw = +inp.yaw || 0;
    p.pitch = clamp(+inp.pitch || 0, -1.55, 1.55);
    p.aim = !!inp.aim;
    if (!p.alive && !p.ghost) return;
    const out = movePlayer(p, inp, dt, this.ctx());
    if (out.slam) this.explode(new V(p.pos.x, p.pos.y + 0.5, p.pos.z), 6.5, 50, p, { noSelf: true, push: 18, color: 0xffd34d });
    if (out.pad) this.emit({ k: 'snd', s: 'pad', to: p.id });
    if (out.slide) this.emit({ k: 'snd', s: 'slide', to: p.id });
    // Für alle anderen hörbar (Ortung von Gegnern am Klang)
    for (const s of ['dash', 'slide', 'dj', 'walljump', 'wallrun', 'zipon', 'zipoff', 'pad', 'mantle', 'slam']) {
      if (out[s]) this.emit({ k: 'ms', id: p.id, s, p: [r2(p.pos.x), r2(p.pos.y + 1), r2(p.pos.z)] });
    }
    if (out.land > 16) this.emit({ k: 'ms', id: p.id, s: 'land', p: [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z)] });
    if (p.ghost) { this.ghostInput(p, inp, dt); return; }

    if (inp.w1 && p.weapons[0] && p.cur !== 0) { p.cur = 0; p.reloading = 0; p.burstLeft = 0; }
    if (inp.w2 && p.weapons[1] && p.cur !== 1) { p.cur = 1; p.reloading = 0; p.burstLeft = 0; }
    if (inp.swap && p.weapons[1 - p.cur]) { p.cur = 1 - p.cur; p.reloading = 0; p.burstLeft = 0; }
    if (inp.q) this.useAbility(p, 0);
    if (inp.e) this.useAbility(p, 1);
    if (inp.use) { const it = this.nearestLoot(p, 2.6); if (it) this.pickUp(p, it); }

    const w = p.weapons[p.cur];
    p.fireCd -= dt;
    if (w && p.reloading <= 0) {
      const W = WEAPONS[w.id];
      const fireEdge = inp.fire && !p.lastFire;
      if (inp.reload && w.ammo < lvlMag(W, w.level)) { p.reloading = W.reload; this.emit({ k: 'snd', s: 'reload', to: p.id }); this.emit({ k: 'ms', id: p.id, s: 'reload', p: [r2(p.pos.x), r2(p.pos.y + 1), r2(p.pos.z)] }); }
      else if (p.burstLeft > 0) {
        p.burstCd -= dt;
        if (p.burstCd <= 0) { this.playerShot(p, w); p.burstLeft--; p.burstCd = 0.07; }
      } else if ((W.auto ? inp.fire : fireEdge) && p.fireCd <= 0) {
        if (w.ammo <= 0) { p.reloading = W.reload; this.emit({ k: 'snd', s: 'reload', to: p.id }); this.emit({ k: 'ms', id: p.id, s: 'reload', p: [r2(p.pos.x), r2(p.pos.y + 1), r2(p.pos.z)] }); }
        else {
          this.playerShot(p, w);
          if (W.burst) { p.burstLeft = W.burst - 1; p.burstCd = 0.07; }
          p.fireCd = W.rate;
        }
      }
    }
    p.lastFire = !!inp.fire;
  }
  playerShot(p, w) {
    if (w.ammo <= 0) return;
    const o = new V(p.pos.x, p.pos.y + EYE, p.pos.z);
    this.fireWeapon(p, o, aimDir(p.yaw, p.pitch), w, 1);
    p.cloak = 0;
  }

  // ------------------------------------------------ Waffen
  fireWeapon(shooter, origin, dir, w, shots = 1) {
    const W = WEAPONS[w.id];
    if (W.projectile) {
      if (w.ammo <= 0) return;
      if (!this.ev('munition')) w.ammo--;
      this.launchProjectile(shooter, origin.clone().addScaledVector(dir, 0.8), dir, w);
      this.emit({ k: 'shot', id: shooter.id, w: w.id, from: [r2(origin.x), r2(origin.y), r2(origin.z)], tos: [] });
      return;
    }
    for (let s = 0; s < shots; s++) {
      if (w.ammo <= 0) break;
      if (!this.ev('munition')) w.ammo--;
      const tos = [];
      for (let k = 0; k < W.pellets; k++) {
        const sp = W.spread * (shooter.aim && W.zoom ? 0.3 : shooter.aim ? 0.7 : 1) + (s > 0 ? 0.008 : 0);
        const d = dir.clone();
        if (sp > 0) { d.x += rand(-sp, sp); d.y += rand(-sp, sp); d.z += rand(-sp, sp); d.normalize(); }
        const res = this.traceShot([origin.x, origin.y, origin.z], [d.x, d.y, d.z], W.range, shooter);
        const end = origin.clone().addScaledVector(d, Math.min(res.t, W.range));
        tos.push([r2(end.x), r2(end.y), r2(end.z), res.hit ? 1 : res.t < W.range ? 0 : -1]);
        if (res.hit) {
          let dmg = W.dmg * lvlDmg(w.level) * (res.head ? 1.6 : 1);
          if (W.pellets > 1) dmg *= clamp(1.2 - res.t / W.range, 0.35, 1);
          if (res.hit.team !== shooter.team) {
            this.damage(res.hit, dmg, shooter);
            this.emit({ k: 'hit', to: shooter.id, head: res.head });
          }
        }
      }
      this.emit({ k: 'shot', id: shooter.id, w: w.id, from: [r2(origin.x), r2(origin.y), r2(origin.z)], tos });
    }
  }
  traceShot(o, d, range, shooter) {
    let t = rayWorld(o, d, range, this.allBoxes), hit = null, head = false;
    for (const e of this.entities) {
      if (!e.alive || e === shooter) continue;
      const th = raySphere(o, d, [e.pos.x, e.pos.y + 1.62, e.pos.z], 0.3);
      if (th < t) { t = th; hit = e; head = true; }
      const tb = raySphere(o, d, [e.pos.x, e.pos.y + 0.95, e.pos.z], 0.52);
      if (tb < t) { t = tb; hit = e; head = false; }
    }
    return { t, hit, head };
  }
  hasLOS(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const dist = Math.hypot(dx, dy, dz);
    return rayWorld([a.x, a.y, a.z], [dx / dist, dy / dist, dz / dist], dist, this.allBoxes) >= dist - 0.05;
  }

  damage(target, amount, source) {
    if (!target.alive || this.over) return;
    if (source && source !== target && source.team === target.team) return; // kein Eigenbeschuss im Team
    if (target.shieldT > 0) amount *= 0.25;
    if (target.armor > 0) {
      const absorbed = Math.min(target.armor, amount * 0.7);
      target.armor -= absorbed;
      amount -= absorbed;
    }
    target.hp -= amount;
    if (!target.isBot) this.emit({ k: 'dmg', to: target.id, a: Math.round(amount), ...(source && source !== target ? { s: [r2(source.pos.x), r2(source.pos.z)] } : {}) });
    if (target.hp <= 0) this.kill(target, source);
  }

  kill(t, s) {
    if (!t.alive) return;
    t.alive = false;
    t.hp = 0;
    const byEnemy = s && s !== t && s.team !== t.team;
    if (byEnemy && s.alive) { s.kills++; this.tryTeamRevive(s); }
    this.emit({ k: 'kill', a: byEnemy ? s.name : null, at: byEnemy ? s.team : -1, b: t.name, bt: t.team });
    for (const w of t.weapons) if (w) this.spawnLoot('weapon', w.id, w.level, t.pos.x + rand(-1, 1), t.pos.y, t.pos.z + rand(-1, 1));
    this.spawnLoot('health', null, 1, t.pos.x, t.pos.y, t.pos.z);
    t.weapons = [null, null]; t.cur = 0; t.cloak = 0; t.shieldT = 0; t.healLeft = 0; t.burstLeft = 0; t.reloading = 0;
    const mates = this.teamMembers(t.team);
    const teamAlive = mates.some((m) => m.alive);
    if (!this.core && !t.left) {
      if (this.mode.size > 1 && teamAlive) this.makeGhost(t, false);
      else if (this.mode.size === 1 && !t.isBot && !t.usedRevive) this.makeGhost(t, true);
    }
    if (!this.teamInPlay(t.team)) {
      for (const m of mates) if (m.ghost) this.endGhost(m);
      this.eliminateTeam(t.team);
    }
  }

  makeGhost(t, solo) {
    t.ghost = true; t.soloGhost = solo; t.vel.set(0, 0, 0);
    if (solo) {
      t.usedRevive = true; t.ghostT = 45; t.reviveHold = 0;
      const safe = this.sectors.map((s, i) => i).filter((i) => this.sectors[i] === 0);
      safe.sort((a, b) => {
        const ca = sectorCenter(a), cb = sectorCenter(b);
        return Math.hypot(ca.x - t.pos.x, ca.z - t.pos.z) - Math.hypot(cb.x - t.pos.x, cb.z - t.pos.z);
      });
      t.beacons = safe.slice(1, 4).concat(safe.slice(0, 1)).slice(0, 3).map((i) => ({ ...sectorCenter(i), sector: i }));
      this.msg('msg.ghostSolo', null, t.id);
    } else {
      this.msg('msg.ghostTeam', null, t.id);
    }
    this.emit({ k: 'snd', s: 'ghost', to: t.id });
  }
  endGhost(m) { m.ghost = false; m.soloGhost = false; m.beacons = []; }
  revive(m, x, y, z) {
    m.ghost = false; m.soloGhost = false; m.beacons = []; m.alive = true;
    m.hp = 60; m.armor = 0; m.weapons = [this.newWeapon(m.isBot ? pick(BOT_WEAPON_IDS) : 'funke', 1), null]; m.cur = 0;
    m.pos.set(x, y, z); m.vel.set(0, 0, 0); m.fireCd = 0.5;
    if (m.ai) { m.ai.path = []; m.ai.goal = null; m.ai.target = null; }
    this.emit({ k: 'revive', id: m.id, name: m.name, team: m.team });
  }
  tryTeamRevive(killer) {
    if (this.mode.size < 2) return;
    const g = this.teamMembers(killer.team).find((m) => m.ghost && !m.left);
    if (g) this.revive(g, killer.pos.x + rand(-1.5, 1.5), killer.pos.y + 0.5, killer.pos.z + rand(-1.5, 1.5));
  }
  ghostInput(p, inp, dt) {
    if (!p.soloGhost) return;
    let near = null;
    for (const b of p.beacons) if (Math.hypot(b.x - p.pos.x, b.z - p.pos.z) < 3 && p.pos.y < 3) near = b;
    p.nearBeacon = !!near;
    if (near && inp.useHeld) {
      p.reviveHold += dt;
      if (p.reviveHold >= 3) this.revive(p, near.x, 0, near.z);
    } else p.reviveHold = Math.max(0, p.reviveHold - dt);
  }
  updateSoloGhost(p, dt) {
    p.ghostT -= dt;
    p.beacons = p.beacons.filter((b) => this.sectors[b.sector] !== 2);
    if (p.ghostT <= 0 || !p.beacons.length || this.core) {
      this.endGhost(p);
      if (!this.teamInPlay(p.team)) this.eliminateTeam(p.team);
    }
  }
  eliminateTeam(team) {
    if (this.eliminated.has(team) || this.over) return;
    let inPlay = 0;
    for (let t = 0; t < this.teamCount; t++) if (t !== team && !this.eliminated.has(t) && this.teamInPlay(t)) inPlay++;
    this.eliminated.set(team, inPlay + 1);
    this.emit({ k: 'teamout', team, place: inPlay + 1 });
    this.checkWin();
  }
  checkWin() {
    if (this.over) return;
    const left = [];
    for (let t = 0; t < this.teamCount; t++) if (!this.eliminated.has(t) && this.teamInPlay(t)) left.push(t);
    if (left.length <= 1) this.finish(left.length ? left[0] : -1);
  }
  finish(winner) {
    if (this.over) return;
    if (winner >= 0) this.eliminated.set(winner, 1);
    let place = 2;
    for (let t = 0; t < this.teamCount; t++) if (!this.eliminated.has(t)) this.eliminated.set(t, place);
    this.over = { winner, placements: Object.fromEntries(this.eliminated), time: this.time };
    this.emit({ k: 'over', ...this.over });
  }
  removeHuman(id) {
    const e = this.byId.get(id);
    if (!e || e.left) return;
    e.left = true;
    if (e.alive) this.kill(e, null);
    else if (e.ghost) { this.endGhost(e); if (!this.teamInPlay(e.team)) this.eliminateTeam(e.team); }
    this.msg('msg.left', { name: e.name });
  }

  // ------------------------------------------------ Projektile, Explosionen, Minen, Wände
  launchProjectile(owner, origin, dir, w) {
    this.projectiles.push({ owner, pos: origin.clone(), vel: dir.clone().multiplyScalar(45), life: 4, dmg: WEAPONS[w.id].dmg * lvlDmg(w.level) });
  }
  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.vel.y -= GRAV * 0.5 * this.gravMul * dt;
      const step = p.vel.length() * dt;
      const d = p.vel.clone().normalize();
      const res = this.traceShot([p.pos.x, p.pos.y, p.pos.z], [d.x, d.y, d.z], step, p.owner);
      p.life -= dt;
      if (res.t < step || p.life <= 0) {
        this.explode(p.pos.clone().addScaledVector(d, Math.max(0, Math.min(res.t, step) - 0.1)), 4.5, p.dmg, p.owner);
        this.projectiles.splice(i, 1);
        continue;
      }
      p.pos.addScaledVector(d, step);
    }
  }
  explode(pos, radius, dmg, source, opts = {}) {
    let hitSomeone = false;
    for (const e of this.entities) {
      if (!e.alive) continue;
      if (opts.noSelf && e === source) continue;
      if (source && e !== source && e.team === source.team) continue;
      const c = new V(e.pos.x, e.pos.y + 0.9, e.pos.z);
      const dist = c.distanceTo(pos);
      if (dist > radius) continue;
      const f = 1 - (dist / radius) * 0.6;
      const push = c.clone().sub(pos);
      push.y = Math.max(push.y, 0.4);
      e.vel.addScaledVector(push.normalize(), (opts.push || 14) * f);
      this.damage(e, dmg * f * (e === source ? 0.3 : 1), source);
      if (e !== source) hitSomeone = true;
    }
    if (hitSomeone && source) this.emit({ k: 'hit', to: source.id, head: false });
    this.emit({ k: 'boom', p: [r2(pos.x), r2(pos.y), r2(pos.z)], r: radius, c: opts.color || 0xff9b2c });
  }
  updateMines(dt) {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.arm -= dt; m.life -= dt;
      let boom = m.life <= 0 || !m.owner.alive && !m.owner.ghost;
      if (m.arm <= 0) {
        for (const e of this.entities) {
          if (e.alive && e.team !== m.owner.team && Math.hypot(e.pos.x - m.pos.x, e.pos.z - m.pos.z) < 3 && Math.abs(e.pos.y - m.pos.y) < 2) boom = true;
        }
      }
      if (boom) {
        if (m.life > 0) this.explode(new V(m.pos.x, m.pos.y + 0.4, m.pos.z), 4.5, m.dmg, m.owner, { noSelf: true });
        this.mines.splice(i, 1);
      }
    }
  }
  addWall(x0, x1, y0, y1, z0, z1) {
    const b = { id: 'w' + (this.lootSeq++), mn: [x0, y0, z0], mx: [x1, y1, z1], kind: 'wall', life: 8, gone: false };
    this.walls.push(b);
    this.allBoxes = this.world.boxes.concat(this.walls);
  }
  updateWalls(dt) {
    let changed = false;
    for (let i = this.walls.length - 1; i >= 0; i--) {
      this.walls[i].life -= dt;
      if (this.walls[i].life <= 0) { this.walls.splice(i, 1); changed = true; }
    }
    if (changed) this.allBoxes = this.world.boxes.concat(this.walls);
  }

  // ------------------------------------------------ Fähigkeiten
  useAbility(p, slot) {
    const a = p.abilities[slot];
    if (!a || a.cd > 0 || !p.alive) return;
    const fwd = aimDir(p.yaw, p.pitch);
    switch (a.id) {
      case 'sprung': {
        const flat = new V(fwd.x, Math.max(fwd.y, -0.2), fwd.z).normalize();
        const t = rayWorld([p.pos.x, p.pos.y + 1.0, p.pos.z], [flat.x, flat.y, flat.z], 14, this.allBoxes);
        p.pos.addScaledVector(flat, Math.max(0, t - 0.8));
        p.pos.y = Math.max(0, p.pos.y);
        p.vel.y = Math.max(p.vel.y, 2);
        break;
      }
      case 'bollwerk': {
        const flat = new V(fwd.x, 0, fwd.z).normalize();
        const c = p.pos.clone().addScaledVector(flat, 3.2);
        const alongX = Math.abs(flat.z) > Math.abs(flat.x);
        const hw = 2.4, ht = 0.3;
        this.addWall(alongX ? c.x - hw : c.x - ht, alongX ? c.x + hw : c.x + ht, p.pos.y, p.pos.y + 3.2, alongX ? c.z - ht : c.z - hw, alongX ? c.z + ht : c.z + hw);
        break;
      }
      case 'scan':
        for (const e of this.entities) if (e.alive && e.team !== p.team && e.pos.distanceTo(p.pos) < 90) this.reveal(e, p.team, 6);
        break;
      case 'heilung': p.healLeft = 60; break;
      case 'katapult': p.vel.y = 26; p.jumps = 1; break;
      case 'tarnung': p.cloak = 6; break;
      case 'schockwelle':
        this.explode(new V(p.pos.x, p.pos.y + 1, p.pos.z), 8, 30, p, { noSelf: true, push: 24, color: 0xb06cff });
        break;
      case 'mine': {
        const own = this.mines.filter((m) => m.owner === p);
        if (own.length >= 3) this.mines.splice(this.mines.indexOf(own[0]), 1);
        this.mines.push({ id: this.lootSeq++, pos: p.pos.clone(), owner: p, arm: 0.8, life: 90, dmg: 75 });
        break;
      }
      case 'stampfer':
        p.slamT = p.onGround ? 0.3 : 0.01;
        if (p.onGround) { p.vel.y = 11; p.onGround = false; }
        break;
      case 'bastion': p.shieldT = 4; break;
      case 'enterhaken': {
        const o = [p.pos.x, p.pos.y + EYE, p.pos.z];
        let best = 50;
        for (const b of this.allBoxes) { if (b.gone) continue; const t = rayBox(o, [fwd.x, fwd.y, fwd.z], b, best); if (t > 0.5 && t < best) best = t; }
        if (best >= 50) { this.emit({ k: 'snd', s: 'nodash', to: p.id }); return; } // nichts getroffen: keine Abklingzeit
        p.grT = 1.4; p.grX = o[0] + fwd.x * best; p.grY = o[1] + fwd.y * best; p.grZ = o[2] + fwd.z * best;
        p.zlId = -1; p.hang = 0; p.wrT = 0;
        break;
      }
    }
    a.cd = abilityCd(a);
    this.emit({ k: 'snd', s: 'ab_' + a.id, to: p.id });
    this.emit({ k: 'ms', id: p.id, s: 'ab_' + a.id, p: [r2(p.pos.x), r2(p.pos.y + 1), r2(p.pos.z)] });
  }

  // ------------------------------------------------ Beute
  spawnLoot(type, id, level, x, y, z) {
    const it = { id: this.lootSeq++, type, wid: id, level, x, base: y + 0.7, z };
    this.loot.push(it);
    this.emit({ k: 'l+', it: lootArr(it) });
    return it;
  }
  removeLoot(it) {
    this.loot.splice(this.loot.indexOf(it), 1);
    this.emit({ k: 'l-', id: it.id });
  }
  spawnAllLoot() {
    const roofs = this.world.boxes.filter((b) => (b.mx[0] - b.mn[0]) > 5 && b.mx[1] > 3);
    const roofSpot = () => { const b = pick(roofs); return [rand(b.mn[0] + 1, b.mx[0] - 1), b.mx[1], rand(b.mn[2] + 1, b.mx[2] - 1)]; };
    const streetSpot = () => {
      const line = -HALF + randi(1, 15) * 25, t = rand(-HALF + 5, HALF - 5);
      return Math.random() < 0.5 ? [t, 0, line + rand(-1, 1)] : [line + rand(-1, 1), 0, t];
    };
    const spot = () => {
      for (let k = 0; k < 10; k++) {
        const s = Math.random() < 0.65 ? roofSpot() : streetSpot();
        const blocked = this.world.boxes.some((b) => s[0] > b.mn[0] && s[0] < b.mx[0] && s[2] > b.mn[2] && s[2] < b.mx[2] && s[1] + 0.5 > b.mn[1] && s[1] < b.mx[1] - 0.01);
        if (!blocked) return s;
      }
      return streetSpot();
    };
    const scale = clamp(this.entities.length / 16, 1, 2.5);
    for (let i = 0; i < 110 * scale; i++) { const s = spot(); this.spawnLoot('weapon', pick(WEAPON_IDS), Math.random() < 0.15 ? 2 : 1, ...s); }
    for (let i = 0; i < 70 * scale; i++) { const s = spot(); this.spawnLoot('ability', pick(ABILITY_IDS), 1, ...s); }
    for (let i = 0; i < 50 * scale; i++) { const s = spot(); this.spawnLoot('health', null, 1, ...s); }
    for (let i = 0; i < 50 * scale; i++) { const s = spot(); this.spawnLoot('armor', null, 1, ...s); }
    this.events = []; // Startbeute geht als Liste mit dem Startpaket raus
  }
  nearestLoot(p, maxD) {
    let best = null, bd = maxD;
    for (const it of this.loot) {
      if (it.type === 'health' || it.type === 'armor') continue;
      const d = Math.hypot(it.x - p.pos.x, it.base - 0.7 - p.pos.y, it.z - p.pos.z);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  pickUp(p, it) {
    if (it.type === 'weapon') {
      const same = p.weapons.findIndex((w) => w && w.id === it.wid && w.level < 4);
      if (same >= 0) {
        const w = p.weapons[same];
        w.level = Math.min(4, w.level + it.level);
        w.ammo = lvlMag(WEAPONS[w.id], w.level);
        p.cur = same;
        this.emit({ k: 'snd', s: 'fuse', to: p.id });
        this.msg('msg.fused', { w: WEAPONS[w.id].name, lvl: LEVEL_NAMES[w.level] }, p.id);
      } else {
        let slot = p.weapons.findIndex((w) => !w);
        if (slot < 0) { slot = p.cur; const old = p.weapons[slot]; this.spawnLoot('weapon', old.id, old.level, p.pos.x, p.pos.y, p.pos.z); }
        p.weapons[slot] = this.newWeapon(it.wid, it.level);
        p.cur = slot; p.reloading = 0; p.burstLeft = 0;
        this.emit({ k: 'snd', s: 'pickup', to: p.id });
      }
    } else if (it.type === 'ability') {
      const same = p.abilities.findIndex((a) => a && a.id === it.wid && a.level < 4);
      if (same >= 0) { p.abilities[same].level++; this.emit({ k: 'snd', s: 'fuse', to: p.id }); }
      else {
        let slot = p.abilities.findIndex((a) => !a);
        if (slot < 0) { slot = 0; this.spawnLoot('ability', p.abilities[0].id, 1, p.pos.x, p.pos.y, p.pos.z); }
        p.abilities[slot] = { id: it.wid, level: 1, cd: 0 };
        this.emit({ k: 'snd', s: 'pickup', to: p.id });
      }
    }
    this.removeLoot(it);
  }
  autoPickup() {
    for (const e of this.entities) {
      if (!e.alive) continue;
      for (let i = this.loot.length - 1; i >= 0; i--) {
        const it = this.loot[i];
        if (Math.abs(it.x - e.pos.x) > 1.8 || Math.abs(it.z - e.pos.z) > 1.8 || Math.abs(it.base - 0.7 - e.pos.y) > 1.8) continue;
        if (it.type === 'health' && e.hp < 100) { e.hp = Math.min(100, e.hp + 35); this.removeLoot(it); if (!e.isBot) this.emit({ k: 'snd', s: 'heal', to: e.id }); }
        else if (it.type === 'armor' && e.armor < 100) { e.armor = Math.min(100, e.armor + 25); this.removeLoot(it); if (!e.isBot) this.emit({ k: 'snd', s: 'armor', to: e.id }); }
        else if (e.isBot && it.type === 'weapon') {
          const w = e.weapons[0];
          if (w && w.id === it.wid && w.level < 4) { w.level = Math.min(4, w.level + it.level); this.removeLoot(it); }
        }
      }
    }
  }

  // ------------------------------------------------ Bots
  randomSafeNode() {
    const safe = this.sectors.map((s, i) => (s === 0 ? i : -1)).filter((i) => i >= 0);
    const c = sectorCenter(safe.length ? pick(safe) : 0);
    return { x: c.x + pick([-25, 0, 0]), z: c.z + pick([-25, 0, 0]) };
  }
  planPath(bot, goal) {
    const nx = snapNode(bot.pos.x), nz = snapNode(bot.pos.z);
    bot.ai.goal = goal;
    bot.ai.path = [{ x: nx, z: nz }, { x: goal.x, z: nz }, goal];
  }
  updateBot(b, dt) {
    const ai = b.ai, D = b.D;
    ai.scanCd -= dt;
    if (ai.scanCd <= 0) {
      ai.scanCd = 0.3;
      let best = null, bestD = D.view;
      const eye = { x: b.pos.x, y: b.pos.y + EYE, z: b.pos.z };
      for (const e of this.entities) {
        if (e === b || !e.alive || e.team === b.team) continue;
        let d = b.pos.distanceTo(e.pos);
        if (e.cloak > 0 && d > 6) continue;
        if (this.core && Math.hypot(e.pos.x - this.core.x, e.pos.z - this.core.z) < 5) d *= 0.5;
        if (d < bestD && this.hasLOS(eye, { x: e.pos.x, y: e.pos.y + 1.2, z: e.pos.z })) { best = e; bestD = d; }
      }
      if (best && best !== ai.target) b.fireCd = Math.max(b.fireCd, rand(...D.react));
      ai.target = best;
    }
    const goalSector = ai.goal ? this.sectors[sectorOf(ai.goal.x, ai.goal.z)] : 2;
    // Im Team: dem nächsten Teamkameraden folgen
    ai.followCd -= dt;
    let leader = null;
    if (this.mode.size > 1 && !this.core && ai.followCd <= 0) {
      ai.followCd = 3;
      let ld = Infinity;
      for (const m of this.teamMembers(b.team)) {
        if (m === b || !m.alive) continue;
        const d = m.pos.distanceTo(b.pos) - (m.isBot ? 0 : 1000); // Menschen bevorzugen
        if (d < ld) { ld = d; leader = m; }
      }
      if (leader && leader.pos.distanceTo(b.pos) > 18 && this.sectors[sectorOf(leader.pos.x, leader.pos.z)] === 0) {
        this.planPath(b, { x: snapNode(leader.pos.x), z: snapNode(leader.pos.z) });
      }
    }
    if (!ai.goal || goalSector !== 0 || (this.core && Math.random() < 0.01)) {
      this.planPath(b, this.core ? { x: this.core.x, z: this.core.z } : this.randomSafeNode());
    }
    if (this.sectors[sectorOf(b.pos.x, b.pos.z)] === 2 && ai.goal && this.sectors[sectorOf(ai.goal.x, ai.goal.z)] !== 0) this.planPath(b, this.randomSafeNode());

    const speed = 7.5 * (this.ev('turbo') ? 1.35 : 1);
    let mx = 0, mz = 0;
    const t = ai.target;
    if (ai.path.length) {
      const wp = ai.path[0];
      const dx = wp.x - b.pos.x, dz = wp.z - b.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.2) {
        ai.path.shift();
        if (!ai.path.length) {
          if (this.core) ai.path = [{ x: this.core.x + rand(-2, 2), z: this.core.z + rand(-2, 2) }];
          else if (this.mode.size === 1) this.planPath(b, this.randomSafeNode());
        }
      } else { mx = dx / d; mz = dz / d; }
    }
    if (t) {
      const dx = t.pos.x - b.pos.x, dz = t.pos.z - b.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      ai.strafeCd -= dt;
      if (ai.strafeCd <= 0) { ai.strafe = (Math.random() < 0.5 ? -1 : 1) * D.strafe; ai.strafeCd = rand(0.4, 1.4) / D.strafe; }
      mx = mx * 0.35 + (-dz / d * ai.strafe) * 0.8;
      mz = mz * 0.35 + (dx / d * ai.strafe) * 0.8;
      b.yaw = Math.atan2(-dx, -dz);
    } else if (mx || mz) b.yaw = Math.atan2(-mx, -mz);

    const accel = b.onGround ? 12 : 3;
    b.vel.x += (mx * speed - b.vel.x) * Math.min(1, accel * dt);
    b.vel.z += (mz * speed - b.vel.z) * Math.min(1, accel * dt);
    b.vel.y -= GRAV * this.gravMul * dt;
    ai.jumpCd -= dt;
    if (b.onGround && ai.jumpCd <= 0 && (t ? Math.random() < D.jump : b.wallBox)) { b.vel.y = 9; ai.jumpCd = 1.2; }
    moveEntity(b, dt, this.allBoxes);
    checkJumpPad(b, this.world.pads, GRAV * this.gravMul);

    ai.stuckT += dt;
    if (ai.stuckT > 2) {
      if (b.pos.distanceTo(ai.lastPos) < 1 && !t) this.planPath(b, this.randomSafeNode());
      ai.lastPos.copy(b.pos); ai.stuckT = 0;
    }

    ai.abilityCd -= dt * (this.ev('aufladung') ? 3 : 1);
    if (D.abil && ai.abilityCd <= 0) {
      if (b.hp < 55) { b.healLeft = 50; ai.abilityCd = 18; }
      else if (t && b.pos.distanceTo(t.pos) < 7) { this.explode(new V(b.pos.x, b.pos.y + 1, b.pos.z), 8, 25, b, { noSelf: true, push: 22, color: 0xb06cff }); ai.abilityCd = 14; }
      else if (this.sectors[sectorOf(b.pos.x, b.pos.z)] === 2 && b.onGround) { b.vel.y = 24; ai.abilityCd = 12; }
    }

    const w = b.weapons[0];
    b.fireCd -= dt;
    if (!w) return;
    if (b.reloading > 0) {
      b.reloading -= dt;
      if (b.reloading <= 0) w.ammo = lvlMag(WEAPONS[w.id], w.level);
    } else if (t && b.fireCd <= 0) {
      const W = WEAPONS[w.id];
      const dist = b.pos.distanceTo(t.pos);
      if (dist < W.range * 0.9) {
        if (w.ammo <= 0) b.reloading = W.reload * 1.2;
        else {
          const o = new V(b.pos.x, b.pos.y + 1.3, b.pos.z);
          const aim = new V(t.pos.x, t.pos.y + (Math.random() < D.head ? 1.62 : rand(0.8, 1.5)), t.pos.z);
          aim.addScaledVector(t.vel, dist / 120 * rand(0, 1));
          const err = (0.35 + dist * 0.04) * D.acc * (t.isBot ? 1.4 : 1);
          aim.x += rand(-err, err); aim.y += rand(-err, err) * 0.6; aim.z += rand(-err, err);
          this.fireWeapon(b, o, aim.sub(o).normalize(), w, W.burst || 1);
          b.fireCd = W.rate * D.fire * rand(1, 1.3);
        }
      }
    }
  }

  // ------------------------------------------------ Zerfall
  chooseDecay(count) {
    const safe = this.sectors.map((s, i) => i).filter((i) => this.sectors[i] === 0);
    const att = this.decay.attractor;
    const near = safe.filter((i) => { const c = sectorCenter(i); return Math.hypot(c.x - att.x, c.z - att.z) < 140; });
    const tgt = sectorCenter(pick(near.length ? near : safe));
    att.x += (tgt.x - att.x) * 0.6; att.z += (tgt.z - att.z) * 0.6;
    const chosen = [];
    for (let k = 0; k < count; k++) {
      const cand = this.sectors.map((s, i) => i).filter((i) => this.sectors[i] === 0 && !chosen.includes(i));
      if (cand.length <= 1) break;
      let best = -1, bestScore = -Infinity;
      for (const i of cand) {
        const nb = neighbors(i);
        const edge = nb.length < 4 ? 1 : 0;
        const rotten = nb.filter((n) => this.sectors[n] > 0 || chosen.includes(n)).length;
        if (!edge && !rotten) continue;
        const c = sectorCenter(i);
        const score = Math.hypot(c.x - att.x, c.z - att.z) + rotten * 18 + rand(0, 70);
        if (score > bestScore && this.keepsConnected(i, chosen)) { bestScore = score; best = i; }
      }
      if (best < 0) break;
      chosen.push(best);
    }
    return chosen;
  }
  keepsConnected(removeIdx, chosen) {
    const safe = this.sectors.map((s, i) => i).filter((i) => this.sectors[i] === 0 && i !== removeIdx && !chosen.includes(i));
    if (safe.length <= 1) return true;
    const set = new Set(safe), seen = new Set([safe[0]]), stack = [safe[0]];
    while (stack.length) for (const n of neighbors(stack.pop())) if (set.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
    return seen.size === safe.length;
  }
  updateDecay(dt) {
    if (applyDissolve(this.world, this.decayAt, this.time)) this.allBoxes = this.world.boxes.concat(this.walls);
    const dc = this.decay;
    if (!this.core) {
      if (!dc.warning.length && this.time >= dc.nextAt - WARN) {
        dc.warning = this.chooseDecay(WAVES[Math.min(dc.wave, WAVES.length - 1)]);
        for (const i of dc.warning) this.sectors[i] = 1;
        this.emit({ k: 'snd', s: 'warn' });
        for (const e of this.entities) if (!e.isBot && e.alive && dc.warning.includes(sectorOf(e.pos.x, e.pos.z))) this.msg('msg.sectorWarn', null, e.id);
      }
      if (this.time >= dc.nextAt) {
        for (const i of dc.warning) {
          this.sectors[i] = 2; this.decayAt[i] = this.time;
          for (const it of this.loot) if (sectorOf(it.x, it.z) === i && it.base > 0.7) { it.base = 0.7; this.emit({ k: 'lb', id: it.id, base: 0.7 }); }
        }
        if (dc.warning.length) this.emit({ k: 'decay', s: dc.warning, t: r2(this.time) });
        dc.warning = [];
        dc.wave++;
        const alive = this.entities.filter((e) => e.alive).length;
        dc.nextAt = this.time + 20 + 16 * (alive / this.entities.length);
        if (this.sectors.filter((s) => s === 0).length <= 1) this.spawnCore();
      }
    }
    for (const e of this.entities) {
      if (e.alive && this.sectors[sectorOf(e.pos.x, e.pos.z)] === 2) this.damage(e, (5 + dc.wave * 1.5) * dt, null);
    }
  }

  // ------------------------------------------------ Kern
  spawnCore() {
    const fs = Math.max(0, this.sectors.findIndex((s) => s === 0));
    const c = sectorCenter(fs);
    this.core = { x: c.x, z: c.z, sector: fs, prog: {} };
    this.msg('msg.core');
    this.emit({ k: 'snd', s: 'core' });
  }
  updateCore(dt) {
    if (!this.core || this.over) return;
    const inside = this.entities.filter((e) => e.alive && Math.hypot(e.pos.x - this.core.x, e.pos.z - this.core.z) < 5 && e.pos.y < 4);
    for (const e of inside) e.rev.all = 0.3; // Kernträger für alle sichtbar
    const teams = [...new Set(inside.map((e) => e.team))];
    this.core.contested = teams.length > 1;
    if (teams.length === 1) {
      const t = teams[0];
      this.core.prog[t] = (this.core.prog[t] || 0) + dt;
      if (this.core.prog[t] >= CORE_TIME) this.finish(t);
    }
  }

  // ------------------------------------------------ Stadt-Events
  updateEvents(dt) {
    if (!this.cityEvent && this.time >= this.nextEventAt && !this.core) {
      this.cityEvent = { ...pick(EVENTS), t: 25 };
      this.msg('msg.event', { ev: this.cityEvent.id });
      this.emit({ k: 'snd', s: 'event' });
    }
    if (this.cityEvent) {
      this.cityEvent.t -= dt;
      if (this.cityEvent.t <= 0 || this.core) { this.cityEvent = null; this.nextEventAt = this.time + rand(45, 70); }
    }
    this.gravMul = this.ev('schwerelos') ? 0.45 : 1;
    if (this.ev('radar')) for (const e of this.entities) if (e.alive) e.rev.all = Math.max(e.rev.all || 0, 0.2);
  }

  // ------------------------------------------------ Netz: Startpaket & Snapshots
  startPacket(forId) {
    return {
      t: 'start', seed: this.seed, tod: timeOfDay(this.seed), mode: this.modeId, you: forId, teamCount: this.teamCount,
      ents: this.entities.map((e) => ({ id: e.id, name: e.name, team: e.team, bot: e.isBot, diff: e.diff })),
      loot: this.loot.map(lootArr),
    };
  }
  snapshotFor(id) {
    const me = this.byId.get(id);
    const team = me ? me.team : -1;
    const ents = [];
    for (const e of this.entities) {
      const flags = (e.alive ? 1 : 0) | (e.ghost ? 2 : 0) | (e.cloak > 0 ? 4 : 0) | (e.shieldT > 0 ? 8 : 0)
        | (e.team !== team && this.revealedTo(e, team) ? 16 : 0) | (e.left ? 32 : 0) | (e.grT > 0 ? 64 : 0) | (e.zlId >= 0 ? 128 : 0);
      const w = e.weapons[e.cur];
      ents.push([e.id, r2(e.pos.x), r2(e.pos.y), r2(e.pos.z), r2(e.yaw), Math.ceil(e.hp), Math.ceil(e.armor), flags, w ? w.id : '', e.kills, e.grT > 0 ? [r2(e.grX), r2(e.grY), r2(e.grZ)] : 0]);
    }
    const fx = this.events.filter((ev) => (ev.to === undefined || ev.to === id) && (ev.team === undefined || ev.team === team));
    const snap = {
      t: 's', time: r2(this.time), sectors: this.sectors.join(''), wave: this.decay.wave, nextAt: r2(this.decay.nextAt),
      warn: this.decay.warning.length, ev: this.cityEvent ? { id: this.cityEvent.id, t: Math.ceil(this.cityEvent.t) } : null,
      core: this.core ? { x: this.core.x, z: this.core.z, prog: this.core.prog, c: !!this.core.contested } : null,
      ents, fx,
      walls: this.walls.map((b) => [b.mn[0], b.mx[0], b.mn[1], b.mx[1], b.mn[2], b.mx[2]].map(r2)),
      mines: this.mines.map((m) => [r2(m.pos.x), r2(m.pos.y), r2(m.pos.z), m.owner.team === team ? 1 : 0]),
      proj: this.projectiles.map((p) => [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z)]),
    };
    if (me) {
      snap.me = {
        seq: me.seq, x: me.pos.x, y: me.pos.y, z: me.pos.z, vx: me.vel.x, vy: me.vel.y, vz: me.vel.z,
        m: Object.fromEntries(MOVE_FIELDS.map((f) => [f, typeof me[f] === 'number' ? Math.round(me[f] * 1e4) / 1e4 : me[f]])),
        hp: Math.ceil(me.hp), armor: Math.ceil(me.armor), alive: me.alive, ghost: me.ghost, soloGhost: me.soloGhost,
        ghostT: r2(me.ghostT), reviveHold: r2(me.reviveHold), nearBeacon: !!me.nearBeacon, beacons: me.beacons.map((b) => [b.x, b.z]),
        weapons: me.weapons.map((w) => (w ? [w.id, w.level, w.ammo] : null)), cur: me.cur, reloading: r2(me.reloading),
        abilities: me.abilities.map((a) => (a ? [a.id, a.level, r2(Math.max(0, a.cd))] : null)),
        cloak: me.cloak > 0, shield: me.shieldT > 0, kills: me.kills,
      };
    }
    if (this.over) snap.over = this.over;
    return snap;
  }
  clearEvents() { this.events = []; }
}
export const lootArr = (it) => [it.id, it.type, it.wid, it.level, r2(it.x), r2(it.base), r2(it.z)];

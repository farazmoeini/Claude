// Zerfallzone – originaler vertikaler Arena-Battle-Royale im Browser (Three.js)
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const HALF = 200, SECTOR = 50, NS = 8, GRAV = 24, EYE = 1.6, BODY_H = 1.8;
// Bot-Schwierigkeiten: Streuung (acc), Reaktionszeit, Feuerrate-Faktor, Sichtweite, Fähigkeiten
const DIFFS = {
  leicht: { label: 'Leicht', short: 'L', color: 0x3dff9a, acc: 2.4, react: [1.0, 1.5], fire: 1.9, view: 50, strafe: 0.4, abil: false, jump: 0.005, head: 0.0 },
  mittel: { label: 'Mittel', short: 'M', color: 0xffd34d, acc: 1.4, react: [0.55, 0.9], fire: 1.45, view: 70, strafe: 0.7, abil: false, jump: 0.015, head: 0.1 },
  schwer: { label: 'Schwer', short: 'S', color: 0xff9b2c, acc: 0.85, react: [0.3, 0.5], fire: 1.15, view: 95, strafe: 0.9, abil: true, jump: 0.025, head: 0.25 },
  elite: { label: 'Elite', short: 'E', color: 0xff3355, acc: 0.5, react: [0.15, 0.28], fire: 1.0, view: 120, strafe: 1.0, abil: true, jump: 0.035, head: 0.45 },
};
const DIFF_IDS = Object.keys(DIFFS);
const BOT_LIMIT = 40;
let botConfig = { leicht: 4, mittel: 7, schwer: 3, elite: 1 };
try { const c = JSON.parse(localStorage.getItem('zz-bots')); if (c) for (const k of DIFF_IDS) if (Number.isInteger(c[k])) botConfig[k] = clamp(c[k], 0, BOT_LIMIT); } catch { /* ohne Speicher */ }
const totalBots = () => DIFF_IDS.reduce((s, k) => s + botConfig[k], 0);

// ---------------------------------------------------------------- Daten
const WEAPONS = {
  funke: { name: 'Funke', desc: 'MP', color: 0x2cf3ff, dmg: 9, rate: 0.075, mag: 32, reload: 1.4, spread: 0.03, range: 70, pellets: 1, auto: true },
  puls: { name: 'Puls', desc: 'Salvengewehr', color: 0x7dff6b, dmg: 15, rate: 0.42, mag: 24, reload: 1.8, spread: 0.012, range: 120, pellets: 1, burst: 3, auto: true },
  hagel: { name: 'Hagel', desc: 'Schrotflinte', color: 0xff9b2c, dmg: 11, rate: 0.85, mag: 6, reload: 2.0, spread: 0.085, range: 28, pellets: 9, auto: false },
  lanze: { name: 'Lanze', desc: 'Railgun', color: 0xff4dd2, dmg: 60, rate: 1.0, mag: 5, reload: 2.2, spread: 0, range: 250, pellets: 1, auto: false, zoom: true },
  dorn: { name: 'Dorn', desc: 'Präzisionspistole', color: 0xd9e4ff, dmg: 26, rate: 0.28, mag: 10, reload: 1.3, spread: 0.004, range: 150, pellets: 1, auto: false, len: 0.35 },
  moerser: { name: 'Mörser', desc: 'Granatwerfer', color: 0xff5c2c, dmg: 70, rate: 0.85, mag: 4, reload: 2.4, spread: 0, range: 100, pellets: 1, auto: false, projectile: true },
};
const WEAPON_IDS = Object.keys(WEAPONS);
const BOT_WEAPON_IDS = WEAPON_IDS.filter((id) => !WEAPONS[id].projectile);
const LEVEL_NAMES = ['', 'I', 'II', 'III', 'IV'];
const lvlDmg = (lvl) => 1 + (lvl - 1) * 0.15;
const lvlMag = (w, lvl) => Math.round(w.mag * (1 + (lvl - 1) * 0.2));

const ABILITIES = {
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
};
const ABILITY_IDS = Object.keys(ABILITIES);
const abilityCd = (a) => ABILITIES[a.id].cd * (1 - (a.level - 1) * 0.15);

// Stadt-Events: alle 45–70 s für 25 s
const EVENTS = [
  { id: 'schwerelos', name: 'Niedrige Schwerkraft', desc: 'Alle springen höher' },
  { id: 'munition', name: 'Endlose Munition', desc: 'Magazine leeren sich nicht' },
  { id: 'aufladung', name: 'Schnelle Fähigkeiten', desc: 'Abklingzeiten ×3 schneller' },
  { id: 'radar', name: 'Radar', desc: 'Alle Gegner sichtbar' },
  { id: 'turbo', name: 'Turbo', desc: '+35 % Tempo für alle' },
];
let cityEvent = null, nextEventAt = 75, gravMul = 1;
const ev = (id) => cityEvent && cityEvent.id === id;

const BOT_NAMES = ['Vex', 'Nyra', 'Kobalt', 'Ion', 'Rhea', 'Spektr', 'Lumen', 'Orca', 'Taiga', 'Flux', 'Zinn', 'Mira', 'Quarz', 'Sable', 'Juno', 'Pixel', 'Nova', 'Haze'];

// ---------------------------------------------------------------- Renderer & Szene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.domElement.id = 'game';
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d22);
scene.fog = new THREE.Fog(0x0a0d22, 60, 330);
const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.05, 900);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0x8fb8ff, 0x1a0c2a, 0.9));
const sun = new THREE.DirectionalLight(0xffe2c4, 1.1);
sun.position.set(120, 200, 60);
scene.add(sun);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Fenster-Textur für Gebäude
function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#141a33'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const on = Math.random() < 0.35;
    g.fillStyle = on ? pick(['#2cf3ff', '#ff4dd2', '#ffd34d', '#9fb4ff']) : '#1d2547';
    g.globalAlpha = on ? rand(0.4, 0.9) : 1;
    g.fillRect(x * 16 + 3, y * 16 + 4, 10, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const windowTex = makeWindowTexture();

// ---------------------------------------------------------------- Welt
/** Kollisionsboxen: { mn:[x,y,z], mx:[x,y,z], sector, temp, mesh } */
let boxes = [];
let buildingsBySector = [];
let jumpPads = [];
let worldGroup = null;

const sectorOf = (x, z) => {
  const sx = clamp(Math.floor((x + HALF) / SECTOR), 0, NS - 1);
  const sz = clamp(Math.floor((z + HALF) / SECTOR), 0, NS - 1);
  return sz * NS + sx;
};
const sectorCenter = (i) => ({ x: -HALF + (i % NS) * SECTOR + SECTOR / 2, z: -HALF + Math.floor(i / NS) * SECTOR + SECTOR / 2 });

function addBox(group, x0, x1, y0, y1, z0, z1, opts = {}) {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  const geo = new THREE.BoxGeometry(w, h, d);
  let mat;
  if (opts.material) mat = opts.material;
  else {
    const tex = windowTex.clone();
    tex.repeat.set(Math.max(1, w / 8), Math.max(1, h / 8));
    tex.needsUpdate = true;
    mat = new THREE.MeshStandardMaterial({ color: 0x8090c0, map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.8 });
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  group.add(mesh);
  let edges = null;
  if (opts.edgeColor !== null) {
    edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: opts.edgeColor ?? 0x2cf3ff }));
    mesh.add(edges);
  }
  const b = { mn: [x0, y0, z0], mx: [x1, y1, z1], mesh, edges, sector: sectorOf(mesh.position.x, mesh.position.z), temp: false };
  boxes.push(b);
  return b;
}

function buildWorld() {
  if (worldGroup) scene.remove(worldGroup);
  worldGroup = new THREE.Group();
  scene.add(worldGroup);
  boxes = [];
  jumpPads = [];
  buildingsBySector = Array.from({ length: NS * NS }, () => []);

  // Boden + Straßenraster
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ color: 0x0c1024, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  worldGroup.add(ground);
  const grid = new THREE.GridHelper(400, 16, 0x2cf3ff, 0x1b2a55);
  grid.position.y = 0.02;
  grid.material.transparent = true; grid.material.opacity = 0.5;
  worldGroup.add(grid);

  const edgeColors = [0x2cf3ff, 0xff4dd2, 0xb06cff, 0xffd34d];
  for (let sz = 0; sz < NS; sz++) for (let sx = 0; sx < NS; sx++) {
    const x0 = -HALF + sx * SECTOR, z0 = -HALF + sz * SECTOR;
    const centrality = 1 - Math.hypot(sx - 3.5, sz - 3.5) / 5;
    for (let lx = 0; lx < 2; lx++) for (let lz = 0; lz < 2; lz++) {
      const lotX = x0 + (lx ? 27 : 4), lotZ = z0 + (lz ? 27 : 4), LOT = 19;
      const r = Math.random();
      if (r < 0.12) continue; // Platz
      const n = r < 0.75 ? 1 : 2;
      for (let k = 0; k < n; k++) {
        const w = n === 1 ? rand(9, LOT) : rand(6, 9), d = n === 1 ? rand(9, LOT) : rand(6, LOT);
        const bx = n === 1 ? lotX + rand(0, LOT - w) : lotX + (k ? LOT - w : 0);
        const bz = lotZ + rand(0, LOT - d);
        const h = 4 + Math.pow(Math.random(), 1.6) * (22 + 26 * Math.max(0, centrality));
        const b = addBox(worldGroup, bx, bx + w, 0, h, bz, bz + d, { edgeColor: pick(edgeColors) });
        buildingsBySector[b.sector].push(b);
        // Dachaufbau als Deckung / Stufe
        if (w > 10 && d > 10 && Math.random() < 0.5) {
          const cx = bx + rand(2, w - 6), cz = bz + rand(2, d - 6);
          const sub = addBox(worldGroup, cx, cx + 4, h, h + rand(1.2, 3.5), cz, cz + 4, { edgeColor: 0x2cf3ff });
          buildingsBySector[b.sector].push(sub);
        }
      }
    }
    // Sprungfelder an Straßenrändern (nicht auf den Mittellinien der Bots)
    for (let i = 0; i < 2; i++) {
      const alongX = Math.random() < 0.5;
      const line = (alongX ? z0 : x0) + (Math.random() < 0.5 ? 0 : 25);
      const off = Math.random() < 0.5 ? 2.6 : -2.6;
      const t = (alongX ? x0 : z0) + rand(6, 44);
      const px = alongX ? t : line + off, pz = alongX ? line + off : t;
      if (Math.abs(px) > HALF - 3 || Math.abs(pz) > HALF - 3) continue;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.15, 24), new THREE.MeshBasicMaterial({ color: 0x2c8bff }));
      pad.position.set(px, 0.08, pz);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 8, 32), new THREE.MeshBasicMaterial({ color: 0x8ff8ff }));
      ring.rotation.x = Math.PI / 2;
      pad.add(ring);
      worldGroup.add(pad);
      jumpPads.push({ x: px, z: pz, ring });
    }
  }
  // Deckungskisten an den breiten Straßen
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x2a2f4a, roughness: 0.6 });
  for (let i = 0; i < 160; i++) {
    const alongX = Math.random() < 0.5;
    const line = -HALF + randi(1, NS - 1) * SECTOR;
    const off = (Math.random() < 0.5 ? 1 : -1) * 3.0;
    const t = rand(-HALF + 5, HALF - 5);
    const cx = alongX ? t : line + off, cz = alongX ? line + off : t;
    const s = 1.4;
    addBox(worldGroup, cx - s / 2, cx + s / 2, 0, rand(1.0, 1.6), cz - s / 2, cz + s / 2, { material: crateMat, edgeColor: 0xff4dd2 });
  }

  // Sektorsäulen für den Zerfall
  for (let i = 0; i < NS * NS; i++) {
    const c = sectorCenter(i);
    const col = new THREE.Mesh(new THREE.BoxGeometry(SECTOR, 160, SECTOR),
      new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    col.position.set(c.x, 80, c.z);
    col.visible = false;
    worldGroup.add(col);
    sectors[i].column = col;
  }
}

// ---------------------------------------------------------------- Physik
function moveEntity(e, dt) {
  const r = e.radius;
  e.onGround = false;
  e.wallBox = null;
  // X
  e.pos.x += e.vel.x * dt;
  for (const b of boxes) {
    if (e.pos.y >= b.mx[1] - 0.001 || e.pos.y + BODY_H <= b.mn[1]) continue;
    if (e.pos.z + r <= b.mn[2] || e.pos.z - r >= b.mx[2]) continue;
    if (e.pos.x + r > b.mn[0] && e.pos.x - r < b.mx[0]) {
      const pl = e.pos.x + r - b.mn[0], pr = b.mx[0] - (e.pos.x - r);
      e.pos.x += pl < pr ? -pl : pr;
      e.vel.x = 0; e.wallBox = b;
    }
  }
  // Z
  e.pos.z += e.vel.z * dt;
  for (const b of boxes) {
    if (e.pos.y >= b.mx[1] - 0.001 || e.pos.y + BODY_H <= b.mn[1]) continue;
    if (e.pos.x + r <= b.mn[0] || e.pos.x - r >= b.mx[0]) continue;
    if (e.pos.z + r > b.mn[2] && e.pos.z - r < b.mx[2]) {
      const pl = e.pos.z + r - b.mn[2], pr = b.mx[2] - (e.pos.z - r);
      e.pos.z += pl < pr ? -pl : pr;
      e.vel.z = 0; e.wallBox = b;
    }
  }
  // Y
  const prevY = e.pos.y;
  e.pos.y += e.vel.y * dt;
  for (const b of boxes) {
    if (e.pos.x + r <= b.mn[0] || e.pos.x - r >= b.mx[0] || e.pos.z + r <= b.mn[2] || e.pos.z - r >= b.mx[2]) continue;
    if (e.vel.y <= 0 && prevY >= b.mx[1] - 0.05 && e.pos.y < b.mx[1]) {
      e.pos.y = b.mx[1]; e.vel.y = 0; e.onGround = true;
    } else if (e.vel.y > 0 && prevY + BODY_H <= b.mn[1] + 0.05 && e.pos.y + BODY_H > b.mn[1]) {
      e.pos.y = b.mn[1] - BODY_H; e.vel.y = 0;
    }
  }
  if (e.pos.y <= 0) { e.pos.y = 0; e.vel.y = 0; e.onGround = true; }
  e.pos.x = clamp(e.pos.x, -HALF + 0.5, HALF - 0.5);
  e.pos.z = clamp(e.pos.z, -HALF + 0.5, HALF - 0.5);
}

// Strahl gegen AABB (Slab-Methode), gibt Distanz oder Infinity zurück
function rayBox(o, d, b, maxT) {
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
function rayWorld(o, d, maxT) {
  let best = maxT;
  for (const b of boxes) {
    const t = rayBox(o, d, b, best);
    if (t < best) best = t;
  }
  if (d[1] < 0) { const t = -o[1] / d[1]; if (t < best) best = t; }
  return best;
}
function hasLOS(a, b) {
  const o = [a.x, a.y, a.z];
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const dist = Math.hypot(dx, dy, dz);
  const d = [dx / dist, dy / dist, dz / dist];
  return rayWorld(o, d, dist) >= dist - 0.05;
}
/** Schuss: findet nächstes Ziel (Welt oder Entität) */
function traceShot(o, d, range, shooter) {
  let t = rayWorld(o, d, range), hit = null, head = false;
  for (const e of entities) {
    if (!e.alive || e === shooter) continue;
    const th = raySphere(o, d, [e.pos.x, e.pos.y + 1.62, e.pos.z], 0.3);
    if (th < t) { t = th; hit = e; head = true; }
    const tb = raySphere(o, d, [e.pos.x, e.pos.y + 0.95, e.pos.z], 0.52);
    if (tb < t) { t = tb; hit = e; head = false; }
  }
  return { t, hit, head };
}

// ---------------------------------------------------------------- Effekte
const tracers = [];
function addTracer(from, to, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  scene.add(line);
  tracers.push({ line, life: 0.09 });
}
const sparks = [];
const sparkGeo = new THREE.SphereGeometry(0.12, 6, 6);
function addSpark(p, color) {
  const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
  m.position.copy(p);
  scene.add(m);
  sparks.push({ m, life: 0.25 });
}
function updateFx(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.09);
    if (t.life <= 0) { scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); tracers.splice(i, 1); }
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life -= dt;
    s.m.scale.setScalar(1 + (0.25 - s.life) * 8);
    s.m.material.opacity = s.life / 0.25;
    if (s.life <= 0) { scene.remove(s.m); s.m.material.dispose(); sparks.splice(i, 1); }
  }
}

// ---------------------------------------------------------------- Audio
let actx = null;
let noiseBuf = null;
function initAudio() {
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.4, actx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
function sfxShot(kind, vol = 1) {
  if (!actx || vol < 0.02) return;
  const src = actx.createBufferSource();
  src.buffer = noiseBuf;
  const f = actx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = { funke: 2200, puls: 1500, hagel: 700, lanze: 3500, dorn: 2800, moerser: 400 }[kind] || 1500;
  const g = actx.createGain();
  const dur = kind === 'hagel' ? 0.25 : kind === 'lanze' ? 0.35 : 0.1;
  g.gain.setValueAtTime(0.35 * vol, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
  src.connect(f).connect(g).connect(actx.destination);
  src.start(); src.stop(actx.currentTime + dur);
  if (kind === 'lanze') sfxTone(1400, 200, 0.3, 0.15 * vol, 'sawtooth');
}
function sfxTone(f0, f1, dur, vol = 0.15, type = 'sine') {
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, actx.currentTime);
  o.frequency.exponentialRampToValueAtTime(f1, actx.currentTime + dur);
  g.gain.setValueAtTime(vol, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
  o.connect(g).connect(actx.destination);
  o.start(); o.stop(actx.currentTime + dur);
}

// ---------------------------------------------------------------- Spielzustand
let entities = [];
let bots = [];
let player = null;
let loot = [];
let sectors = [];
let state = 'menu';
let gameTime = 0;
let decay = null;
let core = null;
let feedItems = [];

function makeEntity(name, isPlayer) {
  return {
    name, isPlayer, alive: true, hp: 100, armor: 0, radius: 0.45,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), onGround: false, wallBox: null,
    kills: 0, weapons: [null, null], cur: 0, abilities: [null, null],
    fireCd: 0, burstLeft: 0, burstCd: 0, reloading: 0, healLeft: 0, revealed: 0,
  };
}
function newWeapon(id, level = 1) { return { id, level, ammo: lvlMag(WEAPONS[id], level) }; }

// ---------------------------------------------------------------- Bots
const botBodyGeo = new THREE.CylinderGeometry(0.38, 0.45, 1.25, 12);
const botHeadGeo = new THREE.SphereGeometry(0.3, 12, 10);
const botVisorGeo = new THREE.BoxGeometry(0.42, 0.12, 0.2);
const ghostGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.9, 10);

function createBot(i, diffId) {
  const D = DIFFS[diffId];
  const base = BOT_NAMES[i % BOT_NAMES.length] + (i >= BOT_NAMES.length ? ' ' + (Math.floor(i / BOT_NAMES.length) + 1) : '');
  const e = makeEntity(`${base} [${D.short}]`, false);
  e.diff = D;
  const color = new THREE.Color(D.color);
  const g = new THREE.Group();
  const body = new THREE.Mesh(botBodyGeo, new THREE.MeshStandardMaterial({ color: 0x1c2240, emissive: color, emissiveIntensity: 0.35 }));
  body.position.y = 0.95;
  const head = new THREE.Mesh(botHeadGeo, new THREE.MeshStandardMaterial({ color: 0x2a3155 }));
  head.position.y = 1.62;
  const visor = new THREE.Mesh(botVisorGeo, new THREE.MeshBasicMaterial({ color }));
  visor.position.set(0, 1.64, -0.22);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.6), new THREE.MeshBasicMaterial({ color: 0x8ff8ff }));
  gun.position.set(0.35, 1.15, -0.35);
  const ghost = new THREE.Mesh(ghostGeo, new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.55, depthTest: false }));
  ghost.position.y = 0.95; ghost.visible = false; ghost.renderOrder = 10;
  g.add(body, head, visor, gun, ghost);
  scene.add(g);
  e.mesh = g; e.ghost = ghost; e.gunMesh = gun;
  e.ai = { path: [], goal: null, scanCd: rand(0, 0.3), target: null, strafe: 1, strafeCd: 0, stuckT: 0, lastPos: new THREE.Vector3(), jumpCd: 0, abilityCd: rand(5, 15) };
  const lvlBonus = diffId === 'elite' ? 1 : diffId === 'schwer' && Math.random() < 0.5 ? 1 : 0;
  e.weapons[0] = newWeapon(pick(BOT_WEAPON_IDS), Math.min(4, randi(1, 2) + lvlBonus));
  e.armor = clamp(randi(0, 2) * 25 + (diffId === 'elite' ? 50 : diffId === 'schwer' ? 25 : 0), 0, 100);
  return e;
}

const NODE = 25;
const snapNode = (v) => clamp(Math.round(v / NODE) * NODE, -HALF + NODE, HALF - NODE);
function randomSafeNode() {
  const safe = sectors.map((s, i) => (s.state === 0 ? i : -1)).filter((i) => i >= 0);
  const si = safe.length ? pick(safe) : Math.max(0, decay.finalSector);
  const c = sectorCenter(si);
  return { x: c.x + pick([-25, 0, 0]), z: c.z + pick([-25, 0, 0]) };
}
function planPath(bot, goal) {
  const nx = snapNode(bot.pos.x), nz = snapNode(bot.pos.z);
  bot.ai.goal = goal;
  bot.ai.path = [{ x: nx, z: nz }, { x: goal.x, z: nz }, goal];
}

function updateBot(b, dt) {
  const ai = b.ai;
  // Ziel suchen
  ai.scanCd -= dt;
  if (ai.scanCd <= 0) {
    ai.scanCd = 0.3;
    const D = b.diff;
    let best = null, bestD = D.view;
    const eye = { x: b.pos.x, y: b.pos.y + EYE, z: b.pos.z };
    for (const e of entities) {
      if (e === b || !e.alive) continue;
      let d = b.pos.distanceTo(e.pos);
      if (e.cloak > 0 && d > 6) continue; // getarnt
      if (core && Math.hypot(e.pos.x - core.pos.x, e.pos.z - core.pos.z) < 5) d *= 0.5; // Kernträger zuerst
      if (d < bestD && hasLOS(eye, { x: e.pos.x, y: e.pos.y + 1.2, z: e.pos.z })) { best = e; bestD = d; }
    }
    if (best && best !== ai.target) b.fireCd = Math.max(b.fireCd, rand(...b.diff.react)); // Reaktionszeit
    ai.target = best;
  }
  // Pfad neu planen, wenn Ziel zerfällt
  if (!ai.goal || sectors[sectorOf(ai.goal.x, ai.goal.z)].state !== 0 || (core && core.active && Math.random() < 0.01)) {
    const goal = core && core.active ? { x: core.pos.x, z: core.pos.z } : randomSafeNode();
    planPath(b, goal);
  }
  // In Gefahr? Sofort raus.
  if (sectors[sectorOf(b.pos.x, b.pos.z)].state === 2 && ai.goal && sectors[sectorOf(ai.goal.x, ai.goal.z)].state !== 0) planPath(b, randomSafeNode());

  const speed = 7.5 * (ev('turbo') ? 1.35 : 1);
  let mx = 0, mz = 0;
  const t = ai.target;
  if (ai.path.length) {
    const wp = ai.path[0];
    const dx = wp.x - b.pos.x, dz = wp.z - b.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.2) {
      ai.path.shift();
      if (!ai.path.length) {
        if (core && core.active) ai.path = [{ x: core.pos.x + rand(-2, 2), z: core.pos.z + rand(-2, 2) }];
        else planPath(b, randomSafeNode());
      }
    } else { mx = dx / d; mz = dz / d; }
  }
  if (t) {
    const dx = t.pos.x - b.pos.x, dz = t.pos.z - b.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    ai.strafeCd -= dt;
    if (ai.strafeCd <= 0) { ai.strafe = (Math.random() < 0.5 ? -1 : 1) * b.diff.strafe; ai.strafeCd = rand(0.4, 1.4) / b.diff.strafe; }
    const sx = -dz / d * ai.strafe, sz = dx / d * ai.strafe;
    // im Kampf: halb Pfad, halb seitwärts
    mx = mx * 0.35 + sx * 0.8; mz = mz * 0.35 + sz * 0.8;
    b.mesh.rotation.y = Math.atan2(-dx, -dz);
  } else if (mx || mz) b.mesh.rotation.y = Math.atan2(-mx, -mz);

  const accel = b.onGround ? 12 : 3;
  b.vel.x += (mx * speed - b.vel.x) * Math.min(1, accel * dt);
  b.vel.z += (mz * speed - b.vel.z) * Math.min(1, accel * dt);
  b.vel.y -= GRAV * gravMul * dt;
  ai.jumpCd -= dt;
  if (b.onGround && ai.jumpCd <= 0 && (t ? Math.random() < b.diff.jump : b.wallBox)) { b.vel.y = 9; ai.jumpCd = 1.2; }
  moveEntity(b, dt);
  checkJumpPad(b);

  // Feststecken
  ai.stuckT += dt;
  if (ai.stuckT > 2) {
    if (b.pos.distanceTo(ai.lastPos) < 1 && !t) planPath(b, randomSafeNode());
    ai.lastPos.copy(b.pos); ai.stuckT = 0;
  }

  // Fähigkeit: Heilung, wenn verletzt
  ai.abilityCd -= dt * (ev('aufladung') ? 3 : 1);
  if (b.diff.abil && ai.abilityCd <= 0) {
    if (b.hp < 55) { b.healLeft = 50; ai.abilityCd = 18; }
    else if (t && b.pos.distanceTo(t.pos) < 7) { explode(new THREE.Vector3(b.pos.x, b.pos.y + 1, b.pos.z), 8, 25, b, { noSelf: true, push: 22, color: 0xb06cff }); ai.abilityCd = 14; }
    else if (sectors[sectorOf(b.pos.x, b.pos.z)].state === 2 && b.onGround) { b.vel.y = 24; ai.abilityCd = 12; } // Katapult raus
  }

  // Schießen
  const w = b.weapons[0];
  b.fireCd -= dt;
  if (b.reloading > 0) {
    b.reloading -= dt;
    if (b.reloading <= 0) w.ammo = lvlMag(WEAPONS[w.id], w.level);
  } else if (t && b.fireCd <= 0) {
    const W = WEAPONS[w.id];
    const dist = b.pos.distanceTo(t.pos);
    if (dist < W.range * 0.9) {
      if (w.ammo <= 0) { b.reloading = W.reload * 1.2; }
      else {
        const o = new THREE.Vector3(b.pos.x, b.pos.y + 1.3, b.pos.z);
        const aim = new THREE.Vector3(t.pos.x, t.pos.y + (Math.random() < b.diff.head ? 1.62 : rand(0.8, 1.5)), t.pos.z);
        // Vorhalt + Fehler abhängig von Distanz, Bewegung und Skill
        aim.addScaledVector(t.vel, dist / 120 * rand(0, 1));
        const err = (0.35 + dist * 0.04) * b.diff.acc * (t.isPlayer ? 1 : 1.4);
        aim.x += rand(-err, err); aim.y += rand(-err, err) * 0.6; aim.z += rand(-err, err);
        const shots = W.burst || 1;
        fireWeapon(b, o, aim.sub(o).normalize(), w, shots);
        b.fireCd = W.rate * b.diff.fire * rand(1, 1.3);
      }
    }
  }
  b.mesh.position.copy(b.pos);
  b.ghost.visible = b.revealed > 0;
  if (b.revealed > 0) b.revealed -= dt;
}

function checkJumpPad(e) {
  if (!e.onGround || e.pos.y > 0.2) return;
  for (const p of jumpPads) {
    if (Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < 1.2) {
      e.vel.y = 30; e.onGround = false;
      if (e.isPlayer) { sfxTone(300, 1200, 0.4, 0.2, 'triangle'); player.jumps = 1; }
      return;
    }
  }
}

// ---------------------------------------------------------------- Waffen
function fireWeapon(shooter, origin, dir, w, shots = 1) {
  const W = WEAPONS[w.id];
  if (W.projectile) {
    if (w.ammo <= 0) return;
    if (!ev('munition')) w.ammo--;
    launchProjectile(shooter, origin.clone().addScaledVector(dir, 0.8), dir, w);
    sfxShot(w.id, 1);
    return;
  }
  for (let s = 0; s < shots; s++) {
    if (w.ammo <= 0) break;
    if (!ev('munition')) w.ammo--;
    for (let p = 0; p < W.pellets; p++) {
      const sp = W.spread * (shooter.isPlayer && player.zoomed ? 0.3 : 1) + (s > 0 ? 0.008 : 0);
      const d = dir.clone();
      if (sp > 0) { d.x += rand(-sp, sp); d.y += rand(-sp, sp); d.z += rand(-sp, sp); d.normalize(); }
      const res = traceShot([origin.x, origin.y, origin.z], [d.x, d.y, d.z], W.range, shooter);
      const end = origin.clone().addScaledVector(d, Math.min(res.t, W.range));
      const from = shooter.isPlayer ? camera.localToWorld(new THREE.Vector3(0.28, -0.25, -0.8)) : origin;
      addTracer(from, end, W.color);
      if (res.t < W.range) addSpark(end, res.hit ? 0xff3355 : W.color);
      if (res.hit) {
        let dmg = W.dmg * lvlDmg(w.level) * (res.head ? 1.6 : 1);
        if (W.pellets > 1) dmg *= clamp(1.2 - res.t / W.range, 0.35, 1);
        damage(res.hit, dmg, shooter);
        if (shooter.isPlayer) hitmarker(res.head);
      }
    }
  }
  const vol = shooter.isPlayer ? 1 : clamp(1 - shooter.pos.distanceTo(player.pos) / 120, 0, 0.6);
  sfxShot(w.id, vol);
}

function damage(target, amount, source) {
  if (!target.alive) return;
  if (target.shieldT > 0) amount *= 0.25;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, amount * 0.7);
    target.armor -= absorbed;
    amount -= absorbed;
  }
  target.hp -= amount;
  if (target.isPlayer) { flashVignette(Math.min(1, amount / 30)); }
  if (target.hp <= 0) kill(target, source);
}

function kill(target, source) {
  target.alive = false;
  target.hp = 0;
  if (source && source !== target && source.alive) source.kills++;
  const by = source && source !== target ? source.name : 'Zerfall';
  pushFeed(`${by} ✕ ${target.name}`, target.isPlayer || (source && source.isPlayer));
  if (target.mesh) { scene.remove(target.mesh); }
  // Beute fallen lassen
  for (const w of target.weapons) if (w) spawnLoot('weapon', w.id, w.level, target.pos.x + rand(-1, 1), target.pos.y, target.pos.z + rand(-1, 1));
  spawnLoot('health', null, 1, target.pos.x, target.pos.y, target.pos.z);
  if (target.isPlayer) {
    if (!player.usedRevive && !core && state === 'play') enterGhost();
    else endGame(false);
  } else checkWin();
}

// ---------------------------------------------------------------- Beute
const lootGeos = {
  weapon: new THREE.BoxGeometry(0.9, 0.3, 0.3),
  ability: new THREE.OctahedronGeometry(0.4),
  health: new THREE.BoxGeometry(0.5, 0.5, 0.5),
  armor: new THREE.IcosahedronGeometry(0.35),
};
function spawnLoot(type, id, level, x, y, z) {
  let color = 0xffffff;
  if (type === 'weapon') color = WEAPONS[id].color;
  if (type === 'ability') color = 0xb06cff;
  if (type === 'health') color = 0x3dff9a;
  if (type === 'armor') color = 0x2c8bff;
  const m = new THREE.Mesh(lootGeos[type], new THREE.MeshBasicMaterial({ color }));
  const base = y + 0.7;
  m.position.set(x, base, z);
  if (type === 'weapon' && level > 1) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
    ring.rotation.x = Math.PI / 2; m.add(ring);
  }
  scene.add(m);
  const it = { type, id, level, mesh: m, base, phase: Math.random() * 6 };
  loot.push(it);
  return it;
}
function removeLoot(it) {
  scene.remove(it.mesh);
  loot.splice(loot.indexOf(it), 1);
}
function spawnAllLoot() {
  const roofs = boxes.filter((b) => (b.mx[0] - b.mn[0]) > 5 && b.mx[1] > 3);
  const randomRoofSpot = () => {
    const b = pick(roofs);
    return [rand(b.mn[0] + 1, b.mx[0] - 1), b.mx[1], rand(b.mn[2] + 1, b.mx[2] - 1)];
  };
  const randomStreetSpot = () => {
    const line = -HALF + randi(1, 15) * 25;
    const t = rand(-HALF + 5, HALF - 5);
    return Math.random() < 0.5 ? [t, 0, line + rand(-1, 1)] : [line + rand(-1, 1), 0, t];
  };
  const spot = () => {
    // nicht auf einem Dachaufbau einklemmen: einfach prüfen, ob die Stelle frei ist
    for (let k = 0; k < 10; k++) {
      const s = Math.random() < 0.65 ? randomRoofSpot() : randomStreetSpot();
      const blocked = boxes.some((b) => s[0] > b.mn[0] && s[0] < b.mx[0] && s[2] > b.mn[2] && s[2] < b.mx[2] && s[1] + 0.5 > b.mn[1] && s[1] < b.mx[1] - 0.01);
      if (!blocked) return s;
    }
    return randomStreetSpot();
  };
  for (let i = 0; i < 110; i++) { const s = spot(); spawnLoot('weapon', pick(WEAPON_IDS), Math.random() < 0.15 ? 2 : 1, ...s); }
  for (let i = 0; i < 70; i++) { const s = spot(); spawnLoot('ability', pick(ABILITY_IDS), 1, ...s); }
  for (let i = 0; i < 50; i++) { const s = spot(); spawnLoot('health', null, 1, ...s); }
  for (let i = 0; i < 50; i++) { const s = spot(); spawnLoot('armor', null, 1, ...s); }
}
function nearestLoot(maxD) {
  let best = null, bd = maxD;
  for (const it of loot) {
    if (it.type === 'health' || it.type === 'armor') continue;
    const d = Math.hypot(it.mesh.position.x - player.pos.x, it.base - 0.7 - player.pos.y, it.mesh.position.z - player.pos.z);
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}
function lootLabel(it) {
  if (it.type === 'weapon') {
    const W = WEAPONS[it.id];
    const fuse = player.weapons.some((w) => w && w.id === it.id && w.level < 4);
    return `<b>F</b> ${W.name} ${LEVEL_NAMES[it.level]} (${W.desc})${fuse ? ' · <b>verschmelzen</b>' : ''}`;
  }
  const A = ABILITIES[it.id];
  const fuse = player.abilities.some((a) => a && a.id === it.id && a.level < 4);
  return `<b>F</b> Fähigkeit ${A.name}: ${A.desc}${fuse ? ' · <b>verschmelzen</b>' : ''}`;
}
function pickUp(it) {
  const p = player;
  if (it.type === 'weapon') {
    const same = p.weapons.findIndex((w) => w && w.id === it.id && w.level < 4);
    if (same >= 0) {
      const w = p.weapons[same];
      w.level = Math.min(4, w.level + it.level);
      w.ammo = lvlMag(WEAPONS[w.id], w.level);
      p.cur = same;
      sfxTone(500, 1500, 0.3, 0.2, 'triangle');
      pushFeed(`${WEAPONS[w.id].name} verschmolzen → Stufe ${LEVEL_NAMES[w.level]}`, true);
    } else {
      let slot = p.weapons.findIndex((w) => !w);
      if (slot < 0) {
        slot = p.cur;
        const old = p.weapons[slot];
        spawnLoot('weapon', old.id, old.level, p.pos.x, p.pos.y, p.pos.z);
      }
      p.weapons[slot] = newWeapon(it.id, it.level);
      p.cur = slot;
      p.reloading = 0;
      sfxTone(600, 900, 0.12, 0.15);
    }
    updateViewModel();
  } else if (it.type === 'ability') {
    const same = p.abilities.findIndex((a) => a && a.id === it.id && a.level < 4);
    if (same >= 0) { p.abilities[same].level++; sfxTone(500, 1500, 0.3, 0.2, 'triangle'); }
    else {
      let slot = p.abilities.findIndex((a) => !a);
      if (slot < 0) { slot = 0; spawnLoot('ability', p.abilities[0].id, 1, p.pos.x, p.pos.y, p.pos.z); }
      p.abilities[slot] = { id: it.id, level: 1, cd: 0 };
      sfxTone(600, 900, 0.12, 0.15);
    }
  }
  removeLoot(it);
}
function autoPickup() {
  for (let i = loot.length - 1; i >= 0; i--) {
    const it = loot[i];
    if (it.type !== 'health' && it.type !== 'armor') continue;
    const d = Math.hypot(it.mesh.position.x - player.pos.x, it.base - 0.7 - player.pos.y, it.mesh.position.z - player.pos.z);
    if (d > 1.8) continue;
    if (it.type === 'health' && player.hp < 100) { player.hp = Math.min(100, player.hp + 35); removeLoot(it); sfxTone(400, 800, 0.2); }
    else if (it.type === 'armor' && player.armor < 100) { player.armor = Math.min(100, player.armor + 25); removeLoot(it); sfxTone(300, 700, 0.2); }
  }
  // Bots sammeln Heilung und Rüstung ebenfalls
  for (const b of bots) {
    if (!b.alive) continue;
    for (let i = loot.length - 1; i >= 0; i--) {
      const it = loot[i];
      if (Math.abs(it.mesh.position.x - b.pos.x) > 1.5 || Math.abs(it.mesh.position.z - b.pos.z) > 1.5 || Math.abs(it.base - 0.7 - b.pos.y) > 1.5) continue;
      if (it.type === 'health' && b.hp < 100) { b.hp = Math.min(100, b.hp + 35); removeLoot(it); }
      else if (it.type === 'armor' && b.armor < 100) { b.armor = Math.min(100, b.armor + 25); removeLoot(it); }
      else if (it.type === 'weapon') {
        const w = b.weapons[0];
        if (w.id === it.id && w.level < 4) { w.level = Math.min(4, w.level + it.level); removeLoot(it); }
      }
    }
  }
}

// ---------------------------------------------------------------- Fähigkeiten
const tempWalls = [];
function useAbility(slot) {
  const a = player.abilities[slot];
  if (!a || a.cd > 0 || !player.alive || player.ghost) return;
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  switch (a.id) {
    case 'sprung': {
      const flat = new THREE.Vector3(fwd.x, Math.max(fwd.y, -0.2), fwd.z).normalize();
      const o = [player.pos.x, player.pos.y + 1.0, player.pos.z];
      const t = rayWorld(o, [flat.x, flat.y, flat.z], 14);
      const dist = Math.max(0, t - 0.8);
      player.pos.addScaledVector(flat, dist);
      player.pos.y = Math.max(0, player.pos.y);
      player.vel.y = Math.max(player.vel.y, 2);
      sfxTone(1800, 300, 0.25, 0.2, 'square');
      break;
    }
    case 'bollwerk': {
      const flat = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
      const c = player.pos.clone().addScaledVector(flat, 3.2);
      const alongX = Math.abs(flat.z) > Math.abs(flat.x); // Wand quer zur Blickrichtung
      const hw = 2.4, ht = 0.3;
      const x0 = alongX ? c.x - hw : c.x - ht, x1 = alongX ? c.x + hw : c.x + ht;
      const z0 = alongX ? c.z - ht : c.z - hw, z1 = alongX ? c.z + ht : c.z + hw;
      const mat = new THREE.MeshBasicMaterial({ color: 0xb06cff, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
      const b = addBox(scene, x0, x1, player.pos.y, player.pos.y + 3.2, z0, z1, { material: mat, edgeColor: 0xd9b8ff });
      b.temp = true;
      tempWalls.push({ b, life: 8 });
      sfxTone(200, 600, 0.3, 0.2, 'triangle');
      break;
    }
    case 'scan':
      for (const b of bots) if (b.alive && b.pos.distanceTo(player.pos) < 90) b.revealed = 6;
      sfxTone(900, 900, 0.5, 0.15, 'sine');
      break;
    case 'heilung':
      player.healLeft = 60;
      sfxTone(500, 1000, 0.6, 0.15, 'sine');
      break;
    case 'katapult':
      player.vel.y = 26; player.jumps = 1;
      sfxTone(250, 1500, 0.4, 0.2, 'triangle');
      break;
    case 'tarnung':
      player.cloak = 6;
      sfxTone(1200, 200, 0.5, 0.15, 'sine');
      break;
    case 'schockwelle':
      explode(new THREE.Vector3(player.pos.x, player.pos.y + 1, player.pos.z), 8, 30, player, { noSelf: true, push: 24, color: 0xb06cff });
      break;
    case 'mine': {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.15, 12), new THREE.MeshBasicMaterial({ color: 0xff3355 }));
      m.position.set(player.pos.x, player.pos.y + 0.08, player.pos.z);
      scene.add(m);
      mines.push({ pos: player.pos.clone(), mesh: m, owner: player, arm: 0.8, life: 90, dmg: 75 });
      if (mines.length > 3) { const old = mines.shift(); scene.remove(old.mesh); }
      sfxTone(800, 600, 0.15, 0.15, 'square');
      break;
    }
    case 'stampfer':
      player.slamT = player.onGround ? 0.3 : 0.01;
      if (player.onGround) player.vel.y = 11;
      sfxTone(400, 900, 0.3, 0.15, 'triangle');
      break;
    case 'bastion':
      player.shieldT = 4;
      sfxTone(300, 300, 0.6, 0.15, 'square');
      break;
  }
  a.cd = abilityCd(a);
}
// ---------------------------------------------------------------- Projektile, Explosionen, Minen
const projectiles = [];
const mines = [];
const booms = [];
const projGeo = new THREE.SphereGeometry(0.2, 8, 8);
const boomGeo = new THREE.SphereGeometry(1, 16, 12);
function launchProjectile(owner, origin, dir, w) {
  const m = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({ color: WEAPONS[w.id].color }));
  m.position.copy(origin);
  scene.add(m);
  projectiles.push({ owner, pos: origin.clone(), vel: dir.clone().multiplyScalar(45), mesh: m, life: 4, dmg: WEAPONS[w.id].dmg * lvlDmg(w.level) });
}
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.vel.y -= GRAV * 0.5 * gravMul * dt;
    const step = p.vel.length() * dt;
    const d = p.vel.clone().normalize();
    const res = traceShot([p.pos.x, p.pos.y, p.pos.z], [d.x, d.y, d.z], step, p.owner);
    p.life -= dt;
    if (res.t < step || p.life <= 0) {
      explode(p.pos.clone().addScaledVector(d, Math.min(res.t, step) - 0.1), 4.5, p.dmg, p.owner);
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
      continue;
    }
    p.pos.addScaledVector(d, step);
    p.mesh.position.copy(p.pos);
  }
}
/** Flächenschaden mit Rückstoß. Eigenschaden 30 % (Raketensprung möglich). */
function explode(pos, radius, dmg, source, opts = {}) {
  let hitSomeone = false;
  for (const e of entities) {
    if (!e.alive) continue;
    if (opts.noSelf && e === source) continue;
    const c = new THREE.Vector3(e.pos.x, e.pos.y + 0.9, e.pos.z);
    const dist = c.distanceTo(pos);
    if (dist > radius) continue;
    const f = 1 - (dist / radius) * 0.6;
    const push = c.clone().sub(pos);
    push.y = Math.max(push.y, 0.4);
    e.vel.addScaledVector(push.normalize(), (opts.push || 14) * f);
    damage(e, dmg * f * (e === source ? 0.3 : 1), source);
    if (e !== source) hitSomeone = true;
  }
  if (hitSomeone && source && source.isPlayer) hitmarker(false);
  const m = new THREE.Mesh(boomGeo, new THREE.MeshBasicMaterial({ color: opts.color || 0xff9b2c, transparent: true, opacity: 0.7, depthWrite: false }));
  m.position.copy(pos);
  scene.add(m);
  booms.push({ m, life: 0.35, r: radius });
  const vol = clamp(1 - pos.distanceTo(player.pos) / 120, 0.05, 1);
  sfxShot('hagel', vol);
  sfxTone(160, 40, 0.5, 0.25 * vol, 'sawtooth');
}
function updateMines(dt) {
  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i];
    m.arm -= dt; m.life -= dt;
    m.mesh.material.color.set(Math.sin(gameTime * 10) > 0 ? 0xff3355 : 0x330008);
    let boom = m.life <= 0;
    if (m.arm <= 0) for (const e of entities) if (e.alive && e !== m.owner && Math.hypot(e.pos.x - m.pos.x, e.pos.z - m.pos.z) < 3 && Math.abs(e.pos.y - m.pos.y) < 2) boom = true;
    if (boom) {
      if (m.life > 0) explode(m.pos.clone().setY(m.pos.y + 0.4), 4.5, m.dmg, m.owner, { noSelf: true });
      scene.remove(m.mesh);
      mines.splice(i, 1);
    }
  }
  for (let i = booms.length - 1; i >= 0; i--) {
    const b = booms[i];
    b.life -= dt;
    b.m.scale.setScalar(b.r * (1 - b.life / 0.35) + 0.3);
    b.m.material.opacity = b.life / 0.35 * 0.7;
    if (b.life <= 0) { scene.remove(b.m); b.m.material.dispose(); booms.splice(i, 1); }
  }
}

// ---------------------------------------------------------------- Stadt-Events
function updateEvents(dt) {
  if (!cityEvent && gameTime >= nextEventAt && !core) {
    cityEvent = { ...pick(EVENTS), t: 25 };
    pushFeed(`Stadt-Event: ${cityEvent.name}!`, true);
    sfxTone(400, 1600, 0.8, 0.15, 'triangle');
  }
  if (cityEvent) {
    cityEvent.t -= dt;
    if (cityEvent.t <= 0 || core) { cityEvent = null; nextEventAt = gameTime + rand(45, 70); }
  }
  gravMul = ev('schwerelos') ? 0.45 : 1;
  if (ev('radar')) for (const b of bots) if (b.alive) b.revealed = Math.max(b.revealed, 0.2);
  const el = $('event');
  if (cityEvent) { el.classList.remove('hidden'); el.innerHTML = `<b>${cityEvent.name}</b> · ${cityEvent.desc} · ${Math.ceil(cityEvent.t)} s`; }
  else el.classList.add('hidden');
}

// ---------------------------------------------------------------- Geistermodus
let beacons = [];
function enterGhost() {
  const p = player;
  p.ghost = true; p.ghostT = 45; p.usedRevive = true; p.reviveHold = 0;
  p.weapons = [null, null]; p.cur = 0; p.reloading = 0; p.cloak = 0; p.shieldT = 0;
  updateViewModel();
  // Drei Rückkehrsäulen in sicheren Sektoren, die nächsten zuerst
  const safe = sectors.map((s, i) => i).filter((i) => sectors[i].state === 0);
  safe.sort((a, b) => {
    const ca = sectorCenter(a), cb = sectorCenter(b);
    return Math.hypot(ca.x - p.pos.x, ca.z - p.pos.z) - Math.hypot(cb.x - p.pos.x, cb.z - p.pos.z);
  });
  for (const i of safe.slice(1, 4).concat(safe.slice(0, 1)).slice(0, 3)) {
    const c = sectorCenter(i);
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 200, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x3dff9a, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 100;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.12, 8, 32), new THREE.MeshBasicMaterial({ color: 0x3dff9a }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.2;
    g.add(beam, ring);
    g.position.set(c.x, 0, c.z);
    scene.add(g);
    beacons.push({ x: c.x, z: c.z, mesh: g, sector: i });
  }
  document.body.classList.add('ghostmode');
  pushFeed('Du bist ein Geist! Erreiche eine grüne Rückkehrsäule.', true);
  sfxTone(600, 80, 1.2, 0.2, 'sine');
}
function clearBeacons() {
  for (const b of beacons) scene.remove(b.mesh);
  beacons = [];
  document.body.classList.remove('ghostmode');
}
function updateGhost(dt) {
  const p = player;
  p.ghostT -= dt;
  beacons = beacons.filter((b) => { if (sectors[b.sector].state === 2) { scene.remove(b.mesh); return false; } return true; });
  if (p.ghostT <= 0 || !beacons.length) { clearBeacons(); p.ghost = false; endGame(false); return; }
  let near = null;
  for (const b of beacons) if (Math.hypot(b.x - p.pos.x, b.z - p.pos.z) < 3 && p.pos.y < 3) near = b;
  if (near && keys.KeyF) {
    p.reviveHold += dt;
    if (p.reviveHold >= 3) {
      clearBeacons();
      p.ghost = false; p.alive = true; p.hp = 60; p.armor = 0;
      p.weapons[0] = newWeapon('funke', 1); p.cur = 0;
      updateViewModel();
      pushFeed('Du bist zurück!', true);
      sfxTone(200, 1200, 0.8, 0.2, 'triangle');
    }
  } else p.reviveHold = Math.max(0, p.reviveHold - dt);
  $('ghostInfo').classList.remove('hidden');
  $('ghostInfo').innerHTML = near
    ? `Halte <b>F</b>: Rückkehr ${Math.floor(p.reviveHold / 3 * 100)} %`
    : `Geist · ${fmt(p.ghostT)} · Erreiche eine grüne Rückkehrsäule`;
}

function updateTempWalls(dt) {
  for (let i = tempWalls.length - 1; i >= 0; i--) {
    const w = tempWalls[i];
    w.life -= dt;
    if (w.life <= 0) {
      scene.remove(w.b.mesh);
      boxes.splice(boxes.indexOf(w.b), 1);
      tempWalls.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------- Spieler
const keys = {};
let mouseDown = false, rightDown = false;
let yaw = 0, pitch = 0;
let viewModel = null;

function updateViewModel() {
  if (viewModel) camera.remove(viewModel);
  const w = player.weapons[player.cur];
  if (!w) { viewModel = null; return; }
  const W = WEAPONS[w.id];
  viewModel = new THREE.Group();
  const len = W.len || (w.id === 'lanze' ? 0.9 : w.id === 'funke' ? 0.5 : 0.7);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, len), new THREE.MeshStandardMaterial({ color: 0x1c2240, emissive: W.color, emissiveIntensity: 0.25 }));
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, len * 0.9), new THREE.MeshBasicMaterial({ color: W.color }));
  strip.position.set(0.055, 0.03, 0);
  viewModel.add(body, strip);
  for (let i = 1; i < w.level; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 16), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
    r.position.z = -len / 2 + i * 0.08; viewModel.add(r);
  }
  viewModel.position.set(0.26, -0.24, -0.45 - len / 2);
  camera.add(viewModel);
}

function updatePlayer(dt) {
  const p = player;
  // Bewegung
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const wish = new THREE.Vector3();
  if (keys.KeyW) wish.add(fwd);
  if (keys.KeyS) wish.sub(fwd);
  if (keys.KeyD) wish.add(right);
  if (keys.KeyA) wish.sub(right);
  if (wish.lengthSq()) wish.normalize();
  const sprint = keys.ShiftLeft && keys.KeyW && !p.zoomed;
  const speed = (p.ghost ? 12 : sprint ? 12.5 : 8.5) * (ev('turbo') ? 1.35 : 1);
  // Rutschen: Strg oder C beim Sprinten
  if ((keys.ControlLeft || keys.KeyC) && p.onGround && sprint && !(p.slideT > 0) && !(p.slideCd > 0)) {
    p.slideT = 0.8; p.slideCd = 1.2;
    const dir = new THREE.Vector3(p.vel.x, 0, p.vel.z).normalize();
    p.vel.x = dir.x * 17; p.vel.z = dir.z * 17;
    sfxTone(300, 120, 0.3, 0.08, 'sawtooth');
  }
  p.slideCd = Math.max(0, (p.slideCd || 0) - dt);
  if (p.slideT > 0) {
    p.slideT -= dt;
    p.vel.x *= 1 - 1.3 * dt; p.vel.z *= 1 - 1.3 * dt;
  } else {
    const accel = p.onGround ? 14 : 4;
    p.vel.x += (wish.x * speed - p.vel.x) * Math.min(1, accel * dt);
    p.vel.z += (wish.z * speed - p.vel.z) * Math.min(1, accel * dt);
  }
  // Stampfer
  if (p.slamT > 0) { p.slamT -= dt; if (p.slamT <= 0) { p.vel.y = -45; p.slamming = true; } }
  p.vel.y -= GRAV * gravMul * dt;

  // Klettern an Wänden: Leertaste + vorwärts gegen eine Wand
  if (p.lastWall && keys.Space && keys.KeyW && p.climb > 0 && !p.onGround) {
    p.vel.y = Math.max(p.vel.y, 7);
    p.climb -= dt;
  }
  moveEntity(p, dt);
  if (p.slamming && p.onGround) {
    p.slamming = false;
    explode(new THREE.Vector3(p.pos.x, p.pos.y + 0.5, p.pos.z), 6.5, 50, p, { noSelf: true, push: 18, color: 0xffd34d });
  }
  if (p.onGround) { p.jumps = 0; p.climb = 1.1; }
  p.lastWall = p.wallBox;
  // Kante hochziehen
  if (p.wallBox && keys.KeyW && !p.onGround) {
    const top = p.wallBox.mx[1];
    if (top - p.pos.y < 1.9 && top - p.pos.y > 0) {
      p.pos.y = top + 0.02; p.vel.y = 1;
      p.pos.addScaledVector(fwd, 0.3);
    }
  }
  checkJumpPad(p);

  if (p.cloak > 0) p.cloak -= dt;
  if (p.shieldT > 0) p.shieldT -= dt;
  document.body.classList.toggle('cloaked', p.cloak > 0);
  document.body.classList.toggle('shielded', p.shieldT > 0);
  if (p.ghost) {
    camera.position.set(p.pos.x, p.pos.y + EYE, p.pos.z);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    updateGhost(dt);
    return;
  }
  $('ghostInfo').classList.add('hidden');
  // Heilung über Zeit
  for (const e of entities) {
    if (e.alive && e.healLeft > 0) {
      const h = Math.min(e.healLeft, 20 * dt);
      e.healLeft -= h; e.hp = Math.min(100, e.hp + h);
    }
  }

  // Kamera
  p.zoomed = rightDown && p.weapons[p.cur] && WEAPONS[p.weapons[p.cur].id].zoom;
  const targetFov = p.zoomed ? 28 : rightDown ? 62 : sprint ? 84 : 78;
  camera.fov += (targetFov - camera.fov) * Math.min(1, 12 * dt);
  camera.updateProjectionMatrix();
  const eye = p.slideT > 0 ? 0.9 : EYE;
  camera.position.set(p.pos.x, p.pos.y + eye, p.pos.z);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  if (viewModel) {
    viewModel.visible = !p.zoomed;
    const bob = p.onGround ? Math.sin(gameTime * (sprint ? 14 : 10)) * Math.hypot(p.vel.x, p.vel.z) * 0.002 : 0;
    viewModel.position.y = -0.25 + bob - (p.recoil || 0) * 0.04;
    viewModel.rotation.x = p.reloading > 0 ? -0.6 : (p.recoil || 0) * 0.15;
  }
  p.recoil = Math.max(0, (p.recoil || 0) - dt * 8);

  // Waffen
  const w = p.weapons[p.cur];
  p.fireCd -= dt;
  if (w) {
    const W = WEAPONS[w.id];
    if (p.reloading > 0) {
      p.reloading -= dt;
      if (p.reloading <= 0) w.ammo = lvlMag(W, w.level);
    } else if (keys.KeyR && w.ammo < lvlMag(W, w.level)) {
      p.reloading = W.reload;
      sfxTone(300, 200, 0.15, 0.1, 'square');
    } else if (p.burstLeft > 0) {
      p.burstCd -= dt;
      if (p.burstCd <= 0) { shootPlayer(w); p.burstLeft--; p.burstCd = 0.07; }
    } else if (mouseDown && p.fireCd <= 0) {
      if (w.ammo <= 0) { p.reloading = W.reload; sfxTone(300, 200, 0.15, 0.1, 'square'); }
      else {
        shootPlayer(w);
        if (W.burst) { p.burstLeft = W.burst - 1; p.burstCd = 0.07; }
        p.fireCd = W.rate;
        if (!W.auto) mouseDown = false;
      }
    }
  }
  // Fähigkeiten-Abklingzeit
  for (const a of p.abilities) if (a && a.cd > 0) a.cd -= dt * (ev('aufladung') ? 3 : 1);
  autoPickup();
}
function shootPlayer(w) {
  if (w.ammo <= 0) return;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  fireWeapon(player, camera.position.clone(), dir, w, 1);
  player.recoil = 1;
  player.cloak = 0; // Schießen hebt die Tarnung auf
  pitch = Math.min(1.5, pitch + (w.id === 'lanze' ? 0.03 : w.id === 'hagel' ? 0.04 : 0.006));
}

// ---------------------------------------------------------------- Zerfall & Kern
const WAVES = [8, 9, 9, 9, 8, 7, 6, 4, 3];
const FIRST_WAVE = 45, WARN = 12;
const neighbors = (i) => {
  const x = i % NS, z = Math.floor(i / NS), out = [];
  if (x > 0) out.push(i - 1); if (x < NS - 1) out.push(i + 1);
  if (z > 0) out.push(i - NS); if (z < NS - 1) out.push(i + NS);
  return out;
};
function initDecay() {
  // Der „Schwerpunkt“ der sicheren Zone wandert im Spielverlauf. Der letzte Sektor steht nicht vorher fest.
  decay = { finalSector: -1, wave: 0, nextAt: FIRST_WAVE, warning: [], attractor: { x: rand(-120, 120), z: rand(-120, 120) }, dissolving: [] };
}
/** Wählt die nächsten zerfallenden Sektoren: Fäulnis breitet sich vom Rand und von zerfallenen Sektoren aus,
 *  fern vom wandernden Schwerpunkt, mit Zufall. Die sichere Zone bleibt dabei zusammenhängend. */
function chooseDecay(count) {
  // Schwerpunkt springt zu einem zufälligen noch sicheren Sektor in der Nähe
  const safe = sectors.map((s, i) => i).filter((i) => sectors[i].state === 0);
  const near = safe.filter((i) => { const c = sectorCenter(i); return Math.hypot(c.x - decay.attractor.x, c.z - decay.attractor.z) < 140; });
  const tgt = sectorCenter(pick(near.length ? near : safe));
  decay.attractor.x += (tgt.x - decay.attractor.x) * 0.6;
  decay.attractor.z += (tgt.z - decay.attractor.z) * 0.6;
  const chosen = [];
  for (let k = 0; k < count; k++) {
    const cand = sectors.map((s, i) => i).filter((i) => sectors[i].state === 0 && !chosen.includes(i));
    if (cand.length <= 1) break;
    let best = -1, bestScore = -Infinity;
    for (const i of cand) {
      const nb = neighbors(i);
      const edge = nb.length < 4 ? 1 : 0;
      const rotten = nb.filter((n) => sectors[n].state > 0 || chosen.includes(n)).length;
      if (!edge && !rotten) continue; // nur an der Front
      const c = sectorCenter(i);
      const score = Math.hypot(c.x - decay.attractor.x, c.z - decay.attractor.z) + rotten * 18 + rand(0, 70);
      if (score > bestScore && keepsConnected(i, chosen)) { bestScore = score; best = i; }
    }
    if (best < 0) break;
    chosen.push(best);
  }
  return chosen;
}
function keepsConnected(removeIdx, chosen) {
  const safe = sectors.map((s, i) => i).filter((i) => sectors[i].state === 0 && i !== removeIdx && !chosen.includes(i));
  if (safe.length <= 1) return true;
  const set = new Set(safe), seen = new Set([safe[0]]), stack = [safe[0]];
  while (stack.length) for (const n of neighbors(stack.pop())) if (set.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
  return seen.size === safe.length;
}
function startDissolve(i) {
  for (const b of buildingsBySector[i]) {
    b.mesh.material.emissiveIntensity = 0.12;
    if (b.edges) b.edges.material.color.set(0xff2040);
    decay.dissolving.push({ b, h0: b.mx[1] - b.mn[1], y0: b.mn[1], t: rand(0, 1.5) });
  }
  // Beute auf Dächern fällt auf die Straße
  for (const it of loot) if (sectorOf(it.mesh.position.x, it.mesh.position.z) === i) it.base = 0.7;
}
function updateDissolve(dt) {
  for (let k = decay.dissolving.length - 1; k >= 0; k--) {
    const d = decay.dissolving[k];
    d.t += dt;
    const f = clamp(1 - (d.t - 1.5) / 5, 0, 1); // nach 1,5 s Flackern 5 s Versinken
    const b = d.b;
    if (d.t < 1.5) { b.mesh.visible = Math.random() > 0.15; continue; }
    b.mesh.visible = true;
    const h = Math.max(0.001, d.h0 * f);
    b.mesh.scale.y = h / d.h0;
    b.mesh.position.y = d.y0 * f + h / 2;
    b.mn[1] = d.y0 * f; b.mx[1] = b.mn[1] + h;
    if (f <= 0) {
      worldGroup.remove(b.mesh);
      const idx = boxes.indexOf(b);
      if (idx >= 0) boxes.splice(idx, 1);
      decay.dissolving.splice(k, 1);
    }
  }
}
function updateDecay(dt) {
  updateDissolve(dt);
  if (!core) {
    // Warnphase starten
    if (!decay.warning.length && gameTime >= decay.nextAt - WARN) {
      decay.warning = chooseDecay(WAVES[Math.min(decay.wave, WAVES.length - 1)]);
      for (const i of decay.warning) sectors[i].state = 1;
      sfxTone(600, 400, 0.6, 0.15, 'sawtooth');
      if (decay.warning.includes(sectorOf(player.pos.x, player.pos.z))) pushFeed('Dein Sektor zerfällt gleich!', true);
    }
    if (gameTime >= decay.nextAt) {
      for (const i of decay.warning) { sectors[i].state = 2; startDissolve(i); }
      decay.warning = [];
      decay.wave++;
      // Dynamisch: je weniger Spieler übrig sind, desto schneller zerfällt die Stadt
      const aliveFrac = entities.filter((e) => e.alive).length / entities.length;
      decay.nextAt = gameTime + 20 + 16 * aliveFrac;
      const safeLeft = sectors.filter((s) => s.state === 0).length;
      if (safeLeft <= 1) {
        decay.finalSector = sectors.findIndex((s) => s.state === 0);
        spawnCore();
      }
    }
  }
  // Säulen darstellen
  for (let i = 0; i < sectors.length; i++) {
    const s = sectors[i];
    s.column.visible = s.state > 0;
    if (s.state === 1) { s.column.material.color.set(0xff9b2c); s.column.material.opacity = 0.06 + 0.06 * Math.sin(gameTime * 6); }
    if (s.state === 2) { s.column.material.color.set(0xff2040); s.column.material.opacity = 0.16; }
  }
  // Schaden im Zerfall
  for (const e of entities) {
    if (!e.alive) continue;
    if (sectors[sectorOf(e.pos.x, e.pos.z)].state === 2) damage(e, (5 + decay.wave * 1.5) * dt, null);
  }
}
function spawnCore() {
  const c = sectorCenter(decay.finalSector);
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 1), new THREE.MeshBasicMaterial({ color: 0xffd34d, wireframe: true }));
  const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }));
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 300, 8), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.35 }));
  beam.position.y = 150;
  const zone = new THREE.Mesh(new THREE.RingGeometry(4.6, 5, 48), new THREE.MeshBasicMaterial({ color: 0xffd34d, side: THREE.DoubleSide }));
  zone.rotation.x = -Math.PI / 2; zone.position.y = -1.45;
  g.add(m, inner, beam, zone);
  g.position.set(c.x, 1.5, c.z);
  scene.add(g);
  core = { active: true, pos: new THREE.Vector3(c.x, 0, c.z), mesh: g, spin: m, progress: new Map() };
  pushFeed('Der Kern ist erschienen!', true);
  sfxTone(200, 800, 1.2, 0.2, 'sawtooth');
}
function updateCore(dt) {
  if (!core) return;
  core.spin.rotation.y += dt; core.spin.rotation.x += dt * 0.5;
  const inside = entities.filter((e) => e.alive && Math.hypot(e.pos.x - core.pos.x, e.pos.z - core.pos.z) < 5 && e.pos.y < 4);
  for (const e of inside) if (!e.isPlayer) e.revealed = Math.max(e.revealed, 0.3); // Kernträger sichtbar
  if (inside.length === 1) {
    const e = inside[0];
    const v = (core.progress.get(e) || 0) + dt;
    core.progress.set(e, v);
    if (v >= 30) { if (e.isPlayer) endGame(true); else { for (const x of entities) if (x !== e && x.alive) kill(x, e); endGame(false); } }
  }
  const mine = core.progress.get(player) || 0;
  $('corebar').classList.remove('hidden');
  $('coreFill').style.width = `${(mine / 30) * 100}%`;
  const contested = inside.length > 1 ? ' · umkämpft!' : '';
  let leader = null, lv = 0;
  for (const [e, v] of core.progress) if (e.alive && v > lv) { lv = v; leader = e; }
  $('coreText').textContent = `Kern: du ${mine.toFixed(0)}/30 s${leader && !leader.isPlayer ? ` · ${leader.name} ${lv.toFixed(0)} s` : ''}${contested}`;
}

// ---------------------------------------------------------------- HUD
function pushFeed(text, me = false) {
  const div = document.createElement('div');
  div.textContent = text;
  if (me) div.className = 'me';
  $('feed').prepend(div);
  feedItems.push({ div, life: 6 });
  while ($('feed').children.length > 6) $('feed').lastChild.remove();
}
let hitTimer = 0;
function hitmarker(head) {
  const h = $('hitmarker');
  h.classList.add('on'); h.classList.toggle('head', head);
  hitTimer = 0.08;
  sfxTone(head ? 1800 : 1200, head ? 1600 : 1000, 0.05, 0.08, 'square');
}
let vignette = 0;
function flashVignette(v) { vignette = Math.min(1, vignette + v); }

const mm = $('minimap').getContext('2d');
function drawMinimap() {
  const S = 200 / (HALF * 2);
  mm.clearRect(0, 0, 200, 200);
  for (let i = 0; i < NS * NS; i++) {
    const sx = (i % NS) * SECTOR * S, sz = Math.floor(i / NS) * SECTOR * S;
    const st = sectors[i].state;
    mm.fillStyle = st === 2 ? '#ff204066' : st === 1 ? (Math.sin(gameTime * 6) > 0 ? '#ff9b2c66' : '#ff9b2c33') : '#2cf3ff10';
    mm.fillRect(sx, sz, SECTOR * S, SECTOR * S);
    mm.strokeStyle = '#2cf3ff22';
    mm.strokeRect(sx, sz, SECTOR * S, SECTOR * S);
  }
  mm.fillStyle = '#9fb4d055';
  for (const b of boxes) {
    if (b.temp || b.mx[1] < 3) continue;
    mm.fillRect((b.mn[0] + HALF) * S, (b.mn[2] + HALF) * S, (b.mx[0] - b.mn[0]) * S, (b.mx[2] - b.mn[2]) * S);
  }
  for (const b of beacons) { mm.fillStyle = '#3dff9a'; mm.beginPath(); mm.arc((b.x + HALF) * S, (b.z + HALF) * S, 5, 0, 7); mm.fill(); }
  if (core) { mm.fillStyle = '#ffd34d'; mm.beginPath(); mm.arc((core.pos.x + HALF) * S, (core.pos.z + HALF) * S, 5, 0, 7); mm.fill(); }
  for (const b of bots) {
    if (!b.alive || b.revealed <= 0) continue;
    mm.fillStyle = '#ff3355';
    mm.fillRect((b.pos.x + HALF) * S - 2, (b.pos.z + HALF) * S - 2, 4, 4);
  }
  // Spieler-Pfeil
  const px = (player.pos.x + HALF) * S, pz = (player.pos.z + HALF) * S;
  mm.save(); mm.translate(px, pz); mm.rotate(-yaw);
  mm.fillStyle = '#ffffff';
  mm.beginPath(); mm.moveTo(0, -6); mm.lineTo(4, 5); mm.lineTo(-4, 5); mm.closePath(); mm.fill();
  mm.restore();
}

function fmt(t) { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }
let hudCd = 0;
function updateHud(dt) {
  hitTimer -= dt;
  if (hitTimer <= 0) $('hitmarker').classList.remove('on');
  vignette = Math.max(0, vignette - dt * 1.5);
  const lowHp = player.hp < 30 ? 0.35 + 0.15 * Math.sin(gameTime * 5) : 0;
  const inDecay = sectors[sectorOf(player.pos.x, player.pos.z)].state === 2 ? 0.5 : 0;
  $('vignette').style.opacity = Math.max(vignette, lowHp, inDecay);

  hudCd -= dt;
  if (hudCd > 0) return;
  hudCd = 0.1;
  $('hpBar').style.width = `${player.hp}%`;
  $('armorBar').style.width = `${player.armor}%`;
  $('vitalsText').textContent = `HP ${Math.ceil(player.hp)} · Rüstung ${Math.ceil(player.armor)}`;
  $('alive').textContent = entities.filter((e) => e.alive).length;
  $('kills').textContent = player.kills;

  const ph = $('phase');
  if (core) { $('phaseTitle').textContent = 'Finale'; $('phaseTimer').textContent = 'Kern halten'; ph.classList.remove('warn'); }
  else if (decay.warning.length) { $('phaseTitle').textContent = `Zerfall: ${decay.warning.length} Sektoren`; $('phaseTimer').textContent = fmt(decay.nextAt - gameTime); ph.classList.add('warn'); }
  else { $('phaseTitle').textContent = `Nächster Zerfall · Welle ${decay.wave + 1}`; $('phaseTimer').textContent = fmt(decay.nextAt - WARN - gameTime); ph.classList.remove('warn'); }

  for (let i = 0; i < 2; i++) {
    const w = player.weapons[i], el = $('wp' + i);
    el.classList.toggle('active', i === player.cur);
    if (!w) { el.innerHTML = `<span>${i + 1} · leer</span>`; continue; }
    const W = WEAPONS[w.id];
    const ammo = player.reloading > 0 && i === player.cur ? '…' : `${w.ammo}/${lvlMag(W, w.level)}`;
    el.innerHTML = `<span class="ammo">${ammo}</span>${i + 1} · ${W.name} <span class="lvl">${LEVEL_NAMES[w.level]}</span><br><small>${W.desc}</small>`;
  }
  for (let i = 0; i < 2; i++) {
    const a = player.abilities[i], el = $('ab' + i);
    const key = i ? 'E' : 'Q';
    el.classList.toggle('empty', !a);
    if (!a) { el.innerHTML = `<span class="key">${key}</span> leer`; continue; }
    const A = ABILITIES[a.id];
    const cdTxt = a.cd > 0 ? `${a.cd.toFixed(1)} s` : 'bereit';
    el.innerHTML = `<span class="key">${key}</span> ${A.name} <span class="lvl" style="color:#ffd34d">${LEVEL_NAMES[a.level]}</span><br><small>${cdTxt}</small><div class="cd" style="width:${a.cd > 0 ? (1 - a.cd / abilityCd(a)) * 100 : 100}%"></div>`;
  }
  const near = player.ghost ? null : nearestLoot(2.6);
  $('prompt').innerHTML = near ? lootLabel(near) : '';
  drawMinimap();
}

// ---------------------------------------------------------------- Ablauf
function clearScene() {
  for (const it of loot) scene.remove(it.mesh);
  for (const b of bots) if (b.mesh) scene.remove(b.mesh);
  for (const w of tempWalls) scene.remove(w.b.mesh);
  tempWalls.length = 0;
  if (core) scene.remove(core.mesh);
  for (const p of projectiles) scene.remove(p.mesh);
  for (const m of mines) scene.remove(m.mesh);
  for (const b of booms) scene.remove(b.m);
  projectiles.length = 0; mines.length = 0; booms.length = 0;
  clearBeacons();
  cityEvent = null; nextEventAt = 75; gravMul = 1;
  loot = []; bots = []; entities = []; core = null;
  $('feed').innerHTML = '';
  $('corebar').classList.add('hidden');
}

function startGame() {
  clearScene();
  sectors = Array.from({ length: NS * NS }, () => ({ state: 0, column: null }));
  buildWorld();
  initDecay();
  gameTime = 0;

  player = makeEntity('Du', true);
  player.jumps = 0; player.climb = 1.1; player.armor = 50;
  player.weapons[0] = newWeapon('funke', 1);
  player.abilities[0] = { id: 'sprung', level: 1, cd: 0 };
  // Landung: zufällige Position hoch über der Stadt
  player.pos.set(rand(-150, 150), 90, rand(-150, 150));
  entities.push(player);
  const diffList = DIFF_IDS.flatMap((k) => Array(botConfig[k]).fill(k));
  for (let i = 0; i < diffList.length; i++) {
    const b = createBot(i, diffList[i]);
    const n = { x: snapNode(rand(-HALF, HALF)), z: snapNode(rand(-HALF, HALF)) };
    b.pos.set(n.x, 60 + rand(0, 30), n.z);
    bots.push(b); entities.push(b);
  }
  spawnAllLoot();
  yaw = Math.random() * Math.PI * 2; pitch = -0.5;
  updateViewModel();
  state = 'play';
  $('hud').classList.remove('hidden');
  $('menu').classList.add('hidden');
  pushFeed('Landung! Sammle Waffen auf den Dächern.', true);
}

function checkWin() {
  if (state !== 'play') return;
  const alive = entities.filter((e) => e.alive).length;
  if (player.alive && alive === 1) endGame(true);
  if (player.ghost && alive <= 1) { clearBeacons(); endGame(false); }
}

function endGame(won) {
  if (state !== 'play') return;
  state = 'over';
  const placement = entities.filter((e) => e.alive).length + (won ? 0 : 1);
  document.body.classList.remove('ghostmode', 'cloaked', 'shielded');
  document.exitPointerLock?.();
  $('menu').classList.remove('hidden');
  $('play').textContent = 'Neue Runde';
  $('botsetup').classList.remove('hidden');
  $('result').innerHTML = won
    ? `🏆 Sieg! ${player.kills} Kills in ${fmt(gameTime)}`
    : `Ausgeschieden: Platz ${placement} von ${bots.length + 1} · ${player.kills} Kills · ${fmt(gameTime)}`;
  sfxTone(won ? 400 : 300, won ? 1200 : 100, 1, 0.2, 'triangle');
}

function tick(dt) {
  gameTime += dt;
  updatePlayer(dt);
  for (const b of bots) if (b.alive) updateBot(b, dt);
  updateDecay(dt);
  updateCore(dt);
  updateTempWalls(dt);
  updateProjectiles(dt);
  updateMines(dt);
  updateEvents(dt);
  updateFx(dt);
  for (const it of loot) {
    it.mesh.rotation.y += dt * 1.5;
    it.mesh.position.y = it.base + Math.sin(gameTime * 2 + it.phase) * 0.15;
  }
  for (const p of jumpPads) p.ring.position.y = 0.1 + ((gameTime * 1.5) % 1) * 1.5;
  updateHud(dt);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state === 'play' && !paused) tick(dt);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- Eingabe
let paused = false;
const canvas = renderer.domElement;
$('play').addEventListener('click', () => {
  initAudio();
  if (state !== 'play') startGame();
  paused = false;
  $('menu').classList.add('hidden');
  canvas.requestPointerLock?.();
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && state === 'play') {
    paused = true;
    $('play').textContent = 'Fortsetzen';
    $('botsetup').classList.add('hidden');
    $('result').textContent = 'Pausiert';
    $('menu').classList.remove('hidden');
  } else if (document.pointerLockElement === canvas) {
    paused = false; $('result').textContent = '';
  }
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || state !== 'play') return;
  const sens = 0.0022 * (player.zoomed ? 0.4 : 1);
  yaw -= e.movementX * sens;
  pitch = clamp(pitch - e.movementY * sens, -1.5, 1.5);
});
document.addEventListener('mousedown', (e) => {
  if (state !== 'play' || paused) return;
  if (e.button === 0) mouseDown = true;
  if (e.button === 2) rightDown = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) rightDown = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('wheel', () => {
  if (state === 'play' && player.weapons[1 - player.cur]) { player.cur = 1 - player.cur; player.reloading = 0; updateViewModel(); }
});
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (state !== 'play' || paused) return;
  if (e.code === 'Space' && !e.repeat) {
    if (player.onGround) { player.vel.y = 9.5; player.jumps = 1; }
    else if (player.jumps < 2 && !player.lastWall) { player.vel.y = 9; player.jumps = 2; sfxTone(500, 900, 0.12, 0.08); }
  }
  if (e.code === 'Digit1' && player.weapons[0]) { player.cur = 0; player.reloading = 0; updateViewModel(); }
  if (e.code === 'Digit2' && player.weapons[1]) { player.cur = 1; player.reloading = 0; updateViewModel(); }
  if (e.code === 'KeyQ') useAbility(0);
  if (e.code === 'KeyE') useAbility(1);
  if (e.code === 'KeyF' && !player.ghost) { const it = nearestLoot(2.6); if (it) pickUp(it); }
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

// Bot-Auswahl im Menü
function renderBotConfig() {
  const box = $('botcfg');
  box.innerHTML = '';
  for (const k of DIFF_IDS) {
    const D = DIFFS[k];
    const row = document.createElement('div');
    row.className = 'botrow';
    row.innerHTML = `<span class="dot" style="background:#${D.color.toString(16).padStart(6, '0')}"></span><span class="dl">${D.label}</span>`
      + `<button data-k="${k}" data-d="-1">−</button><span class="cnt">${botConfig[k]}</span><button data-k="${k}" data-d="1">+</button>`;
    box.appendChild(row);
  }
  $('botTotal').textContent = `${totalBots()} Bots · ${totalBots() + 1} Spieler`;
  $('play').disabled = totalBots() === 0;
  try { localStorage.setItem('zz-bots', JSON.stringify(botConfig)); } catch { /* egal */ }
}
$('botcfg').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const k = btn.dataset.k, d = +btn.dataset.d;
  if (d > 0 && totalBots() >= BOT_LIMIT) return;
  botConfig[k] = clamp(botConfig[k] + d, 0, BOT_LIMIT);
  renderBotConfig();
});
const PRESETS = {
  training: { leicht: 8, mittel: 0, schwer: 0, elite: 0 },
  normal: { leicht: 4, mittel: 7, schwer: 3, elite: 1 },
  hart: { leicht: 0, mittel: 5, schwer: 8, elite: 4 },
  albtraum: { leicht: 0, mittel: 0, schwer: 10, elite: 15 },
};
document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
  botConfig = { ...PRESETS[b.dataset.preset] };
  renderBotConfig();
}));
renderBotConfig();

// Szene im Menü zeigen
sectors = Array.from({ length: NS * NS }, () => ({ state: 0, column: null }));
buildWorld();
camera.position.set(0, 120, 220);
camera.lookAt(0, 0, 0);
requestAnimationFrame(frame);

// Für automatisierte Tests
window.__zz = {
  get state() { return state; }, get player() { return player; }, get bots() { return bots; },
  get entities() { return entities; }, get decay() { return decay; }, get core() { return core; },
  get loot() { return loot; }, get beacons() { return beacons; }, get cityEvent() { return cityEvent; }, sectors: () => sectors, startGame, tick, keys,
  setGameTime: (t) => { gameTime = t; },
};

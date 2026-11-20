// Zerfallzone – Client: Darstellung, Eingabe, Vorhersage, Lobby, Offline-Modus
import * as THREE from 'three';
import {
  Sim, generateWorld, applyDissolve, movePlayer, aimDir, MOVE_FIELDS, MOVE_DEFAULTS, DASH_MAX, DASH_REGEN, sectorOf,
  WEAPONS, ABILITIES, DIFFS, DIFF_IDS, MODES, LEVEL_NAMES, EVENTS, TEAM_COLORS, BOT_LIMIT, CORE_TIME, WARN,
  HALF, SECTOR, NS, EYE, lvlMag, abilityCd, clamp,
} from './shared/sim.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('zz-' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('zz-' + k, JSON.stringify(v)); } catch { /* ohne Speicher */ } },
};
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const fmt = (t) => { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.domElement.id = 'game';
document.body.prepend(renderer.domElement);
const canvas = renderer.domElement;
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

function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#141a33'; g.fillRect(0, 0, 128, 128);
  const cols = ['#2cf3ff', '#ff4dd2', '#ffd34d', '#9fb4ff'];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const on = Math.random() < 0.35;
    g.fillStyle = on ? cols[Math.floor(Math.random() * 4)] : '#1d2547';
    g.globalAlpha = on ? 0.4 + Math.random() * 0.5 : 1;
    g.fillRect(x * 16 + 3, y * 16 + 4, 10, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const windowTex = makeWindowTexture();
const crateMat = new THREE.MeshStandardMaterial({ color: 0x2a2f4a, roughness: 0.6 });

// ---------------------------------------------------------------- Audio
let actx = null, noiseBuf = null;
function initAudio() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.4, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { actx = null; }
}
function sfxShot(kind, vol = 1) {
  if (!actx || vol < 0.02) return;
  const src = actx.createBufferSource();
  src.buffer = noiseBuf;
  const f = actx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = { funke: 2200, puls: 1500, hagel: 700, lanze: 3500, dorn: 2800, moerser: 400, boom: 300 }[kind] || 1500;
  const g = actx.createGain();
  const dur = kind === 'hagel' || kind === 'boom' ? 0.3 : kind === 'lanze' ? 0.35 : 0.1;
  g.gain.setValueAtTime(0.35 * vol, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
  src.connect(f).connect(g).connect(actx.destination);
  src.start(); src.stop(actx.currentTime + dur);
  if (kind === 'lanze') tone(1400, 200, 0.3, 0.15 * vol, 'sawtooth');
  if (kind === 'boom') tone(160, 40, 0.5, 0.25 * vol, 'sawtooth');
}
function tone(f0, f1, dur, vol = 0.15, type = 'sine') {
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
const SND = {
  pad: [300, 1200, 0.4, 0.2, 'triangle'], slide: [300, 120, 0.3, 0.08, 'sawtooth'], reload: [300, 200, 0.15, 0.1, 'square'],
  ghost: [600, 80, 1.2, 0.2, 'sine'], fuse: [500, 1500, 0.3, 0.2, 'triangle'], pickup: [600, 900, 0.12, 0.15, 'sine'],
  heal: [400, 800, 0.2, 0.15, 'sine'], armor: [300, 700, 0.2, 0.15, 'sine'], warn: [600, 400, 0.6, 0.15, 'sawtooth'],
  core: [200, 800, 1.2, 0.2, 'sawtooth'], event: [400, 1600, 0.8, 0.15, 'triangle'], dj: [500, 900, 0.12, 0.08, 'sine'],
  revive: [200, 1200, 0.8, 0.2, 'triangle'], dash: [900, 2400, 0.12, 0.12, 'sawtooth'], wallrun: [180, 260, 0.35, 0.06, 'triangle'],
  walljump: [500, 1100, 0.14, 0.1, 'triangle'], mantle: [250, 500, 0.12, 0.08, 'triangle'], land: [120, 50, 0.15, 0.15, 'sine'], nodash: [200, 160, 0.08, 0.06, 'square'],
  ab_sprung: [1800, 300, 0.25, 0.2, 'square'], ab_bollwerk: [200, 600, 0.3, 0.2, 'triangle'], ab_scan: [900, 900, 0.5, 0.15, 'sine'],
  ab_heilung: [500, 1000, 0.6, 0.15, 'sine'], ab_katapult: [250, 1500, 0.4, 0.2, 'triangle'], ab_tarnung: [1200, 200, 0.5, 0.15, 'sine'],
  ab_schockwelle: [300, 80, 0.3, 0.15, 'sawtooth'], ab_mine: [800, 600, 0.15, 0.15, 'square'], ab_stampfer: [400, 900, 0.3, 0.15, 'triangle'],
  ab_bastion: [300, 300, 0.6, 0.15, 'square'], ab_enterhaken: [1500, 400, 0.2, 0.15, 'square'],
  zipon: [700, 1100, 0.15, 0.12, 'triangle'], zipoff: [900, 500, 0.12, 0.08, 'triangle'], hang: [300, 260, 0.1, 0.08, 'square'],
  updraft: [200, 500, 0.6, 0.06, 'sine'],
};
const playSnd = (s) => { const a = SND[s]; if (a) tone(...a); };

// ---------------------------------------------------------------- Menü-Zustand
const PRESETS = {
  training: { leicht: 8, mittel: 0, schwer: 0, elite: 0 },
  normal: { leicht: 4, mittel: 7, schwer: 3, elite: 1 },
  hart: { leicht: 0, mittel: 5, schwer: 8, elite: 4 },
  albtraum: { leicht: 0, mittel: 0, schwer: 10, elite: 15 },
};
let botConfig = { ...PRESETS.normal, ...store.get('bots', {}) };
let modeSel = store.get('mode', 'solo');
let sens = store.get('sens', 1);
const totalBots = (cfg) => DIFF_IDS.reduce((s, k) => s + (cfg[k] | 0), 0);

function renderBotCfg(el, totalEl, cfg, editable, onChange) {
  el.innerHTML = '';
  el.classList.toggle('readonly', !editable);
  for (const k of DIFF_IDS) {
    const D = DIFFS[k];
    const row = document.createElement('div');
    row.className = 'botrow';
    row.innerHTML = `<span class="dot" style="background:${hex(D.color)}"></span><span class="dl">${D.label}</span>`
      + `<button data-d="-1">−</button><span class="cnt">${cfg[k] | 0}</span><button data-d="1">+</button>`;
    row.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const d = +b.dataset.d;
      if (d > 0 && totalBots(cfg) >= BOT_LIMIT) return;
      cfg[k] = clamp((cfg[k] | 0) + d, 0, BOT_LIMIT);
      onChange();
    }));
    el.appendChild(row);
  }
  totalEl.textContent = `${totalBots(cfg)} Bots`;
}
function setChips(el, mode, editable, onPick) {
  el.classList.toggle('readonly', !editable);
  el.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', b.dataset.mode === mode);
    b.onclick = () => onPick(b.dataset.mode);
  });
}
function refreshMenu() {
  setChips($('modeChips'), modeSel, true, (m) => { modeSel = m; store.set('mode', m); refreshMenu(); });
  renderBotCfg($('botcfg'), $('botTotal'), botConfig, true, () => { store.set('bots', botConfig); refreshMenu(); });
  const size = MODES[modeSel].size;
  $('botTotal').textContent = `${totalBots(botConfig)} Bots · ${Math.ceil((totalBots(botConfig) + 1) / size)} Teams à ${size}`;
}
document.querySelectorAll('#menu [data-preset]').forEach((b) => b.addEventListener('click', () => {
  botConfig = { ...PRESETS[b.dataset.preset] }; store.set('bots', botConfig); refreshMenu();
}));
$('nameInput').value = store.get('name', '');
$('nameInput').addEventListener('change', () => store.set('name', $('nameInput').value.trim()));
$('sensInput').value = sens;
$('sensInput').addEventListener('input', () => { sens = +$('sensInput').value; store.set('sens', sens); });
const defaultServer = location.protocol.startsWith('http') ? location.host : 'localhost:7777';
$('serverInput').value = store.get('server', defaultServer);
$('serverHint').textContent = location.protocol.startsWith('http')
  ? `Freunde öffnen im Browser http://<deine-IP>:${location.port || 80} oder geben in der PC-App deine Adresse ein.`
  : '';
refreshMenu();
const playerName = () => ($('nameInput').value.trim() || 'Spieler').slice(0, 16);

function showScreen(id) {
  for (const s of ['menu', 'lobby', 'overlay']) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.toggle('hidden', id === 'menu' || id === 'lobby' || !game);
}

// ---------------------------------------------------------------- Verbindungen
/** Online: WebSocket zum Server */
class NetConn {
  constructor(addr, onMsg, onClose) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${addr}/ws`);
    this.online = true;
    this.ws.onmessage = (e) => onMsg(JSON.parse(e.data));
    this.ws.onclose = () => onClose();
    this.ready = new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
  }
  send(m) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  close() { this.ws.onclose = null; this.ws.close(); }
}
/** Offline: Simulation läuft im Browser, gleiche Nachrichten wie online */
class LocalConn {
  constructor(onMsg) { this.onMsg = onMsg; this.online = false; }
  start(mode, bots, name) {
    this.sim = new Sim({ seed: Math.floor(Math.random() * 2 ** 31), mode, botConfig: bots, humans: [{ id: 'me', name }] });
    this.onMsg(this.sim.startPacket('me'));
  }
  send(m) { if (m.t === 'in' && this.sim) this.sim.applyInput('me', m); }
  update(dt) {
    if (!this.sim) return;
    this.sim.step(dt);
    this.onMsg(this.sim.snapshotFor('me'));
    this.sim.clearEvents();
  }
  close() { this.sim = null; }
}
let conn = null;
let lobby = null;
let myClientId = null;
let paused = false;

function onMessage(m) {
  switch (m.t) {
    case 'welcome': myClientId = m.id; break;
    case 'lobby': onLobby(m); break;
    case 'start': startGame(m); break;
    case 's': if (game) onSnapshot(m); break;
    case 'err': $('netErr').textContent = m.msg; $('lobbyStatus').textContent = m.msg; break;
    case 'left': lobby = null; showScreen('menu'); break;
    case 'pong': pingMs = Math.round(performance.now() - m.at); break;
  }
}
function onClose() {
  if (game && conn && conn.online) endGameView();
  conn = null; lobby = null;
  $('netErr').textContent = 'Verbindung zum Server getrennt.';
  showScreen('menu');
}
async function connectOnline(then) {
  initAudio();
  $('netErr').textContent = '';
  const addr = $('serverInput').value.trim().replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '') || defaultServer;
  store.set('server', addr);
  store.set('name', playerName());
  if (conn) conn.close();
  try {
    conn = new NetConn(addr, onMessage, onClose);
    await conn.ready;
  } catch {
    conn = null;
    $('netErr').textContent = `Keine Verbindung zu ${addr}. Läuft dort ein Zerfallzone-Server?`;
    return;
  }
  conn.send({ t: 'hello', name: playerName() });
  then();
}
$('quickBtn').onclick = () => connectOnline(() => conn.send({ t: 'quick', mode: modeSel }));
$('createBtn').onclick = () => connectOnline(() => conn.send({ t: 'create', mode: modeSel, bots: botConfig }));
$('joinBtn').onclick = () => connectOnline(() => conn.send({ t: 'join', code: $('codeInput').value.trim().toUpperCase() }));
$('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('joinBtn').click(); });
$('playOffline').onclick = () => {
  initAudio();
  store.set('name', playerName());
  if (conn) conn.close();
  conn = new LocalConn(onMessage);
  conn.start(modeSel, botConfig, playerName());
};

// ---------------------------------------------------------------- Lobby
function onLobby(m) {
  lobby = m;
  if (game && m.state === 'lobby' && game.over) { endGameView(); }
  if (game) return; // während der Runde im Spiel bleiben
  showScreen('lobby');
  const isHost = m.host === myClientId;
  $('lobbyCode').textContent = m.code;
  $('lobbyShare').textContent = `Raum-Code teilen. Freunde verbinden sich mit Server ${$('serverInput').value.trim() || location.host} und treten mit dem Code bei.`
    + (m.isPublic ? ' Öffentlicher Raum (Schnellsuche).' : '');
  const size = MODES[m.mode].size;
  const pl = $('lobbyPlayers');
  pl.innerHTML = '';
  m.players.forEach((p, i) => {
    if (i % size === 0 && size > 1) {
      const h = document.createElement('div');
      h.className = 'teamhdr'; h.textContent = `Team ${i / size + 1}`;
      pl.appendChild(h);
    }
    const d = document.createElement('div');
    d.className = 'pl';
    d.innerHTML = `<span>${esc(p.name)}${p.id === myClientId ? ' (du)' : ''}</span><span class="muted">${p.id === m.host ? 'Host' : ''}${p.inGame ? ' · im Spiel' : ''}</span>`;
    pl.appendChild(d);
  });
  setChips($('lobbyModeChips'), m.mode, isHost, (mode) => conn.send({ t: 'settings', mode }));
  const cfg = { ...m.bots };
  renderBotCfg($('lobbyBotcfg'), $('lobbyBotTotal'), cfg, isHost, () => conn.send({ t: 'settings', bots: cfg }));
  $('lobbyPresets').classList.toggle('readonly', !isHost);
  $('lobbyPresets').querySelectorAll('button').forEach((b) => { b.onclick = () => conn.send({ t: 'settings', bots: PRESETS[b.dataset.preset] }); });
  $('lobbyBotTotal').textContent = `${totalBots(cfg)} Bots füllen auf · Teams à ${size}`;
  $('hostNote').textContent = isHost ? '(du bist Host)' : '(nur der Host kann ändern)';
  $('startBtn').disabled = !isHost || m.state !== 'lobby';
  $('lobbyStatus').textContent = m.state === 'play' ? 'Runde läuft – du bist in der nächsten dabei.'
    : m.autoStartIn ? `Start in ${m.autoStartIn} s` : isHost ? '' : 'Warte auf den Host …';
}
$('startBtn').onclick = () => conn && conn.send({ t: 'start' });
$('leaveBtn').onclick = () => { if (conn) { conn.send({ t: 'leave' }); conn.close(); conn = null; } lobby = null; showScreen('menu'); };

// ---------------------------------------------------------------- Spielzustand
let game = null;
let pingMs = 0;
const keys = {};
let pressed = new Set();
let mouseDown = false, rightDown = false, wheelSwap = false;
let yaw = 0, pitch = 0;

function clearGameScene() {
  if (!game) return;
  scene.remove(game.root);
  if (game.viewModel) camera.remove(game.viewModel);
}

function startGame(pkt) {
  clearGameScene();
  const world = generateWorld(pkt.seed);
  const root = new THREE.Group();
  scene.add(root);
  game = {
    pkt, world, root, you: pkt.you, mode: pkt.mode, teamCount: pkt.teamCount,
    meta: new Map(pkt.ents.map((e) => [e.id, e])), myTeam: pkt.ents.find((e) => e.id === pkt.you).team,
    decayAt: new Array(NS * NS).fill(-1), walls: [], wallMeshes: new Map(), boxMeshes: new Map(),
    ents: new Map(), lootMeshes: new Map(), snaps: [], last: null, me: null,
    pred: { pos: new THREE.Vector3(), vel: new THREE.Vector3(), ...MOVE_DEFAULTS }, landDip: 0, roll: 0,
    havePred: false, seq: 0, pending: [], camOffset: new THREE.Vector3(),
    tracers: [], booms: [], feed: [], over: null, eliminatedPlace: 0, mineMeshes: [], projMeshes: [], beaconMeshes: [], coreMesh: null,
    hitTimer: 0, vignette: 0, recoil: 0, viewModel: null, vmKey: '',
  };
  buildWorldMeshes(world, root);
  for (const l of pkt.loot) addLoot(l);
  for (const e of pkt.ents) if (e.id !== pkt.you) createEntityMesh(e);
  yaw = Math.random() * Math.PI * 2; pitch = -0.5;
  $('feed').innerHTML = '';
  $('corebar').classList.add('hidden');
  paused = false;
  showScreen(null);
  $('hud').classList.remove('hidden');
  pushFeed(MODES[pkt.mode].size > 1 ? `${MODES[pkt.mode].label}: Landung mit deinem Team!` : 'Landung! Sammle Waffen auf den Dächern.', 'me');
  canvas.requestPointerLock?.();
}

function buildWorldMeshes(world, root) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ color: 0x0c1024, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  root.add(ground);
  const grid = new THREE.GridHelper(400, 16, 0x2cf3ff, 0x1b2a55);
  grid.position.y = 0.02; grid.material.transparent = true; grid.material.opacity = 0.5;
  root.add(grid);
  for (const b of world.boxes) {
    const w = b.mx[0] - b.mn[0], h = b.mx[1] - b.mn[1], d = b.mx[2] - b.mn[2];
    const geo = new THREE.BoxGeometry(w, h, d);
    let mat;
    if (b.kind === 'crate') mat = crateMat;
    else {
      const tex = windowTex.clone();
      tex.repeat.set(Math.max(1, w / 8), Math.max(1, h / 8));
      tex.needsUpdate = true;
      mat = new THREE.MeshStandardMaterial({ color: 0x8090c0, map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.8 });
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((b.mn[0] + b.mx[0]) / 2, (b.mn[1] + b.mx[1]) / 2, (b.mn[2] + b.mx[2]) / 2);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: b.edge }));
    mesh.add(edges);
    root.add(mesh);
    game.boxMeshes.set(b.id, { mesh, edges, b, h0: h, decayed: false });
  }
  // Sprungfelder: blau = senkrecht, orange mit Pfeil = gerichtet auf ein Dach
  game.padMeshes = world.pads.map((p) => {
    const col = p.t ? 0xff9b2c : 0x2c8bff;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.15, 24), new THREE.MeshBasicMaterial({ color: col }));
    pad.position.set(p.x, 0.08, p.z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 8, 32), new THREE.MeshBasicMaterial({ color: p.t ? 0xffd34d : 0x8ff8ff }));
    ring.rotation.x = Math.PI / 2;
    pad.add(ring);
    if (p.t) {
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.0, 4), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
      arrow.position.y = 0.4;
      arrow.rotation.order = 'YXZ';
      arrow.rotation.y = Math.atan2(p.t[0] - p.x, p.t[2] - p.z);
      arrow.rotation.x = Math.PI / 2;
      pad.add(arrow);
    }
    root.add(pad);
    return ring;
  });
  // Seilbahnen: Masten auf den Dächern und leuchtendes Seil
  for (const z of world.ziplines) {
    const pts = [new THREE.Vector3(...z.p0), new THREE.Vector3(...z.p1)];
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffd34d }));
    root.add(line);
    const poles = [z.p0, z.p1].map((p) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 6), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
      pole.position.set(p[0], p[1] - 1.6, p[2]);
      root.add(pole);
      return pole;
    });
    game.zipMeshes = game.zipMeshes || [];
    game.zipMeshes.push({ z, line, poles });
  }
  // Aufwind-Säulen mit aufsteigenden Ringen
  game.updraftRings = [];
  for (const u of world.updrafts) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(u.r, u.r, u.h, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x8ff8ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
    col.position.set(u.x, u.h / 2, u.z);
    root.add(col);
    const base = new THREE.Mesh(new THREE.RingGeometry(u.r - 0.2, u.r, 32), new THREE.MeshBasicMaterial({ color: 0x8ff8ff, side: THREE.DoubleSide }));
    base.rotation.x = -Math.PI / 2; base.position.set(u.x, 0.05, u.z);
    root.add(base);
    for (let k = 0; k < 6; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(u.r * 0.9, 0.05, 6, 24), new THREE.MeshBasicMaterial({ color: 0xbffcff, transparent: true, opacity: 0.6 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(u.x, 0, u.z);
      root.add(ring);
      game.updraftRings.push({ ring, u, off: k / 6 });
    }
  }
  game.ropes = new Map();
  game.columns = [];
  for (let i = 0; i < NS * NS; i++) {
    const c = { x: -HALF + (i % NS) * SECTOR + SECTOR / 2, z: -HALF + Math.floor(i / NS) * SECTOR + SECTOR / 2 };
    const col = new THREE.Mesh(new THREE.BoxGeometry(SECTOR, 160, SECTOR),
      new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    col.position.set(c.x, 80, c.z);
    col.visible = false;
    root.add(col);
    game.columns.push(col);
  }
}

// Figuren
const bodyGeo = new THREE.CylinderGeometry(0.38, 0.45, 1.25, 12);
const headGeo = new THREE.SphereGeometry(0.3, 12, 10);
const visorGeo = new THREE.BoxGeometry(0.42, 0.12, 0.2);
const outlineGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.9, 10);
const markerGeo = new THREE.OctahedronGeometry(0.22);
function nameSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 48;
  const g = c.getContext('2d');
  g.font = 'bold 26px Segoe UI, sans-serif';
  g.textAlign = 'center';
  g.fillStyle = '#05060daa';
  const w = Math.min(250, g.measureText(text).width + 20);
  g.fillRect(128 - w / 2, 6, w, 36);
  g.fillStyle = hex(color);
  g.fillText(text, 128, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(2.4, 0.45, 1);
  s.renderOrder = 20;
  return s;
}
function createEntityMesh(meta) {
  const mate = meta.team === game.myTeam;
  const teamCol = TEAM_COLORS[meta.team % TEAM_COLORS.length];
  const accent = mate ? 0x7dff6b : meta.bot ? DIFFS[meta.diff].color : 0xffffff;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1c2240, emissive: teamCol, emissiveIntensity: 0.35, transparent: true });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.95;
  const headMat = new THREE.MeshStandardMaterial({ color: 0x2a3155, transparent: true });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.62;
  const visor = new THREE.Mesh(visorGeo, new THREE.MeshBasicMaterial({ color: accent, transparent: true }));
  visor.position.set(0, 1.64, -0.22);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.6), new THREE.MeshBasicMaterial({ color: 0x8ff8ff }));
  gun.position.set(0.35, 1.15, -0.35);
  const outline = new THREE.Mesh(outlineGeo, new THREE.MeshBasicMaterial({ color: mate ? 0x7dff6b : 0xff3355, transparent: true, opacity: 0.45, depthTest: false }));
  outline.position.y = 0.95; outline.visible = false; outline.renderOrder = 10;
  g.add(body, head, visor, gun, outline);
  let tag = null;
  if (mate) {
    const marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0x7dff6b, depthTest: false }));
    marker.position.y = 2.35; marker.renderOrder = 20;
    tag = nameSprite(meta.name, 0x7dff6b);
    tag.position.y = 2.85;
    g.add(marker, tag);
  }
  game.root.add(g);
  game.ents.set(meta.id, { g, body, outline, mats: [bodyMat, headMat, visor.material], mate, meta, gun });
}

// Beute
const lootGeos = {
  weapon: new THREE.BoxGeometry(0.9, 0.3, 0.3), ability: new THREE.OctahedronGeometry(0.4),
  health: new THREE.BoxGeometry(0.5, 0.5, 0.5), armor: new THREE.IcosahedronGeometry(0.35),
};
function addLoot([id, type, wid, level, x, base, z]) {
  const color = type === 'weapon' ? WEAPONS[wid].color : type === 'ability' ? 0xb06cff : type === 'health' ? 0x3dff9a : 0x2c8bff;
  const m = new THREE.Mesh(lootGeos[type], new THREE.MeshBasicMaterial({ color }));
  m.position.set(x, base, z);
  if (type === 'weapon' && level > 1) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
    ring.rotation.x = Math.PI / 2; m.add(ring);
  }
  game.root.add(m);
  game.lootMeshes.set(id, { m, type, wid, level, x, base, z, phase: Math.random() * 6 });
}
function removeLoot(id) {
  const l = game.lootMeshes.get(id);
  if (l) { game.root.remove(l.m); game.lootMeshes.delete(id); }
}

// Waffe in der Hand
function updateViewModel(me) {
  const w = me && !me.ghost && me.weapons[me.cur];
  const key = w ? `${w[0]}:${w[1]}` : '';
  if (key === game.vmKey) return;
  game.vmKey = key;
  if (game.viewModel) camera.remove(game.viewModel);
  game.viewModel = null;
  if (!w) return;
  const W = WEAPONS[w[0]];
  const vm = new THREE.Group();
  const len = W.len || (w[0] === 'funke' ? 0.5 : 0.7);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, len), new THREE.MeshStandardMaterial({ color: 0x1c2240, emissive: W.color, emissiveIntensity: 0.25 }));
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, len * 0.9), new THREE.MeshBasicMaterial({ color: W.color }));
  strip.position.set(0.055, 0.03, 0);
  vm.add(body, strip);
  for (let i = 1; i < w[1]; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 16), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
    r.position.z = -len / 2 + i * 0.08; vm.add(r);
  }
  vm.position.set(0.26, -0.24, -0.45 - len / 2);
  vm.userData.z = vm.position.z;
  camera.add(vm);
  game.viewModel = vm;
}

// ---------------------------------------------------------------- Snapshots
function onSnapshot(s) {
  const G = game;
  s.recv = performance.now();
  G.snaps.push(s);
  while (G.snaps.length > 30) G.snaps.shift();
  G.last = s;
  // Ereignisse
  for (const f of s.fx) handleFx(f, s);
  // Welt: Wände, Zerfall
  G.walls = s.walls.map((w) => ({ mn: [w[0], w[2], w[4]], mx: [w[1], w[3], w[5]], gone: false }));
  applyDissolve(G.world, G.decayAt, s.time);
  // Eigener Zustand und Abgleich der Vorhersage
  if (s.me) {
    G.me = s.me;
    const P = G.pred;
    const before = P.pos.clone();
    P.pos.set(s.me.x, s.me.y, s.me.z);
    P.vel.set(s.me.vx, s.me.vy, s.me.vz);
    for (const f of MOVE_FIELDS) P[f] = s.me.m[f] ?? MOVE_DEFAULTS[f];
    G.pending = G.pending.filter((i) => i.seq > s.me.seq);
    const ctx = predCtx();
    if (s.me.alive || s.me.ghost) for (const inp of G.pending) movePlayer(P, inp, inp.dt, ctx);
    P.wallBox = null;
    if (G.havePred) {
      const diff = before.sub(P.pos);
      if (diff.length() < 3) G.camOffset.add(diff); else G.camOffset.set(0, 0, 0);
    }
    G.havePred = true;
    updateViewModel(s.me);
  }
  if (s.over && !G.over) onOver(s.over);
}
function predCtx() {
  const s = game.last;
  return {
    boxes: game.world.boxes.concat(game.walls), pads: game.world.pads, ziplines: game.world.ziplines, updrafts: game.world.updrafts,
    gravMul: s && s.ev && s.ev.id === 'schwerelos' ? 0.45 : 1, speedMul: s && s.ev && s.ev.id === 'turbo' ? 1.35 : 1,
  };
}
function handleFx(f, s) {
  const G = game;
  switch (f.k) {
    case 'shot': {
      const mine = f.id === G.you;
      const from = mine ? camera.localToWorld(new THREE.Vector3(0.26, -0.22, -0.8)) : new THREE.Vector3(...f.from);
      const col = WEAPONS[f.w].color;
      for (const t of f.tos) {
        const to = new THREE.Vector3(t[0], t[1], t[2]);
        addTracer(from, to, col);
        if (t[3] >= 0) addSpark(to, t[3] ? 0xff3355 : col);
      }
      if (mine) { rumble(0.25, f.w === 'hagel' || f.w === 'lanze' || f.w === 'moerser' ? 0.6 : 0.1, 60); G.recoil = 1; pitch = Math.min(1.5, pitch + (f.w === 'lanze' ? 0.03 : f.w === 'hagel' || f.w === 'moerser' ? 0.04 : f.w === 'dorn' ? 0.015 : 0.006)); }
      const dist = mine ? 0 : G.pred.pos.distanceTo(new THREE.Vector3(...f.from));
      sfxShot(f.w, mine ? 1 : clamp(1 - dist / 120, 0, 0.6));
      break;
    }
    case 'hit': hitmarker(f.head); break;
    case 'dmg': G.vignette = Math.min(1, G.vignette + f.a / 30); rumble(0.4, Math.min(1, f.a / 25), 140); break;
    case 'boom': {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: f.c, transparent: true, opacity: 0.7, depthWrite: false }));
      m.position.set(...f.p);
      G.root.add(m);
      G.booms.push({ m, life: 0.35, r: f.r });
      sfxShot('boom', clamp(1 - G.pred.pos.distanceTo(m.position) / 120, 0.05, 1));
      break;
    }
    case 'kill': {
      const cls = f.at === G.myTeam ? 'me' : f.bt === G.myTeam ? 'team' : '';
      pushFeed(`${f.a} ✕ ${f.b}`, cls);
      break;
    }
    case 'msg': pushFeed(f.text, 'me'); break;
    case 'revive':
      if (f.team === G.myTeam) { pushFeed(`${f.name} ist zurück!`, 'team'); playSnd('revive'); }
      break;
    case 'teamout':
      if (f.team === G.myTeam && !G.over) {
        G.eliminatedPlace = f.place;
        pushFeed(`Dein Team ist raus – Platz ${f.place}`, 'me');
        showResult(false, f.place);
      } else if (MODES[G.mode].size > 1) pushFeed(`Team ${f.team + 1} ist raus (Platz ${f.place})`);
      break;
    case 'l+': addLoot(f.it); break;
    case 'l-': removeLoot(f.id); break;
    case 'lb': { const l = G.lootMeshes.get(f.id); if (l) l.base = f.base; break; }
    case 'decay': for (const i of f.s) G.decayAt[i] = f.t; break;
    case 'snd': playSnd(f.s); break;
    case 'over': break;
  }
}
function onOver(over) {
  game.over = over;
  const won = over.winner === game.myTeam;
  const place = over.placements[game.myTeam] || game.eliminatedPlace;
  showResult(won, place);
}
function showResult(won, place) {
  const G = game;
  document.exitPointerLock?.();
  const me = G.me;
  $('ovTitle').textContent = won ? '🏆 Sieg!' : 'Ausgeschieden';
  $('ovText').textContent = `${won ? 'Dein Team hat gewonnen' : `Platz ${place} von ${G.teamCount}`} · ${me ? me.kills : 0} Kills · ${fmt(G.last ? G.last.time : 0)}`;
  $('ovResume').textContent = G.over ? (conn && conn.online ? 'Zur Lobby' : 'Neue Runde') : 'Zuschauen';
  $('ovQuit').textContent = 'Zum Menü';
  showScreen('overlay');
  $('hud').classList.remove('hidden');
}
$('ovResume').onclick = () => {
  if (!game) { showScreen('menu'); return; }
  if (game.over) {
    if (conn && conn.online) { endGameView(); if (lobby) onLobby(lobby); else showScreen('menu'); }
    else { endGameView(); $('playOffline').click(); }
    return;
  }
  paused = false;
  showScreen(null);
  canvas.requestPointerLock?.();
};
$('ovQuit').onclick = () => {
  if (conn) { if (conn.online) conn.send({ t: 'leave' }); conn.close(); conn = null; }
  endGameView();
  lobby = null;
  showScreen('menu');
};
function endGameView() {
  if (wind) wind.g.gain.setTargetAtTime(0, actx.currentTime, 0.05);
  clearGameScene();
  game = null;
  document.body.classList.remove('ghostmode', 'cloaked', 'shielded');
  $('hud').classList.add('hidden');
}

// ---------------------------------------------------------------- Effekte
function addTracer(from, to, color) {
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  game.root.add(line);
  game.tracers.push({ line, life: 0.09 });
}
const sparkGeo = new THREE.SphereGeometry(0.12, 6, 6);
function addSpark(p, color) {
  const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
  m.position.copy(p);
  game.root.add(m);
  game.tracers.push({ spark: m, life: 0.25 });
}
function updateFx(dt) {
  const G = game;
  for (let i = G.tracers.length - 1; i >= 0; i--) {
    const t = G.tracers[i];
    t.life -= dt;
    if (t.line) t.line.material.opacity = Math.max(0, t.life / 0.09);
    if (t.spark) { t.spark.scale.setScalar(1 + (0.25 - t.life) * 8); t.spark.material.opacity = Math.max(0, t.life / 0.25); }
    if (t.life <= 0) {
      const o = t.line || t.spark;
      G.root.remove(o); o.material.dispose(); if (t.line) o.geometry.dispose();
      G.tracers.splice(i, 1);
    }
  }
  for (let i = G.booms.length - 1; i >= 0; i--) {
    const b = G.booms[i];
    b.life -= dt;
    b.m.scale.setScalar(b.r * (1 - b.life / 0.35) + 0.3);
    b.m.material.opacity = Math.max(0, b.life / 0.35 * 0.7);
    if (b.life <= 0) { G.root.remove(b.m); b.m.material.dispose(); G.booms.splice(i, 1); }
  }
}
function pushFeed(text, cls = '') {
  const div = document.createElement('div');
  div.textContent = text;
  if (cls) div.className = cls;
  $('feed').prepend(div);
  while ($('feed').children.length > 7) $('feed').lastChild.remove();
}
function hitmarker(head) {
  const h = $('hitmarker');
  h.classList.add('on'); h.classList.toggle('head', head);
  game.hitTimer = 0.08;
  tone(head ? 1800 : 1200, head ? 1600 : 1000, 0.05, 0.08, 'square');
}

// ---------------------------------------------------------------- Welt aktualisieren
function syncWorld(dt) {
  const G = game, s = G.last;
  if (!s) return;
  const t = performance.now() / 1000;
  // Gebäude: Zerfall
  for (const bm of G.boxMeshes.values()) {
    const b = bm.b;
    if (b.kind === 'crate') continue;
    const st = s.sectors[b.sector];
    if (st === '2' && !bm.decayed) { bm.decayed = true; if (bm.mesh.material.emissiveIntensity !== undefined) bm.mesh.material.emissiveIntensity = 0.12; bm.edges.material.color.set(0xff2040); }
    if (b.gone) { if (bm.mesh.parent) G.root.remove(bm.mesh); continue; }
    if (bm.decayed) {
      const h = b.mx[1] - b.mn[1];
      bm.mesh.scale.y = Math.max(0.001, h / bm.h0);
      bm.mesh.position.y = b.mn[1] + h / 2;
      bm.mesh.visible = !b.flicker || Math.random() > 0.15;
    }
  }
  // Sektorsäulen
  for (let i = 0; i < NS * NS; i++) {
    const st = s.sectors[i], col = G.columns[i];
    col.visible = st !== '0';
    if (st === '1') { col.material.color.set(0xff9b2c); col.material.opacity = 0.06 + 0.06 * Math.sin(t * 6); }
    if (st === '2') { col.material.color.set(0xff2040); col.material.opacity = 0.16; }
  }
  // Wände
  const seen = new Set();
  for (const w of s.walls) {
    const key = w.join(',');
    seen.add(key);
    if (!G.wallMeshes.has(key)) {
      const geo = new THREE.BoxGeometry(w[1] - w[0], w[3] - w[2], w[5] - w[4]);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xb06cff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xd9b8ff })));
      m.position.set((w[0] + w[1]) / 2, (w[2] + w[3]) / 2, (w[4] + w[5]) / 2);
      G.root.add(m);
      G.wallMeshes.set(key, m);
    }
  }
  for (const [k, m] of G.wallMeshes) if (!seen.has(k)) { G.root.remove(m); G.wallMeshes.delete(k); }
  // Minen und Projektile
  syncList(G.mineMeshes, s.mines, () => new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.15, 12), new THREE.MeshBasicMaterial({ color: 0xff3355 })),
    (m, d) => { m.position.set(d[0], d[1] + 0.08, d[2]); m.material.color.set(d[3] ? 0x7dff6b : Math.sin(t * 10) > 0 ? 0xff3355 : 0x330008); });
  syncList(G.projMeshes, s.proj, () => new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff5c2c })),
    (m, d) => m.position.set(d[0], d[1], d[2]));
  // Rückkehrsäulen (Solo-Geist)
  const beacons = s.me && s.me.ghost ? s.me.beacons : [];
  syncList(G.beaconMeshes, beacons, () => {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 200, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x3dff9a, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 100;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.12, 8, 32), new THREE.MeshBasicMaterial({ color: 0x3dff9a }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.2;
    g.add(beam, ring);
    return g;
  }, (m, d) => m.position.set(d[0], 0, d[1]));
  // Kern
  if (s.core && !G.coreMesh) {
    const g = new THREE.Group();
    const spin = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 1), new THREE.MeshBasicMaterial({ color: 0xffd34d, wireframe: true }));
    const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 300, 8), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.35 }));
    beam.position.y = 150;
    const zone = new THREE.Mesh(new THREE.RingGeometry(4.6, 5, 48), new THREE.MeshBasicMaterial({ color: 0xffd34d, side: THREE.DoubleSide }));
    zone.rotation.x = -Math.PI / 2; zone.position.y = -1.45;
    g.add(spin, inner, beam, zone);
    g.position.set(s.core.x, 1.5, s.core.z);
    G.root.add(g);
    G.coreMesh = g; G.coreSpin = spin;
  }
  if (G.coreSpin) { G.coreSpin.rotation.y += dt; G.coreSpin.rotation.x += dt * 0.5; }
  // Beute schweben lassen
  for (const l of G.lootMeshes.values()) {
    l.m.rotation.y += dt * 1.5;
    l.m.position.y = l.base + Math.sin(t * 2 + l.phase) * 0.15;
  }
  for (const r of G.padMeshes) r.position.y = 0.1 + ((t * 1.5) % 1) * 1.5;
  for (const r of G.updraftRings) {
    const f = (t * 0.25 + r.off) % 1;
    r.ring.position.y = f * r.u.h;
    r.ring.material.opacity = 0.6 * (1 - f);
  }
  // Seilbahnen über zerfallenen Gebäuden verschwinden
  for (const zm of G.zipMeshes || []) {
    const alive = !zm.z.a.gone && !zm.z.b.gone && zm.z.a.mx[1] > zm.z.ha - 0.3 && zm.z.b.mx[1] > zm.z.hb - 0.3;
    zm.line.visible = alive; zm.poles.forEach((p) => { p.visible = alive; });
  }
  // Enterhaken-Seile: eigenes aus der Vorhersage, andere aus dem Snapshot
  const ropes = [];
  if (G.pred.grT > 0) ropes.push(['me', camera.localToWorld(new THREE.Vector3(0.2, -0.3, -0.5)), new THREE.Vector3(G.pred.grX, G.pred.grY, G.pred.grZ)]);
  for (const e of s.ents) if (e[0] !== G.you && e[10] && (e[7] & 1)) ropes.push([e[0], new THREE.Vector3(e[1], e[2] + 1.3, e[3]), new THREE.Vector3(...e[10])]);
  const seenR = new Set();
  for (const [id, a, b] of ropes) {
    seenR.add(id);
    let l = G.ropes.get(id);
    if (!l) { l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0xb06cff })); G.root.add(l); G.ropes.set(id, l); }
    else l.geometry.setFromPoints([a, b]);
  }
  for (const [id, l] of G.ropes) if (!seenR.has(id)) { G.root.remove(l); l.geometry.dispose(); G.ropes.delete(id); }
}
function syncList(meshes, data, make, update) {
  while (meshes.length < data.length) { const m = make(); game.root.add(m); meshes.push(m); }
  while (meshes.length > data.length) game.root.remove(meshes.pop());
  data.forEach((d, i) => update(meshes[i], d));
}

// Andere Spieler zwischen Snapshots interpolieren
function renderEntities() {
  const G = game;
  const delay = conn && conn.online ? 110 : 0;
  const rt = performance.now() - delay;
  let a = null, b = null;
  for (let i = G.snaps.length - 1; i >= 0; i--) {
    if (G.snaps[i].recv <= rt) { a = G.snaps[i]; b = G.snaps[i + 1] || a; break; }
  }
  if (!a) { a = b = G.snaps[0]; }
  if (!a) return;
  const f = b === a ? 0 : clamp((rt - a.recv) / (b.recv - a.recv), 0, 1);
  const mapB = new Map(b.ents.map((e) => [e[0], e]));
  for (const ea of a.ents) {
    const v = G.ents.get(ea[0]);
    if (!v) continue;
    const eb = mapB.get(ea[0]) || ea;
    const flags = eb[7];
    const alive = flags & 1, ghost = flags & 2, cloak = flags & 4, revealed = flags & 16;
    const show = alive || (ghost && v.mate);
    v.g.visible = !!show;
    if (!show) continue;
    v.g.position.set(ea[1] + (eb[1] - ea[1]) * f, ea[2] + (eb[2] - ea[2]) * f, ea[3] + (eb[3] - ea[3]) * f);
    let dy = eb[4] - ea[4];
    if (dy > Math.PI) dy -= 2 * Math.PI; else if (dy < -Math.PI) dy += 2 * Math.PI;
    v.g.rotation.y = ea[4] + dy * f;
    const op = ghost ? 0.25 : cloak ? (v.mate ? 0.35 : 0.06) : 1;
    for (const m of v.mats) m.opacity = op;
    v.gun.visible = !ghost && !(cloak && !v.mate);
    v.outline.visible = !!(revealed && !v.mate);
  }
}

// ---------------------------------------------------------------- Controller (Gamepad-API)
// Standard-Belegung (Xbox / PlayStation): A/✕ Sprung · B/○ Rutschen · X/□ Aufheben, sonst Nachladen · Y/△ Waffe wechseln
// LB/L1 Fähigkeit 1 · RB/R1 Fähigkeit 2 · LT/L2 Zielen · RT/R2 Schießen · L3 Sprinten · Start/Options Menü
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const pad = { active: false, prev: [], sprint: false, navCd: 0, gp: null };
addEventListener('gamepadconnected', (e) => {
  pad.active = true;
  if (game) pushFeed(`Controller verbunden: ${e.gamepad.id.split('(')[0].trim()}`, 'me');
  else $('netErr').textContent = 'Controller verbunden – Steuerkreuz und A zum Auswählen.';
});
addEventListener('gamepaddisconnected', () => { pad.active = false; pad.gp = null; });
function readPad(dt) {
  const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find((g) => g && g.connected);
  pad.gp = gp || null;
  if (!gp) return null;
  const now = gp.buttons.map((b) => !!b && (b.pressed || b.value > 0.5));
  const prev = pad.prev;
  pad.prev = now;
  const dz = (v, d) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));
  const P = {
    now, edge: (i) => now[i] && !prev[i],
    lx: dz(gp.axes[0] || 0, 0.18), ly: dz(gp.axes[1] || 0, 0.18), rx: dz(gp.axes[2] || 0, 0.12), ry: dz(gp.axes[3] || 0, 0.12),
  };
  if (now.some(Boolean) || Math.hypot(P.lx, P.ly, P.rx, P.ry) > 0) pad.active = true;
  pad.navCd = Math.max(0, pad.navCd - dt);
  return P;
}
function rumble(weak, strong, ms) {
  const a = pad.active && pad.gp && pad.gp.vibrationActuator;
  if (a && a.playEffect) a.playEffect('dual-rumble', { duration: ms, weakMagnitude: weak, strongMagnitude: strong }).catch(() => {});
}
/** Steuerung der Menüs mit dem Controller: Steuerkreuz/Stick bewegt den Fokus, A klickt, B geht zurück */
function padMenus(P) {
  const screen = ['overlay', 'lobby', 'menu'].map($).find((el) => !el.classList.contains('hidden'));
  if (!screen) return;
  const items = [...screen.querySelectorAll('button:not(:disabled), input, summary')].filter((el) => el.offsetParent !== null && !el.closest('.readonly'));
  if (!items.length) return;
  let i = items.indexOf(document.activeElement);
  const dir = P.edge(BTN.DOWN) || P.edge(BTN.RIGHT) || (pad.navCd <= 0 && (P.ly > 0.6 || P.lx > 0.6)) ? 1
    : P.edge(BTN.UP) || P.edge(BTN.LEFT) || (pad.navCd <= 0 && (P.ly < -0.6 || P.lx < -0.6)) ? -1 : 0;
  if (dir) { pad.navCd = 0.22; i = i < 0 ? 0 : (i + dir + items.length) % items.length; items[i].focus(); }
  if (P.edge(BTN.A) && i >= 0) { initAudio(); items[i].click(); }
  if (P.edge(BTN.B) && screen.id === 'overlay' && game && !game.over && !game.eliminatedPlace) $('ovResume').click();
}
/** leichte Zielhilfe: Blick wird langsamer, wenn ein Gegner nahe am Fadenkreuz ist */
function aimAssistFactor() {
  const G = game;
  if (!G || !G.last) return 1;
  const dir = aimDir(yaw, pitch);
  const cp = camera.position;
  for (const e of G.last.ents) {
    if (e[0] === G.you || !(e[7] & 1) || G.meta.get(e[0]).team === G.myTeam || (e[7] & 4)) continue;
    const dx = e[1] - cp.x, dy = e[2] + 1.1 - cp.y, dz = e[3] - cp.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > 90 || d < 0.5) continue;
    if ((dx * dir.x + dy * dir.y + dz * dir.z) / d > Math.cos(Math.max(0.035, 1.2 / d))) return 0.5;
  }
  return 1;
}
const keyLabel = (k) => (pad.active ? { F: 'X', Q: 'LB', E: 'RB' }[k] || k : k);

// ---------------------------------------------------------------- Eingabe & Vorhersage
function sendInput(dt, P) {
  const G = game;
  if (!G || !G.me) return null;
  const locked = document.pointerLockElement === canvas || pad.active || !conn.online && !paused;
  const k = (c) => (locked && !paused ? !!keys[c] : false);
  const inp = {
    t: 'in', seq: ++G.seq, dt, yaw, pitch,
    f: k('KeyW'), b: k('KeyS'), l: k('KeyA'), r: k('KeyD'),
    jump: pressed.has('Space'), jumpHeld: k('Space'), sprint: k('ShiftLeft') || k('ShiftRight'), slide: k('ControlLeft') || k('KeyC'),
    dash: pressed.has('KeyV') || pressed.has('Mouse3') || pressed.has('Mouse4'),
    fire: locked && !paused && mouseDown, aim: locked && !paused && rightDown, reload: k('KeyR'),
    use: pressed.has('KeyF'), useHeld: k('KeyF'), q: pressed.has('KeyQ'), e: pressed.has('KeyE'),
    w1: pressed.has('Digit1'), w2: pressed.has('Digit2'), swap: wheelSwap,
  };
  pressed = new Set();
  wheelSwap = false;
  if (P && !paused && $('overlay').classList.contains('hidden')) {
    const zoomed = P.now[BTN.LT] && G.me.weapons[G.me.cur] && WEAPONS[G.me.weapons[G.me.cur][0]].zoom;
    const curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.6);
    const s = 3.2 * sens * dt * (zoomed ? 0.35 : P.now[BTN.LT] ? 0.6 : 1) * aimAssistFactor();
    yaw -= curve(P.rx) * s;
    pitch = clamp(pitch - curve(P.ry) * s * 0.75, -1.5, 1.5);
    inp.yaw = yaw; inp.pitch = pitch;
    inp.ax = +P.lx.toFixed(3); inp.az = +(-P.ly).toFixed(3);
    if (P.edge(BTN.L3)) pad.sprint = !pad.sprint;
    if (-P.ly < 0.3) pad.sprint = false;
    // B: tippen = Dash, halten = Rutschen am Boden / schnell fallen in der Luft
    pad.bHeld = P.now[BTN.B] ? (pad.bHeld || 0) + dt : 0;
    inp.dash ||= P.edge(BTN.B);
    // automatisch sprinten, wenn der Stick ganz nach vorn gedrückt ist
    const autoSprint = -P.ly > 0.85 && Math.abs(P.lx) < 0.55;
    const nearSomething = !!G.nearLoot || (G.me.ghost && G.me.nearBeacon);
    inp.jump ||= P.edge(BTN.A); inp.jumpHeld ||= P.now[BTN.A];
    inp.slide ||= pad.bHeld > 0.14; inp.sprint ||= pad.sprint || autoSprint;
    G.padSprint = pad.sprint || autoSprint;
    inp.fire ||= P.now[BTN.RT]; inp.aim ||= P.now[BTN.LT];
    inp.use ||= P.edge(BTN.X) && nearSomething; inp.useHeld ||= P.now[BTN.X];
    inp.reload ||= P.edge(BTN.X) && !nearSomething;
    inp.q ||= P.edge(BTN.LB); inp.e ||= P.edge(BTN.RB); inp.swap ||= P.edge(BTN.Y);
    G.padAim = P.now[BTN.LT];
  } else G.padAim = false;
  if (paused && !conn.online) return null;
  // eigene Bewegung sofort vorhersagen
  if (G.me.alive || G.me.ghost) {
    const before = G.pred.dashN;
    const out = movePlayer(G.pred, inp, dt, predCtx());
    G.pred.wallBox = null;
    if (out.dj) playSnd('dj');
    if (out.dash) { playSnd('dash'); rumble(0.5, 0.2, 90); }
    else if (inp.dash && before === 0 && !G.me.ghost) playSnd('nodash');
    if (out.wallrun) { playSnd('wallrun'); rumble(0.2, 0, 120); }
    if (out.walljump) playSnd('walljump');
    if (out.mantle) playSnd('mantle');
    if (out.slide) rumble(0.3, 0.1, 150);
    if (out.zipon) { playSnd('zipon'); rumble(0.3, 0.1, 120); }
    if (out.zipoff) playSnd('zipoff');
    if (out.hang) playSnd('hang');
    if (out.updraft && !G.inUpdraft) playSnd('updraft');
    G.inUpdraft = !!out.updraft;
    if (out.zipping) rumble(0.08, 0, 40);
    if (out.land) { G.landDip = Math.min(0.45, out.land / 70); playSnd('land'); rumble(0, Math.min(0.8, out.land / 40), 100); }
  }
  G.pending.push(inp);
  if (G.pending.length > 120) G.pending.shift();
  conn.send(inp);
  return inp;
}

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  keys[e.code] = true;
  if (!e.repeat) pressed.add(e.code);
  if (game && ['Space', 'Tab'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('click', () => { if (game && !paused) canvas.requestPointerLock?.(); });
document.addEventListener('mousemove', (e) => {
  if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) pad.active = false;
  if (document.pointerLockElement !== canvas || !game) return;
  const zoomed = rightDown && game.me && game.me.weapons[game.me.cur] && WEAPONS[game.me.weapons[game.me.cur][0]].zoom;
  const s = 0.0022 * sens * (zoomed ? 0.4 : 1);
  yaw -= e.movementX * s;
  pitch = clamp(pitch - e.movementY * s, -1.5, 1.5);
});
document.addEventListener('mousedown', (e) => {
  if (!game || document.pointerLockElement !== canvas) return;
  if (e.button === 0) mouseDown = true;
  if (e.button === 2) rightDown = true;
  if (e.button === 3 || e.button === 4) pressed.add('Mouse' + e.button);
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) rightDown = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('wheel', () => { if (game) wheelSwap = true; });
document.addEventListener('pointerlockchange', () => {
  if (!game) return;
  if (document.pointerLockElement !== canvas) {
    mouseDown = false; rightDown = false;
    if (pad.active) return; // mit Controller weiterspielen
    if (!$('overlay').classList.contains('hidden')) return;
    if (game.over || game.eliminatedPlace) return;
    paused = !conn.online;
    $('ovTitle').textContent = conn.online ? 'Menü (Runde läuft weiter)' : 'Pause';
    $('ovText').textContent = '';
    $('ovResume').textContent = 'Weiter';
    showScreen('overlay');
    $('hud').classList.remove('hidden');
  }
});

// ---------------------------------------------------------------- HUD
const mm = $('minimap').getContext('2d');
function drawMinimap(s) {
  const G = game, S = 200 / (HALF * 2), t = performance.now() / 1000;
  mm.clearRect(0, 0, 200, 200);
  for (let i = 0; i < NS * NS; i++) {
    const sx = (i % NS) * SECTOR * S, sz = Math.floor(i / NS) * SECTOR * S;
    const st = s.sectors[i];
    mm.fillStyle = st === '2' ? '#ff204066' : st === '1' ? (Math.sin(t * 6) > 0 ? '#ff9b2c66' : '#ff9b2c33') : '#2cf3ff10';
    mm.fillRect(sx, sz, SECTOR * S, SECTOR * S);
    mm.strokeStyle = '#2cf3ff22';
    mm.strokeRect(sx, sz, SECTOR * S, SECTOR * S);
  }
  mm.fillStyle = '#9fb4d055';
  for (const b of G.world.boxes) {
    if (b.gone || b.kind !== 'building') continue;
    mm.fillRect((b.mn[0] + HALF) * S, (b.mn[2] + HALF) * S, (b.mx[0] - b.mn[0]) * S, (b.mx[2] - b.mn[2]) * S);
  }
  if (s.me && s.me.ghost) for (const b of s.me.beacons) { mm.fillStyle = '#3dff9a'; mm.beginPath(); mm.arc((b[0] + HALF) * S, (b[1] + HALF) * S, 5, 0, 7); mm.fill(); }
  if (s.core) { mm.fillStyle = '#ffd34d'; mm.beginPath(); mm.arc((s.core.x + HALF) * S, (s.core.z + HALF) * S, 5, 0, 7); mm.fill(); }
  for (const e of s.ents) {
    if (e[0] === G.you) continue;
    const meta = G.meta.get(e[0]);
    const mate = meta.team === G.myTeam;
    if (mate && (e[7] & 3)) { mm.fillStyle = e[7] & 1 ? '#7dff6b' : '#7dff6b66'; mm.beginPath(); mm.arc((e[1] + HALF) * S, (e[3] + HALF) * S, 3.5, 0, 7); mm.fill(); }
    else if (!mate && (e[7] & 1) && (e[7] & 16)) { mm.fillStyle = '#ff3355'; mm.fillRect((e[1] + HALF) * S - 2, (e[3] + HALF) * S - 2, 4, 4); }
  }
  const px = (G.pred.pos.x + HALF) * S, pz = (G.pred.pos.z + HALF) * S;
  mm.save(); mm.translate(px, pz); mm.rotate(-yaw);
  mm.fillStyle = '#ffffff';
  mm.beginPath(); mm.moveTo(0, -6); mm.lineTo(4, 5); mm.lineTo(-4, 5); mm.closePath(); mm.fill();
  mm.restore();
}
let hudCd = 0;
function updateHud(dt) {
  const G = game, s = G.last, me = G.me;
  if (!s || !me) return;
  G.hitTimer -= dt;
  if (G.hitTimer <= 0) $('hitmarker').classList.remove('on');
  G.vignette = Math.max(0, G.vignette - dt * 1.5);
  const lowHp = me.alive && me.hp < 30 ? 0.35 + 0.15 * Math.sin(performance.now() / 200) : 0;
  const inDecay = me.alive && s.sectors[sectorOf(G.pred.pos.x, G.pred.pos.z)] === '2' ? 0.5 : 0;
  $('vignette').style.opacity = Math.max(G.vignette, lowHp, inDecay);
  document.body.classList.toggle('ghostmode', !!me.ghost);
  document.body.classList.toggle('cloaked', !!me.cloak);
  document.body.classList.toggle('shielded', !!me.shield);

  hudCd -= dt;
  if (hudCd > 0) return;
  hudCd = 0.1;
  $('hpBar').style.width = `${me.hp}%`;
  $('armorBar').style.width = `${me.armor}%`;
  $('vitalsText').textContent = `HP ${me.hp} · Rüstung ${me.armor}`;
  const Pd = G.pred;
  let pips = '';
  for (let i = 0; i < DASH_MAX; i++) {
    const fill = i < Pd.dashN ? 1 : i === Pd.dashN ? Pd.dashRegen / DASH_REGEN : 0;
    pips += `<span class="pip" style="--f:${Math.round(fill * 100)}%"></span>`;
  }
  $('dash').innerHTML = me.ghost ? '' : pips;
  const aliveCount = s.ents.filter((e) => e[7] & 1).length;
  $('alive').textContent = aliveCount;
  const teamsAlive = new Set(s.ents.filter((e) => e[7] & 1).map((e) => G.meta.get(e[0]).team)).size;
  $('teamsLeft').textContent = MODES[G.mode].size > 1 ? ` · ${teamsAlive} Teams` : '';
  $('kills').textContent = me.kills;
  $('ping').textContent = conn.online ? `${pingMs} ms` : 'offline';

  const ph = $('phase');
  if (s.core) { $('phaseTitle').textContent = 'Finale'; $('phaseTimer').textContent = 'Kern halten'; ph.classList.remove('warn'); }
  else if (s.warn) { $('phaseTitle').textContent = `Zerfall: ${s.warn} Sektoren`; $('phaseTimer').textContent = fmt(s.nextAt - s.time); ph.classList.add('warn'); }
  else { $('phaseTitle').textContent = `Nächster Zerfall · Welle ${s.wave + 1}`; $('phaseTimer').textContent = fmt(s.nextAt - WARN - s.time); ph.classList.remove('warn'); }

  if (s.ev) { const E = EVENTS.find((x) => x.id === s.ev.id); $('event').classList.remove('hidden'); $('event').innerHTML = `<b>${E.name}</b> · ${E.desc} · ${s.ev.t} s`; }
  else $('event').classList.add('hidden');

  if (s.core) {
    $('corebar').classList.remove('hidden');
    const mine = s.core.prog[G.myTeam] || 0;
    let leader = -1, lv = 0;
    for (const [t, v] of Object.entries(s.core.prog)) if (v > lv) { lv = v; leader = +t; }
    $('coreFill').style.width = `${(mine / CORE_TIME) * 100}%`;
    $('coreText').textContent = `Kern: ${MODES[G.mode].size > 1 ? 'dein Team' : 'du'} ${mine.toFixed(0)}/${CORE_TIME} s`
      + (leader >= 0 && leader !== G.myTeam ? ` · ${MODES[G.mode].size > 1 ? 'Team ' + (leader + 1) : 'Gegner'} ${lv.toFixed(0)} s` : '') + (s.core.c ? ' · umkämpft!' : '');
  }

  for (let i = 0; i < 2; i++) {
    const w = me.weapons[i], el = $('wp' + i);
    el.classList.toggle('active', i === me.cur);
    if (!w) { el.innerHTML = `<span>${i + 1} · leer</span>`; continue; }
    const W = WEAPONS[w[0]];
    const ammo = me.reloading > 0 && i === me.cur ? '…' : `${w[2]}/${lvlMag(W, w[1])}`;
    el.innerHTML = `<span class="ammo">${ammo}</span>${i + 1} · ${W.name} <span class="lvl">${LEVEL_NAMES[w[1]]}</span><br><small>${W.desc}</small>`;
  }
  for (let i = 0; i < 2; i++) {
    const a = me.abilities[i], el = $('ab' + i);
    const key = keyLabel(i ? 'E' : 'Q');
    el.classList.toggle('empty', !a);
    if (!a) { el.innerHTML = `<span class="key">${key}</span> leer`; continue; }
    const A = ABILITIES[a[0]];
    const full = abilityCd({ id: a[0], level: a[1] });
    el.innerHTML = `<span class="key">${key}</span> ${A.name} <span class="lvl" style="color:#ffd34d">${LEVEL_NAMES[a[1]]}</span><br><small>${a[2] > 0 ? a[2].toFixed(1) + ' s' : 'bereit'}</small><div class="cd" style="width:${a[2] > 0 ? (1 - a[2] / full) * 100 : 100}%"></div>`;
  }
  // Geist
  if (me.ghost) {
    $('ghostInfo').classList.remove('hidden');
    $('ghostInfo').innerHTML = me.soloGhost
      ? (me.nearBeacon ? `Halte <b>${keyLabel('F')}</b>: Rückkehr ${Math.floor(me.reviveHold / 3 * 100)} %` : `Geist · ${fmt(me.ghostT)} · Erreiche eine grüne Rückkehrsäule`)
      : 'Geist · Dein Team holt dich mit dem nächsten Kill zurück';
  } else $('ghostInfo').classList.add('hidden');
  // Aufheben-Hinweis
  let near = null, nd = 2.6;
  if (me.alive) for (const l of G.lootMeshes.values()) {
    if (l.type === 'health' || l.type === 'armor') continue;
    const d = Math.hypot(l.x - G.pred.pos.x, l.base - 0.7 - G.pred.pos.y, l.z - G.pred.pos.z);
    if (d < nd) { nd = d; near = l; }
  }
  G.nearLoot = near;
  const KF = keyLabel('F');
  if (near) {
    if (near.type === 'weapon') {
      const W = WEAPONS[near.wid];
      const fuse = me.weapons.some((w) => w && w[0] === near.wid && w[1] < 4);
      $('prompt').innerHTML = `<b>${KF}</b> ${W.name} ${LEVEL_NAMES[near.level]} (${W.desc})${fuse ? ' · <b>verschmelzen</b>' : ''}`;
    } else {
      const A = ABILITIES[near.wid];
      const fuse = me.abilities.some((a) => a && a[0] === near.wid && a[1] < 4);
      $('prompt').innerHTML = `<b>${KF}</b> Fähigkeit ${A.name}: ${A.desc}${fuse ? ' · <b>verschmelzen</b>' : ''}`;
    }
  } else $('prompt').innerHTML = '';
  // Team-Liste
  if (MODES[G.mode].size > 1) {
    const rows = [];
    for (const e of s.ents) {
      const meta = G.meta.get(e[0]);
      if (meta.team !== G.myTeam) continue;
      const cls = e[7] & 1 ? '' : e[7] & 2 ? 'ghost' : 'dead';
      rows.push(`<div class="tm ${cls}">${esc(meta.name)}${e[0] === G.you ? ' (du)' : ''}${e[7] & 2 ? ' · Geist' : ''}<div class="bar"><div style="width:${e[5]}%"></div></div></div>`);
    }
    $('teamPanel').innerHTML = rows.join('');
  } else $('teamPanel').innerHTML = '';
  drawMinimap(s);
}

// ---------------------------------------------------------------- Hauptschleife
let lastFrame = performance.now();
let pingTimer = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  const P = readPad(dt);
  const menuOpen = ['menu', 'lobby', 'overlay'].some((id) => !$(id).classList.contains('hidden'));
  if (P && game && P.edge(BTN.START)) {
    if (!$('overlay').classList.contains('hidden')) { if (!game.over && !game.eliminatedPlace) $('ovResume').click(); }
    else {
      paused = !conn.online;
      $('ovTitle').textContent = conn.online ? 'Menü (Runde läuft weiter)' : 'Pause';
      $('ovText').textContent = '';
      $('ovResume').textContent = 'Weiter';
      showScreen('overlay');
      $('hud').classList.remove('hidden');
      document.exitPointerLock?.();
    }
  } else if (P && menuOpen) padMenus(P);
  if (game && conn) {
    sendInput(dt, P);
    if (!conn.online && !paused) conn.update(dt);
    if (conn.online) { pingTimer -= dt; if (pingTimer <= 0) { pingTimer = 2; conn.send({ t: 'ping', at: performance.now() }); } }
    if (game) {
      syncWorld(dt);
      renderEntities();
      updateFx(dt);
      updateCamera(dt);
      updateHud(dt);
    }
  } else if (!game) {
    const t = now / 1000;
    camera.position.set(Math.sin(t * 0.05) * 220, 120, Math.cos(t * 0.05) * 220);
    camera.lookAt(0, 0, 0);
  }
  renderer.render(scene, camera);
}
let wind = null;
function updateWind(speed) {
  if (!actx) return;
  if (!wind) {
    const src = actx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = actx.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(actx.destination);
    src.start();
    wind = { f, g };
  }
  const k = clamp((speed - 11) / 20, 0, 1);
  wind.g.gain.setTargetAtTime(k * 0.12, actx.currentTime, 0.1);
  wind.f.frequency.setTargetAtTime(400 + k * 1400, actx.currentTime, 0.1);
}
function updateCamera(dt) {
  const G = game, me = G.me;
  if (!me) return;
  updateWind(G.pred.vel.length());
  G.camOffset.multiplyScalar(Math.max(0, 1 - dt * 12));
  const P = G.pred;
  const eye = P.slideT > 0 && P.onGround ? 0.9 : EYE;
  G.landDip = Math.max(0, G.landDip - dt * 1.6);
  const dip = Math.sin(Math.min(1, G.landDip / 0.45) * Math.PI) * G.landDip;
  camera.position.set(P.pos.x + G.camOffset.x, P.pos.y + eye - dip + G.camOffset.y, P.pos.z + G.camOffset.z);
  // beim Wandlauf von der Wand weg neigen
  let rollTarget = 0;
  if (P.wrT > 0) {
    const rx = Math.cos(yaw), rz = -Math.sin(yaw); // rechts
    rollTarget = (P.wrNx * rx + P.wrNz * rz) * 0.14;
  }
  G.roll += (rollTarget - G.roll) * Math.min(1, dt * 10);
  camera.rotation.set(pitch, yaw, G.roll, 'YXZ');
  const w = me.weapons && me.weapons[me.cur];
  const aiming = rightDown || G.padAim;
  const zoomed = aiming && w && WEAPONS[w[0]].zoom;
  const sprint = (keys.ShiftLeft && keys.KeyW || G.padSprint) && !aiming;
  const hspeed = Math.hypot(P.vel.x, P.vel.z);
  const target = zoomed ? 28 : aiming ? 62 : 78 + clamp((hspeed - 8.5) * 0.9, 0, 16);
  camera.fov += (target - camera.fov) * Math.min(1, 12 * dt);
  camera.updateProjectionMatrix();
  G.recoil = Math.max(0, G.recoil - dt * 8);
  if (G.viewModel) {
    G.viewModel.visible = !zoomed;
    const speed = Math.hypot(G.pred.vel.x, G.pred.vel.z);
    const bob = G.pred.onGround ? Math.sin(performance.now() / (sprint ? 70 : 100)) * speed * 0.002 : 0;
    G.viewModel.position.y = -0.25 + bob - G.recoil * 0.04;
    G.viewModel.rotation.x = me.reloading > 0 ? -0.6 : G.recoil * 0.15;
  }
}
requestAnimationFrame(frame);

// Für automatisierte Tests
window.__zz = {
  get game() { return game; }, get conn() { return conn; }, get lobby() { return lobby; },
  keys, pad, setLook: (y, p) => { yaw = y; pitch = p; }, press: (code) => pressed.add(code), setMouse: (d) => { mouseDown = d; },
};

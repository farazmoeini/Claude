// Zerfallzone – Spielserver: liefert den Client aus und berechnet Online-Runden.
// Start: npm start  (Port per PORT=7777)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { WebSocketServer } from 'ws';
import { Sim, MODES, DIFF_IDS, BOT_LIMIT, MAX_PLAYERS, clamp } from '../shared/sim.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const THREE_FILE = path.join(path.dirname(require.resolve('three')), 'three.module.js');
const THREE_ADDONS = path.join(path.dirname(require.resolve('three')), '..', 'examples', 'jsm');
const TICK = 1 / 30;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  let file;
  if (url.pathname === '/vendor/three.module.js') file = THREE_FILE;
  else if (url.pathname.startsWith('/vendor/addons/')) file = path.join(THREE_ADDONS, path.normalize(url.pathname.slice(15)).replace(/^(\.\.[/\\])+/, ''));
  else if (url.pathname.startsWith('/shared/')) file = path.join(ROOT, 'shared', path.normalize(url.pathname.slice(8)).replace(/^(\.\.[/\\])+/, ''));
  else {
    const rel = url.pathname === '/' ? 'index.html' : path.normalize(url.pathname.slice(1)).replace(/^(\.\.[/\\])+/, '');
    file = path.join(ROOT, 'public', rel);
  }
  const allowed = [path.join(ROOT, 'public'), path.join(ROOT, 'shared'), THREE_FILE, path.resolve(THREE_ADDONS)];
  file = path.resolve(file);
  if (!allowed.some((a) => file === a || file.startsWith(a + path.sep))) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    // optionales Modellpaket: ohne eigene Modelle eine leere Beschreibung liefern statt 404
    if (err && url.pathname === '/models/manifest.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
    if (err) { res.writeHead(404); res.end('Nicht gefunden'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

// ---------------------------------------------------------------- Räume
const rooms = new Map();
let nextClientId = 1;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); } while (rooms.has(c)); return c; };
const sanitizeBots = (b = {}) => {
  const out = {};
  let total = 0;
  for (const k of DIFF_IDS) { out[k] = clamp(b[k] | 0, 0, BOT_LIMIT - total); total += out[k]; }
  return out;
};

function createRoom(host, mode, bots, isPublic) {
  const room = {
    code: newCode(), host: host.id, mode: MODES[mode] ? mode : 'solo', bots: sanitizeBots(bots ?? { leicht: 4, mittel: 7, schwer: 3, elite: 1 }),
    isPublic: !!isPublic, clients: new Set(), state: 'lobby', sim: null, timer: null, autoStartAt: 0,
  };
  rooms.set(room.code, room);
  return room;
}
function lobbyInfo(room) {
  return {
    t: 'lobby', code: room.code, host: room.host, mode: room.mode, bots: room.bots, state: room.state, isPublic: room.isPublic,
    autoStartIn: room.autoStartAt ? Math.max(0, Math.ceil((room.autoStartAt - Date.now()) / 1000)) : 0,
    players: [...room.clients].map((c) => ({ id: c.id, name: c.name, inGame: !!c.inGame })),
  };
}
function broadcastLobby(room) { const m = JSON.stringify(lobbyInfo(room)); for (const c of room.clients) send(c, m); }
function send(c, msg) { if (c.ws.readyState === 1) c.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); }

function joinRoom(c, room) {
  leaveRoom(c);
  if (room.clients.size >= MAX_PLAYERS) { send(c, { t: 'err', key: 'net.roomFull' }); return; }
  room.clients.add(c);
  c.room = room;
  c.inGame = false;
  if (!room.host || ![...room.clients].some((x) => x.id === room.host)) room.host = c.id;
  // Öffentliche Räume starten automatisch 20 s nach dem ersten Spieler
  if (room.isPublic && room.state === 'lobby' && !room.autoStartAt) room.autoStartAt = Date.now() + 20000;
  broadcastLobby(room);
  if (room.state === 'play') send(c, { t: 'err', key: 'net.roundRunning' });
}
function leaveRoom(c) {
  const room = c.room;
  if (!room) return;
  room.clients.delete(c);
  if (room.sim && c.inGame) room.sim.removeHuman(c.id);
  c.room = null; c.inGame = false;
  if (!room.clients.size) { clearInterval(room.timer); rooms.delete(room.code); return; }
  if (room.host === c.id) room.host = [...room.clients][0].id;
  broadcastLobby(room);
}

function startMatch(room) {
  if (room.state !== 'lobby') return;
  const humans = [...room.clients].map((c) => ({ id: c.id, name: c.name }));
  room.sim = new Sim({ seed: Math.floor(Math.random() * 2 ** 31), mode: room.mode, botConfig: room.bots, humans });
  room.state = 'play';
  room.autoStartAt = 0;
  for (const c of room.clients) { c.inGame = true; c.inputs = []; send(c, room.sim.startPacket(c.id)); }
  broadcastLobby(room);
  let last = performance.now(), acc = 0;
  room.timer = setInterval(() => {
    const now = performance.now();
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    while (acc >= TICK) { room.sim.step(TICK); acc -= TICK; }
    for (const c of room.clients) if (c.inGame) send(c, room.sim.snapshotFor(c.id));
    room.sim.clearEvents();
    if (room.sim.over) {
      clearInterval(room.timer);
      room.timer = null;
      setTimeout(() => {
        room.state = 'lobby'; room.sim = null;
        for (const c of room.clients) c.inGame = false;
        if (room.isPublic && room.clients.size) room.autoStartAt = Date.now() + 20000;
        broadcastLobby(room);
      }, 4000);
    }
  }, 1000 * TICK);
}

// Auto-Start öffentlicher Räume + Lobby-Countdown
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.state !== 'lobby' || !room.autoStartAt) continue;
    if (Date.now() >= room.autoStartAt) startMatch(room);
    else broadcastLobby(room);
  }
}, 1000);

// ---------------------------------------------------------------- Verbindungen
function handle(c, msg) {
  switch (msg.t) {
    case 'hello':
      c.name = String(msg.name || '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 16) || `Player${c.id.slice(1)}`;
      send(c, { t: 'welcome', id: c.id, name: c.name });
      break;
    case 'create':
      joinRoom(c, createRoom(c, msg.mode, msg.bots, false));
      break;
    case 'join': {
      const room = rooms.get(String(msg.code || '').toUpperCase());
      if (!room) send(c, { t: 'err', key: 'net.roomNotFound' });
      else joinRoom(c, room);
      break;
    }
    case 'quick': {
      const mode = MODES[msg.mode] ? msg.mode : 'solo';
      let room = [...rooms.values()].find((r) => r.isPublic && r.mode === mode && r.state === 'lobby' && r.clients.size < 24);
      if (!room) room = createRoom(c, mode, null, true);
      joinRoom(c, room);
      break;
    }
    case 'settings': {
      const room = c.room;
      if (!room || room.host !== c.id || room.state !== 'lobby') return;
      if (MODES[msg.mode]) room.mode = msg.mode;
      if (msg.bots) room.bots = sanitizeBots(msg.bots);
      broadcastLobby(room);
      break;
    }
    case 'start':
      if (c.room && c.room.host === c.id) startMatch(c.room);
      break;
    case 'leave':
      leaveRoom(c);
      send(c, { t: 'left' });
      break;
    case 'in':
      if (c.room && c.room.sim && c.inGame) c.room.sim.applyInput(c.id, msg);
      break;
    case 'ping':
      send(c, { t: 'pong', at: msg.at });
      break;
  }
}

export function startServer({ port = Number(process.env.PORT) || 7777, host = '0.0.0.0', log = console.log } = {}) {
  const server = http.createServer(serveStatic);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
  wss.on('connection', (ws) => {
    const c = { id: 'p' + nextClientId++, ws, name: '', room: null, inGame: false };
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (msg && typeof msg.t === 'string') handle(c, msg);
    });
    ws.on('close', () => leaveRoom(c));
  });
  wss.on('error', () => {}); // Fehler kommen auch über den HTTP-Server an (z. B. Port belegt)
  return new Promise((resolve, reject) => {
    server.once('error', (e) => { wss.close(); reject(e); });
    server.listen(port, host, () => {
      const addrs = Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
      log(`Zerfallzone-Server läuft auf Port ${port}`);
      log(`  Auf diesem PC:   http://localhost:${port}`);
      for (const a of addrs) log(`  Im Netzwerk:     http://${a}:${port}`);
      resolve({ server, port, addresses: addrs });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().catch((e) => { console.error(e); process.exit(1); });
}

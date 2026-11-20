// Zerfallzone – Client: Darstellung, Eingabe, Vorhersage, Lobby, Offline-Modus
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import {
  Sim, generateWorld, applyDissolve, movePlayer, rayWorld, nearZipline, aimDir, MOVE_FIELDS, MOVE_DEFAULTS, DASH_MAX, DASH_REGEN, sectorOf,
  WEAPONS, ABILITIES, DIFFS, DIFF_IDS, MODES, LEVEL_NAMES, EVENTS, TEAM_COLORS, BOT_LIMIT, CORE_TIME, WARN,
  HALF, SECTOR, NS, EYE, lvlMag, abilityCd, clamp,
} from './shared/sim.js';
import { LANGS, translate, guessLang } from './shared/i18n.js';
import { MODELS, loadModelPack, makeModelCharacter, animateModelCharacter, makeModelWeapon } from './models.js';
loadModelPack();
// ---------------------------------------------------------------- Grafikeinstellungen
// Voreinstellungen wie in anderen PC-Spielen; jede einzelne Option lässt sich danach anpassen (= Benutzerdefiniert)
const GFX_PRESETS = {
  niedrig: { scale: 0.75, tex: '1k', shadows: 0, aa: 0, ao: false, bloom: false, grade: false, aniso: 4, draw: 0.7, effects: 0 },
  mittel: { scale: 1, tex: '1k', shadows: 1, aa: 2, ao: false, bloom: true, grade: true, aniso: 8, draw: 0.85, effects: 1 },
  hoch: { scale: 1, tex: '2k', shadows: 2, aa: 4, ao: true, bloom: true, grade: true, aniso: 16, draw: 1, effects: 1 },
  ultra: { scale: 1.25, tex: '4k', shadows: 3, aa: 4, ao: true, bloom: true, grade: true, aniso: 16, draw: 1.3, effects: 1 },
};
const GFX_FREE = { fov: 78, brightness: 1, fpsCap: 0, showFps: false, shake: true, audioOut: 'default', audioMode: 'hp', assist: 2, wallrun: 1 };
const gfx = (() => {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('zz-gfx')); } catch { /* ohne Speicher */ }
  if (saved && saved.preset) return { ...GFX_FREE, ...GFX_PRESETS.hoch, ...saved };
  // Übernahme der alten Einstellung „Grafikqualität“
  let q = 1;
  try { const old = JSON.parse(localStorage.getItem('zz-quality')); if (old === 0 || old === 1 || old === 2) q = old; } catch { /* egal */ }
  const preset = ['niedrig', 'hoch', 'ultra'][q];
  return { preset, ...GFX_FREE, ...GFX_PRESETS[preset] };
})();
const saveGfx = () => { try { localStorage.setItem('zz-gfx', JSON.stringify(gfx)); } catch { /* ohne Speicher */ } };
const TEX_RES = ['1k', '2k', '4k'];
/** Höchste vorhandene Texturauflösung bis zur gewählten (2k/4k liegen nur nach `npm run assets` vor) */
const photoReady = fetch('api/assets').then((r) => r.json()).catch(() => ({ textures: ['1k'] }))
  .then((a) => { const want = TEX_RES.indexOf(gfx.tex); let res = '1k'; for (const r of a.textures || []) if (TEX_RES.indexOf(r) <= want && TEX_RES.indexOf(r) > TEX_RES.indexOf(res)) res = r; return loadPhotoTextures(res); });
/** Rundenstart wartet auf Modelle, Foto-Texturen und Umgebungslichter (jeweils mit Zeitlimit) */
const assetsReady = () => Promise.race([Promise.all([MODELS.promise, photoReady, env.hdrPromise]), new Promise((r) => setTimeout(r, 30000))]);
import { createEnvironment, buildCity, makeCharacter, makeWeapon, animateCharacter, createEffects, TODS, GradeShader, setVisualTime, loadPhotoTextures, PHOTO, setMaxAnisotropy } from './visuals.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('zz-' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('zz-' + k, JSON.stringify(v)); } catch { /* ohne Speicher */ } },
};
// ---------------------------------------------------------------- Sprache
let lang = null;
try { const v = localStorage.getItem('zz-lang'); if (v) lang = JSON.parse(v); } catch { /* ohne Speicher */ }
if (lang && !LANGS[lang]) lang = null;
const t = (key, p) => translate(lang || 'en', key, p);
const wName = (id) => t('w.' + id);
const aName = (id) => t('a.' + id);
const aDesc = (id) => t('a.' + id + '.d');
function applyI18n() {
  document.documentElement.lang = lang || 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  const rows = (arr) => arr.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
  document.getElementById('helpKb').innerHTML = rows(t('help.kb'));
  document.getElementById('helpPad').innerHTML = `<tr><td colspan="2"><b>${esc(t('help.padTitle'))}</b></td></tr>` + rows(t('help.pad'));
  document.getElementById('helpRules').innerHTML = t('help.rules').map((r) => `<li>${esc(r)}</li>`).join('');
  const chips = document.getElementById('langChips');
  chips.innerHTML = '';
  for (const [k, name] of Object.entries(LANGS)) {
    const b = document.createElement('button');
    b.textContent = name;
    b.classList.toggle('on', k === lang);
    b.onclick = () => setLang(k);
    chips.appendChild(b);
  }
}
function setLang(k) {
  lang = k;
  try { localStorage.setItem('zz-lang', JSON.stringify(k)); } catch { /* ohne Speicher */ }
  applyI18n();
  if (typeof refreshMenu === 'function') refreshMenu();
  if (typeof renderFxBtn === 'function') renderFxBtn();
  if (typeof renderSettings === 'function' && !$('settings').classList.contains('hidden')) renderSettings();
  if (lobby) onLobby(lobby);
}
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const fmt = (t) => { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(clamp(devicePixelRatio * gfx.scale, 0.5, 2.5));
renderer.setSize(innerWidth, innerHeight);
renderer.domElement.id = 'game';
document.body.prepend(renderer.domElement);
const canvas = renderer.domElement;
/** Maus einfangen. Ohne Klick des Spielers (z. B. Rundenstart durch den Host) lehnt der Browser ab – dann reicht ein Klick ins Bild. */
function lockPointer() { try { const r = canvas.requestPointerLock && canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* Klick ins Bild genügt */ } }
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.05, 2600);
scene.add(camera);
const env = createEnvironment(scene, renderer);
const effects = createEffects(scene);
// Leuchteffekte (Bloom) für die Neonstadt – abschaltbar für schwächere Rechner
// Bildaufbereitung (nur bei hoher Grafikqualität): Kantenglättung (4× MSAA), Umgebungsverdeckung,
// Leuchten, Tonemapping und eine Farbabstimmung je Tageszeit
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 3, scale: 1.1, samples: 12 });
gtao.blendIntensity = 0.85;
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.45, 0.8);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass(GradeShader);
composer.addPass(grade);
let fxOn = true;
let usePipeline = true;
const SHADOW_SIZES = [0, 1024, 2048, 4096];
setMaxAnisotropy(Math.min(gfx.aniso, renderer.capabilities.getMaxAnisotropy()));
/** Wendet alle Grafikeinstellungen an, die ohne Neustart wirken */
function applyGfx() {
  const pr = clamp(devicePixelRatio * gfx.scale, 0.5, 2.5);
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  composer.setSize(innerWidth, innerHeight);
  env.setShadows(gfx.shadows > 0);
  if (gfx.shadows > 0) env.setShadowSize(SHADOW_SIZES[gfx.shadows]);
  gtao.enabled = gfx.ao; bloom.enabled = gfx.bloom; grade.enabled = gfx.grade;
  for (const rt of [composer.renderTarget1, composer.renderTarget2]) if (rt.samples !== gfx.aa) { rt.samples = gfx.aa; rt.dispose(); }
  usePipeline = gfx.ao || gfx.bloom || gfx.grade || gfx.aa > 0;
  camera.far = 2600 * gfx.draw; camera.updateProjectionMatrix();
  env.setDrawDistance(gfx.draw);
  env.setBrightness(gfx.brightness);
  effects.quality = gfx.effects;
  fxOn = gfx.effects > 0;
  $('fps').classList.toggle('hidden', !gfx.showFps);
  applyAudioSettings();
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});



// ---------------------------------------------------------------- Audio
// Räumlicher Klang: Jede fremde Quelle (Schüsse, Schritte, Dash, Fähigkeiten …) läuft über einen
// HRTF-Panner an ihrer Position. Wände dazwischen dämpfen und filtern den Klang, Entfernung schluckt
// die Höhen. Ein Kompressor am Ende verhindert Übersteuern, wenn viel gleichzeitig passiert.
let actx = null, noiseBuf = null, master = null;
let volume = store.get('vol', 0.8);
function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.6, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    master = actx.createGain();
    master.gain.value = volume;
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    master.connect(comp).connect(actx.destination);
    applyAudioSettings();
  } catch { actx = null; }
}
// Ausgabegerät und Wiedergabeart (Kopfhörer = 3D-Klang, Lautsprecher = Stereo, Mono)
let audioDevices = [{ id: 'default', label: '' }];
async function refreshAudioDevices() {
  try {
    const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
    audioDevices = [{ id: 'default', label: '' }, ...list.map((d, i) => ({ id: d.deviceId, label: d.label || `${t('gfx.audioOut')} ${i + 1}` }))];
  } catch { /* keine Geräteliste verfügbar */ }
}
function applyAudioSettings() {
  if (!actx) return;
  if (actx.setSinkId) {
    const want = gfx.audioOut === 'default' ? '' : gfx.audioOut;
    if ((actx.sinkId || '') !== want) actx.setSinkId(want).catch(() => { gfx.audioOut = 'default'; saveGfx(); });
  }
  const mono = gfx.audioMode === 'mono';
  actx.destination.channelCount = mono ? 1 : Math.min(2, actx.destination.maxChannelCount || 2);
  actx.destination.channelCountMode = 'explicit';
  actx.destination.channelInterpretation = 'speakers';
}
navigator.mediaDevices?.addEventListener?.('devicechange', () => refreshAudioDevices());
function setVolume(v) { volume = v; store.set('vol', v); if (master) master.gain.setTargetAtTime(v, actx.currentTime, 0.05); }
/** Gefiltertes Rauschen (Knall, Schritt, Zischen) */
function noise(dest, { type = 'bandpass', f = 1500, f1 = null, q = 1, dur = 0.1, vol = 0.3, delay = 0 }) {
  const t0 = actx.currentTime + delay;
  const src = actx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const fl = actx.createBiquadFilter();
  fl.type = type; fl.frequency.setValueAtTime(f, t0); fl.Q.value = q;
  if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(fl).connect(g).connect(dest);
  src.start(t0, Math.random() * 0.2); src.stop(t0 + dur + 0.02);
}
/** Ton mit Tonhöhenverlauf (Pfeifen, Wummern, Signale) */
function osc(dest, { type = 'sine', f0 = 440, f1 = f0, dur = 0.1, vol = 0.1, delay = 0 }) {
  const t0 = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
/** Hat die Kamera freie Sicht zur Quelle? (sonst klingt sie dumpf "hinter der Wand") */
function audible(pos) {
  if (!game) return true;
  const o = camera.position, dx = pos.x - o.x, dy = pos.y - o.y, dz = pos.z - o.z, d = Math.hypot(dx, dy, dz);
  if (d < 0.5) return true;
  return rayWorld([o.x, o.y, o.z], [dx / d, dy / d, dz / d], d, game.world.boxes.concat(game.walls)) >= d - 0.3;
}
/** Eingang für einen Klang an einer Weltposition */
function spatial(pos, { gain = 1, ref = 5, roll = 1.1, maxDist = 160 } = {}) {
  const d = camera.position.distanceTo(pos);
  if (d > maxDist) return null;
  const pan = actx.createPanner();
  pan.panningModel = gfx.audioMode === 'hp' ? 'HRTF' : 'equalpower'; pan.distanceModel = 'inverse';
  pan.refDistance = ref; pan.rolloffFactor = roll; pan.maxDistance = maxDist;
  if (pan.positionX) { pan.positionX.value = pos.x; pan.positionY.value = pos.y; pan.positionZ.value = pos.z; } else pan.setPosition(pos.x, pos.y, pos.z);
  const free = audible(pos);
  const lp = actx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = (free ? 16000 : 750) * clamp(1 - d / 220, 0.3, 1);
  const g = actx.createGain();
  g.gain.value = gain * (free ? 1 : 0.55);
  g.connect(lp).connect(pan).connect(master);
  return g;
}
function updateListener() {
  if (!actx) return;
  const L = actx.listener, p = camera.position;
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), u = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  if (L.positionX) {
    const t0 = actx.currentTime;
    L.positionX.setValueAtTime(p.x, t0); L.positionY.setValueAtTime(p.y, t0); L.positionZ.setValueAtTime(p.z, t0);
    L.forwardX.setValueAtTime(f.x, t0); L.forwardY.setValueAtTime(f.y, t0); L.forwardZ.setValueAtTime(f.z, t0);
    L.upX.setValueAtTime(u.x, t0); L.upY.setValueAtTime(u.y, t0); L.upZ.setValueAtTime(u.z, t0);
  } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
}

// Jede Waffe hat einen eigenen Charakter, damit man am Klang hört, womit geschossen wird
const WEAPON_SND = {
  funke: (d, v) => { noise(d, { f: 2600, q: 0.9, dur: 0.07, vol: 0.3 * v }); osc(d, { type: 'square', f0: 900, f1: 450, dur: 0.03, vol: 0.05 * v }); },
  puls: (d, v) => { noise(d, { f: 1500, q: 1.2, dur: 0.09, vol: 0.34 * v }); osc(d, { type: 'sawtooth', f0: 420, f1: 170, dur: 0.08, vol: 0.08 * v }); },
  hagel: (d, v) => { noise(d, { type: 'lowpass', f: 1300, f1: 300, dur: 0.34, vol: 0.55 * v }); osc(d, { f0: 120, f1: 45, dur: 0.26, vol: 0.4 * v }); },
  lanze: (d, v) => { noise(d, { f: 4200, q: 0.7, dur: 0.08, vol: 0.35 * v }); osc(d, { type: 'sawtooth', f0: 2800, f1: 150, dur: 0.45, vol: 0.12 * v }); osc(d, { f0: 70, f1: 40, dur: 0.3, vol: 0.3 * v }); },
  dorn: (d, v) => { noise(d, { f: 3400, q: 1.6, dur: 0.05, vol: 0.32 * v }); osc(d, { type: 'triangle', f0: 1600, f1: 700, dur: 0.05, vol: 0.09 * v }); },
  moerser: (d, v) => { osc(d, { f0: 170, f1: 70, dur: 0.2, vol: 0.4 * v }); noise(d, { type: 'lowpass', f: 700, dur: 0.16, vol: 0.28 * v }); },
};
function boomSound(d, v) {
  noise(d, { type: 'lowpass', f: 900, f1: 120, dur: 0.7, vol: 0.7 * v });
  osc(d, { f0: 90, f1: 30, dur: 0.6, vol: 0.55 * v });
  noise(d, { f: 2500, q: 0.6, dur: 0.12, vol: 0.25 * v });
}
/** Schritt: Gegner klingen heller und klarer als Teamkameraden */
function stepSound(d, v, enemy) {
  noise(d, { f: enemy ? 900 + Math.random() * 400 : 500 + Math.random() * 200, q: 1.3, dur: 0.06, vol: 0.28 * v });
  osc(d, { f0: enemy ? 140 : 110, f1: 60, dur: 0.05, vol: 0.14 * v });
}
/** Kugel fliegt knapp vorbei */
function whizSound(d) { noise(d, { f: 3500, f1: 900, q: 3, dur: 0.16, vol: 0.35 }); }

// Kurze Signal-Klänge [f0, f1, Dauer, Lautstärke, Wellenform]
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
  updraft: [200, 500, 0.6, 0.06, 'sine'], slam: [200, 40, 0.4, 0.3, 'sawtooth'], hurt: [180, 90, 0.12, 0.18, 'square'],
  shieldbreak: [2400, 600, 0.35, 0.2, 'triangle'],
};
// Bewegungen anderer Spieler: deutlich hörbar, mit Rauschanteil für bessere Ortung
const MOVE_NOISE = { shieldbreak: [5000, 0.3, 0.35], dash: [2200, 0.12, 0.3], slide: [800, 0.35, 0.25], walljump: [1200, 0.1, 0.25], wallrun: [600, 0.4, 0.2], land: [400, 0.15, 0.4], pad: [1500, 0.3, 0.2], dj: [1400, 0.08, 0.2], mantle: [900, 0.1, 0.2], reload: [3000, 0.08, 0.25] };
function playSndTo(dest, s, v = 1) {
  const a = SND[s];
  if (a) osc(dest, { f0: a[0], f1: a[1], dur: a[2], vol: a[3] * v, type: a[4] });
  const n = MOVE_NOISE[s];
  if (n) noise(dest, { f: n[0], q: 1, dur: n[1], vol: n[2] * v });
}
const playSnd = (s) => { if (actx) playSndTo(master, s); };
/** Klang an einer Position (für andere Spieler) */
function playAt(s, p, gain = 1) {
  if (!actx || !game) return;
  const d = spatial(new THREE.Vector3(p[0], p[1], p[2]), { gain });
  if (d) playSndTo(d, s, 1.6);
}
function tone(f0, f1, dur, vol = 0.15, type = 'sine') { if (actx) osc(master, { f0, f1, dur, vol, type }); }
function sfxShot(kind, vol = 1) { if (actx && WEAPON_SND[kind]) WEAPON_SND[kind](master, vol); }

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
    row.innerHTML = `<span class="dot" style="background:${hex(D.color)}"></span><span class="dl">${t('diff.' + k)}</span>`
      + `<button data-d="-1">−</button><span class="cnt">${cfg[k] | 0}</span><button data-d="1">+</button>`;
    row.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const d = +b.dataset.d;
      if (d > 0 && totalBots(cfg) >= BOT_LIMIT) return;
      cfg[k] = clamp((cfg[k] | 0) + d, 0, BOT_LIMIT);
      onChange();
    }));
    el.appendChild(row);
  }
  totalEl.textContent = t('bots.count', { n: totalBots(cfg) });
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
  $('botTotal').textContent = t('bots.teams', { n: totalBots(botConfig), t: Math.ceil((totalBots(botConfig) + 1) / size), s: size });
  $('serverHint').textContent = location.protocol.startsWith('http') ? t('menu.serverHint', { port: location.port || 80 }) : '';
}
document.querySelectorAll('#menu [data-preset]').forEach((b) => b.addEventListener('click', () => {
  botConfig = { ...PRESETS[b.dataset.preset] }; store.set('bots', botConfig); refreshMenu();
}));
$('nameInput').value = store.get('name', '');
$('nameInput').addEventListener('change', () => store.set('name', $('nameInput').value.trim()));
$('sensInput').value = sens;
$('volInput').value = volume;
$('volInput').addEventListener('input', () => { initAudio(); setVolume(+$('volInput').value); tone(660, 660, 0.05, 0.1); });
const renderFxBtn = () => { $('fxBtn').textContent = `${t('gfx.g.quality')}: ${gfx.preset === 'custom' ? t('gfx.custom') : t('gfx.p.' + gfx.preset)}  ›`; };
$('fxBtn').addEventListener('click', () => openSettings());
renderFxBtn();
$('sensInput').addEventListener('input', () => { sens = +$('sensInput').value; store.set('sens', sens); });
const defaultServer = location.protocol.startsWith('http') ? location.host : 'localhost:7777';
$('serverInput').value = store.get('server', defaultServer);
applyI18n();
refreshMenu();
const playerName = () => ($('nameInput').value.trim() || t('menu.namePh')).slice(0, 16);

function showScreen(id) {
  for (const s of ['menu', 'lobby', 'overlay', 'langPick', 'settings']) $(s).classList.toggle('hidden', s !== id);
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
  start(mode, bots, name, seed = Math.floor(Math.random() * 2 ** 31)) {
    this.sim = new Sim({ seed, mode, botConfig: bots, humans: [{ id: 'me', name }] });
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
    case 'start': assetsReady().then(() => startGame(m)); break;
    case 's': if (game) onSnapshot(m); break;
    case 'err': $('netErr').textContent = t(m.key); $('lobbyStatus').textContent = t(m.key); break;
    case 'left': lobby = null; showScreen('menu'); break;
    case 'pong': pingMs = Math.round(performance.now() - m.at); break;
  }
}
function onClose() {
  if (game && conn && conn.online) endGameView();
  conn = null; lobby = null;
  $('netErr').textContent = t('net.lost');
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
    $('netErr').textContent = t('net.fail', { addr });
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
  $('lobbyShare').textContent = t('lobby.share', { server: $('serverInput').value.trim() || location.host }) + (m.isPublic ? t('lobby.public') : '');
  const size = MODES[m.mode].size;
  const pl = $('lobbyPlayers');
  pl.innerHTML = '';
  m.players.forEach((p, i) => {
    if (i % size === 0 && size > 1) {
      const h = document.createElement('div');
      h.className = 'teamhdr'; h.textContent = t('lobby.team', { n: i / size + 1 });
      pl.appendChild(h);
    }
    const d = document.createElement('div');
    d.className = 'pl';
    d.innerHTML = `<span>${esc(p.name)}${p.id === myClientId ? t('lobby.you') : ''}</span><span class="muted">${p.id === m.host ? t('lobby.host') : ''}${p.inGame ? t('lobby.inGame') : ''}</span>`;
    pl.appendChild(d);
  });
  setChips($('lobbyModeChips'), m.mode, isHost, (mode) => conn.send({ t: 'settings', mode }));
  const cfg = { ...m.bots };
  renderBotCfg($('lobbyBotcfg'), $('lobbyBotTotal'), cfg, isHost, () => conn.send({ t: 'settings', bots: cfg }));
  $('lobbyPresets').classList.toggle('readonly', !isHost);
  $('lobbyPresets').querySelectorAll('button').forEach((b) => { b.onclick = () => conn.send({ t: 'settings', bots: PRESETS[b.dataset.preset] }); });
  $('lobbyBotTotal').textContent = t('bots.fill', { n: totalBots(cfg), s: size });
  $('hostNote').textContent = isHost ? t('lobby.isHost') : t('lobby.notHost');
  $('startBtn').disabled = !isHost || m.state !== 'lobby';
  $('lobbyStatus').textContent = m.state === 'play' ? t('lobby.running')
    : m.autoStartIn ? t('lobby.startIn', { n: m.autoStartIn }) : isHost ? '' : t('lobby.wait');
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
  hidePreview();
  effects.clear();
  const world = generateWorld(pkt.seed);
  const root = new THREE.Group();
  scene.add(root);
  game = {
    pkt, world, root, you: pkt.you, mode: pkt.mode, teamCount: pkt.teamCount,
    meta: new Map(pkt.ents.map((e) => [e.id, e])), myTeam: pkt.ents.find((e) => e.id === pkt.you).team,
    decayAt: new Array(NS * NS).fill(-1), walls: [], wallMeshes: new Map(), shake: 0, sway: { x: 0, y: 0, yaw: 0, pitch: 0 }, shardT: 0,
    ents: new Map(), lootMeshes: new Map(), snaps: [], last: null, me: null,
    pred: { pos: new THREE.Vector3(), vel: new THREE.Vector3(), ...MOVE_DEFAULTS }, landDip: 0, roll: 0,
    havePred: false, seq: 0, pending: [], camOffset: new THREE.Vector3(),
    tracers: [], booms: [], feed: [], over: null, eliminatedPlace: 0, mineMeshes: [], projMeshes: [], beaconMeshes: [], coreMesh: null,
    hitTimer: 0, vignette: 0, recoil: 0, viewModel: null, vmKey: '',
  };
  buildWorldMeshes(world, root, pkt.tod);
  for (const l of pkt.loot) addLoot(l);
  for (const e of pkt.ents) if (e.id !== pkt.you) createEntityMesh(e);
  yaw = Math.random() * Math.PI * 2; pitch = -0.5;
  $('feed').innerHTML = '';
  $('corebar').classList.add('hidden');
  paused = false;
  showScreen(null);
  $('hud').classList.remove('hidden');
  pushFeed(MODES[pkt.mode].size > 1 ? t('feed.landTeam', { mode: t('mode.' + pkt.mode) }) : t('feed.land'), 'me');
  pushFeed(t('tod.' + (pkt.tod || 'tag')));
  lockPointer();
}

function applyTodVisuals(tod) {
  env.apply(tod);
  const P = TODS[tod] || TODS.tag;
  bloom.strength = P.bloom[0]; bloom.radius = P.bloom[1]; bloom.threshold = P.bloom[2];
  const g = P.grade, u = grade.uniforms;
  u.lift.value.set(...g.lift); u.gamma.value.set(...g.gamma); u.gain.value.set(...g.gain);
  u.saturation.value = g.sat; u.contrast.value = g.contrast; u.vignette.value = g.vignette;
}
function buildWorldMeshes(world, root, tod = 'tag') {
  applyTodVisuals(tod);
  game.city = buildCity(world, root, tod);
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
  const teamCol = mate ? 0x3dd68c : TEAM_COLORS[meta.team % TEAM_COLORS.length];
  const accent = mate ? 0x7dff6b : meta.bot ? DIFFS[meta.diff].color : 0xffffff;
  const rig = MODELS.character ? makeModelCharacter(teamCol, accent, mate ? 0x06301a : 0x3a0410) : makeCharacter(teamCol, accent);
  const g = rig.group;
  const outline = new THREE.Mesh(outlineGeo, new THREE.MeshBasicMaterial({ color: mate ? 0x7dff6b : 0xff3355, transparent: true, opacity: 0.45, depthTest: false }));
  outline.position.y = 0.95; outline.visible = false; outline.renderOrder = 10;
  g.add(outline);
  if (mate) {
    const marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0x7dff6b, depthTest: false }));
    marker.position.y = 2.25; marker.renderOrder = 20;
    const tag = nameSprite(meta.name, 0x7dff6b);
    tag.position.y = 2.75;
    g.add(marker, tag);
  }
  game.root.add(g);
  game.ents.set(meta.id, { g, rig, outline, mats: rig.mats, mate, meta, gun: rig.gun });
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
  const custom = makeModelWeapon(w[0]);
  if (custom) {
    custom.position.set(0.26, -0.26, -0.62);
    custom.userData.z = custom.position.z; custom.userData.len = 0.6;
    camera.add(custom);
    game.viewModel = custom;
    return;
  }
  // eigene Waffe mit Armen und Handschuhen in der Ich-Ansicht
  const vm = new THREE.Group();
  const len = { funke: 0.5, puls: 0.7, hagel: 0.62, lanze: 0.85, dorn: 0.3, moerser: 0.55 }[w[0]] || 0.6;
  const gun = makeWeapon(w[0], W.color);
  vm.add(gun);
  // Stufe als kleine helle Kerben am Gehäuse statt bunter Ringe
  const tick = new THREE.MeshBasicMaterial({ color: 0xd8d8d2, toneMapped: false });
  for (let i = 1; i < w[1]; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.012), tick); t.position.set(-0.038, 0.02, 0.06 - i * 0.022); vm.add(t); }
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.9 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.7 });
  const pad = new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.5, metalness: 0.35 });
  const limb = (from, to, r, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(r, r, from.distanceTo(to)), mat);
    m.position.copy(from).lerp(to, 0.5); m.lookAt(to); vm.add(m); return m;
  };
  // rechte Hand am Griff, linke Hand am Vorderschaft
  const gripP = new THREE.Vector3(0, -0.07, 0.08), foreP = new THREE.Vector3(0, -0.04, w[0] === 'dorn' ? 0.02 : -len * 0.38);
  limb(new THREE.Vector3(0.12, -0.28, 0.42), gripP.clone().add(new THREE.Vector3(0.02, -0.03, 0.05)), 0.075, sleeve);
  limb(new THREE.Vector3(0.1, -0.24, 0.3), gripP.clone().add(new THREE.Vector3(0.015, -0.01, 0.02)), 0.08, pad);
  const rh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.08), glove); rh.position.copy(gripP); vm.add(rh);
  limb(new THREE.Vector3(-0.32, -0.3, 0.25), foreP.clone().add(new THREE.Vector3(-0.03, -0.04, 0.06)), 0.075, sleeve);
  const lh = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.06, 0.09), glove); lh.position.copy(foreP).add(new THREE.Vector3(-0.01, -0.02, 0)); vm.add(lh);
  vm.scale.setScalar(0.62);
  vm.position.set(0.19, -0.155, -0.5);
  vm.userData.z = vm.position.z;
  vm.userData.len = len;
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
  // Rüstung bricht: Splitter und Klang (bei Gegnern an ihrer Position, bei dir am Bildschirm)
  G.armorPrev = G.armorPrev || new Map();
  for (const e of s.ents) {
    const prev = G.armorPrev.get(e[0]);
    if (prev > 0 && e[6] === 0 && (e[7] & 1)) {
      if (e[0] === G.you) { playSnd('shieldbreak'); flashScreen('#2c8bff'); rumble(0.6, 0.6, 200); }
      else {
        const p = new THREE.Vector3(e[1], e[2] + 1.3, e[3]);
        for (let i = 0; i < 4; i++) effects.shards(p, 0x6fc3ff, 3);
        if (actx) { const d = spatial(p, { gain: 1.2 }); if (d) playSndTo(d, 'shieldbreak', 1.5); }
      }
    }
    G.armorPrev.set(e[0], e[6]);
  }
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
        if (t[3] === 0 && to.distanceTo(camera.position) < 90) effects.smoke(to, 1, 0.6, 0xc8c4bc, 0.6); // Staub am Einschlag
      }
      if (mine) {
        const muzzle = G.viewModel ? G.viewModel.localToWorld(new THREE.Vector3(0, 0.01, -(G.viewModel.userData.len || 0.6) * 0.72)) : from;
        effects.flash(muzzle, f.w === 'hagel' || f.w === 'lanze' ? 0.75 : 0.45, fxOn);
        if (Math.random() < 0.35) effects.smoke(muzzle, 1, 0.25, 0xd0d0d0, 0.4);
        if (f.w !== 'lanze' && f.w !== 'moerser' && G.viewModel) {
          const port = G.viewModel.localToWorld(new THREE.Vector3(0.04, 0.03, -0.05));
          const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
          effects.casing(port, right.multiplyScalar(1.6 + Math.random()).add(new THREE.Vector3(0, 1.8 + Math.random(), 0)));
        }
      } else if (from.distanceTo(camera.position) < 150) effects.flash(new THREE.Vector3(...f.from), 0.6, fxOn && from.distanceTo(camera.position) < 40);
      if (mine) { rumble(0.25, f.w === 'hagel' || f.w === 'lanze' || f.w === 'moerser' ? 0.6 : 0.1, 60); G.recoil = 1; pitch = Math.min(1.5, pitch + (f.w === 'lanze' ? 0.03 : f.w === 'hagel' || f.w === 'moerser' ? 0.04 : f.w === 'dorn' ? 0.015 : 0.006)); }
      if (!mine) { const ve = G.ents.get(f.id); if (ve && ve.rig) ve.rig.kick = 1; }
      if (mine) sfxShot(f.w, 1);
      else if (actx) {
        // fremder Schuss: räumlich, Teamkameraden leiser, Gegner reichen weiter
        const mate = G.meta.get(f.id) && G.meta.get(f.id).team === G.myTeam;
        const d = spatial(from, { gain: mate ? 0.45 : 1.3, ref: 7, roll: 0.9, maxDist: 220 });
        if (d) WEAPON_SND[f.w](d, 1);
        // Kugel fliegt knapp vorbei → Zischen aus ihrer Richtung
        if (!mate) for (const t of f.tos) {
          const to = new THREE.Vector3(t[0], t[1], t[2]);
          const seg = to.clone().sub(from), len = seg.length();
          if (len < 1) continue;
          const k = clamp(camera.position.clone().sub(from).dot(seg) / (len * len), 0, 1);
          const near = from.clone().addScaledVector(seg, k);
          if (k > 0.05 && k < 0.98 && near.distanceTo(camera.position) < 3) { const w = spatial(near, { ref: 1.5 }); if (w) whizSound(w); break; }
        }
      }
      break;
    }
    case 'hit':
      hitmarker(f.head);
      if (f.p) damageNumber(f.p, f.a, f.head);
      break;
    case 'dmg':
      G.vignette = Math.min(1, G.vignette + f.a / 30); rumble(0.4, Math.min(1, f.a / 25), 140);
      playSnd('hurt');
      if (f.s) damageArrow(f.s);
      break;
    case 'ms':
      // hörbare Bewegung / Fähigkeit eines anderen Spielers
      if (f.id !== G.you) {
        const mate = G.meta.get(f.id) && G.meta.get(f.id).team === G.myTeam;
        playAt(f.s, f.p, mate ? 0.4 : 1.2);
      }
      break;
    case 'boom': {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: f.c, transparent: true, opacity: 0.7, depthWrite: false }));
      m.position.set(...f.p);
      G.root.add(m);
      G.booms.push({ m, life: 0.35, r: f.r });
      effects.smoke(m.position, 8, f.r * 0.8, 0x9a9aa4, 1.8);
      effects.flash(m.position, f.r * 0.8, fxOn);
      G.shake = Math.max(G.shake, clamp(1.2 - m.position.distanceTo(camera.position) / 25, 0, 1));
      if (actx) { const d = spatial(m.position, { gain: 1.4, ref: 10, roll: 0.8, maxDist: 250 }); if (d) boomSound(d, 1); }
      break;
    }
    case 'kill': {
      if (f.ai === G.you) killBanner(f.b);
      const cls = f.at === G.myTeam ? 'me' : f.bt === G.myTeam ? 'team' : '';
      pushFeed(`${f.a ?? t('feed.decay')} ✕ ${f.b}`, cls);
      break;
    }
    case 'msg': {
      const p = { ...(f.p || {}), key: keyLabel('F') };
      if (f.key === 'msg.event') p.ev = t('e.' + f.p.ev);
      pushFeed(t(f.key, p), 'me');
      break;
    }
    case 'revive':
      if (f.team === G.myTeam) { pushFeed(t('feed.back', { name: f.name }), 'team'); playSnd('revive'); }
      break;
    case 'teamout':
      if (f.team === G.myTeam && !G.over) {
        G.eliminatedPlace = f.place;
        pushFeed(t('feed.teamOut', { p: f.place }), 'me');
        showResult(false, f.place);
      } else if (MODES[G.mode].size > 1) pushFeed(t('feed.otherOut', { t: f.team + 1, p: f.place }));
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
  $('ovTitle').textContent = won ? t('ov.win') : t('ov.out');
  $('ovText').textContent = `${won ? t('ov.teamWon') : t('ov.place', { p: place, n: G.teamCount })} · ${me ? me.kills : 0} Kills · ${fmt(G.last ? G.last.time : 0)}`;
  $('ovResume').textContent = G.over ? (conn && conn.online ? t('ov.toLobby') : t('ov.newRound')) : t('ov.spectate');
  $('ovQuit').textContent = t('ov.quit');
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
  lockPointer();
};
$('ovQuit').onclick = () => {
  if (conn) { if (conn.online) conn.send({ t: 'leave' }); conn.close(); conn = null; }
  endGameView();
  lobby = null;
  showScreen('menu');
};
function endGameView() {
  $('dmgNums').innerHTML = '';
  if (wind) wind.g.gain.setTargetAtTime(0, actx.currentTime, 0.05);
  clearGameScene();
  game = null;
  document.body.classList.remove('ghostmode', 'cloaked', 'shielded');
  $('hud').classList.add('hidden');
}

// ---------------------------------------------------------------- Effekte
const tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).rotateX(Math.PI / 2);
function addTracer(from, to, color) {
  const len = from.distanceTo(to);
  if (len < 0.1) return;
  const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  m.position.copy(from).lerp(to, 0.5);
  m.lookAt(to);
  m.scale.set(0.03, 0.03, len);
  game.root.add(m);
  game.tracers.push({ beam: m, life: 0.12 });
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
    if (t.beam) { const k = Math.max(0, t.life / 0.12); t.beam.material.opacity = k; t.beam.scale.x = t.beam.scale.y = 0.012 + 0.03 * k; }
    if (t.spark) { t.spark.scale.setScalar(1 + (0.25 - t.life) * 8); t.spark.material.opacity = Math.max(0, t.life / 0.25); }
    if (t.life <= 0) {
      const o = t.line || t.spark || t.beam;
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
/** roter Bogen am Bildschirmrand: aus dieser Richtung kam der Treffer */
function damageArrow(src) {
  const P = game.pred.pos;
  const dx = src[0] - P.x, dz = src[1] - P.z;
  if (Math.hypot(dx, dz) < 0.5) return;
  const rel = Math.atan2(-dx, -dz) - yaw;
  const el = document.createElement('div');
  el.className = 'dmgarc';
  el.style.transform = `rotate(${-rel}rad)`;
  $('dmgDir').appendChild(el);
  setTimeout(() => el.remove(), 1100);
}
// schwebende Schadenszahlen über getroffenen Gegnern
function damageNumber(p, amount, head) {
  const el = document.createElement('div');
  el.className = 'dmgnum' + (head ? ' head' : '');
  el.textContent = amount;
  $('dmgNums').appendChild(el);
  game.dmgNums = game.dmgNums || [];
  game.dmgNums.push({ el, pos: new THREE.Vector3(p[0] + (Math.random() - 0.5) * 0.6, p[1], p[2] + (Math.random() - 0.5) * 0.6), life: 0.9 });
}
function updateDamageNumbers(dt) {
  const list = game.dmgNums || [];
  const v = new THREE.Vector3();
  for (let i = list.length - 1; i >= 0; i--) {
    const n = list[i];
    n.life -= dt; n.pos.y += dt * 1.2;
    v.copy(n.pos).project(camera);
    const vis = v.z < 1 && n.life > 0;
    n.el.style.display = vis ? '' : 'none';
    n.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%) scale(${0.8 + n.life * 0.4})`;
    n.el.style.opacity = Math.min(1, n.life * 2.5);
    if (n.life <= 0) { n.el.remove(); list.splice(i, 1); }
  }
}
function killBanner(name) {
  const el = $('killBanner');
  el.innerHTML = `<span>✕</span> ${esc(name)}`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  tone(880, 1320, 0.12, 0.15, 'triangle'); tone(1320, 1760, 0.18, 0.12, 'triangle');
}
function flashScreen(color) {
  const el = $('flash');
  el.style.background = color;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
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
  // Gebäude: Zerfall je Sektor (gleiche Formel wie die Kollision in applyDissolve)
  G.shardT -= dt;
  for (let i = 0; i < NS * NS; i++) {
    if (G.decayAt[i] < 0) { G.city.updateSector(i, false, 1, false); continue; }
    const d = s.time - G.decayAt[i];
    const f = d < 1.5 ? 1 : clamp(1 - (d - 1.5) / 5, 0, 1);
    G.city.updateSector(i, s.sectors[i] === '2', f, d >= 0 && d < 1.5);
    // aufsteigende Splitter über versinkenden Sektoren in der Nähe
    if (f > 0 && d < 7 && G.shardT <= 0) {
      const cx = -HALF + (i % NS) * SECTOR + Math.random() * SECTOR, cz = -HALF + Math.floor(i / NS) * SECTOR + Math.random() * SECTOR;
      if (Math.hypot(cx - G.pred.pos.x, cz - G.pred.pos.z) < 140) { effects.shards(new THREE.Vector3(cx, Math.random() * 25 * f, cz), Math.random() < 0.6 ? 0xff3355 : 0x2cf3ff, 2); }
    }
  }
  if (G.shardT <= 0) G.shardT = 0.05;
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
    if (v.rig.setWeapon && eb[8] !== v.rig.weaponId) v.rig.setWeapon(eb[8] || null);
    // Schritte: aus der Bewegung zwischen den Bildern abgeleitet, nur am Boden (Höhe bleibt gleich)
    if (alive && actx) {
      const pos = v.g.position;
      if (!v.stepPos) { v.stepPos = pos.clone(); v.lastY = pos.y; v.stepAcc = 0; }
      const grounded = Math.abs(pos.y - v.lastY) < 0.03;
      const moved = Math.hypot(pos.x - v.stepPos.x, pos.z - v.stepPos.z);
      v.stepPos.copy(pos); v.lastY = pos.y;
      if (grounded && moved < 2) {
        v.stepAcc += moved;
        const speed = moved * 60;
        if (v.stepAcc > (speed > 10 ? 2.6 : 2.1)) {
          v.stepAcc = 0;
          const dist = pos.distanceTo(camera.position);
          if (dist < 45) {
            const gain = (v.mate ? 0.35 : 1.1) * (cloak && !v.mate ? 0.45 : 1) * (speed > 10 ? 1.3 : 0.9);
            const d = spatial(pos.clone().setY(pos.y + 0.1), { gain, ref: 3, roll: 1.3, maxDist: 45 });
            if (d) stepSound(d, 1, !v.mate);
          }
        }
      } else v.stepAcc = Math.min(v.stepAcc, 1.5);
    }
    if (alive) {
      const pos = v.g.position;
      const prev = v.animPos || pos.clone();
      const fdt = Math.max(0.001, G.frameDt || 0.016);
      const sp = Math.hypot(pos.x - prev.x, pos.z - prev.z) / fdt;
      const air = Math.abs(pos.y - prev.y) > 0.02 && pos.y > 0.05;
      (v.rig.model ? animateModelCharacter : animateCharacter)(v.rig, Math.min(sp, 25), air, fdt);
      v.animPos = pos.clone();
    }
  }
}

// ---------------------------------------------------------------- Controller (Gamepad-API)
// Standard-Belegung (Xbox / PlayStation): A/✕ Sprung · B/○ Rutschen · X/□ Aufheben, sonst Nachladen · Y/△ Waffe wechseln
// LB/L1 Fähigkeit 1 · RB/R1 Fähigkeit 2 · LT/L2 Zielen · RT/R2 Schießen · L3 Sprinten · Start/Options Menü
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const pad = { active: false, prev: [], sprint: false, navCd: 0, gp: null };
addEventListener('gamepadconnected', (e) => {
  pad.active = true;
  if (game) pushFeed(t('pad.connected', { name: e.gamepad.id.split('(')[0].trim() }), 'me');
  else $('netErr').textContent = t('pad.menu');
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
  const screen = ['settings', 'overlay', 'lobby', 'menu'].map($).find((el) => !el.classList.contains('hidden'));
  if (!screen) return;
  const items = [...screen.querySelectorAll('button:not(:disabled), input, summary')].filter((el) => el.offsetParent !== null && !el.closest('.readonly'));
  if (!items.length) return;
  let i = items.indexOf(document.activeElement);
  // Grafikmenü: links/rechts ändert den Wert der gewählten Option, B geht zurück
  const cur = items[i];
  if (screen.id === 'settings') {
    if (P.edge(BTN.B)) { $('setBack').click(); return; }
    const h = P.edge(BTN.RIGHT) || (pad.navCd <= 0 && P.lx > 0.6) ? 1 : P.edge(BTN.LEFT) || (pad.navCd <= 0 && P.lx < -0.6) ? -1 : 0;
    if (h && cur && cur.classList.contains('cyc') && cur.dataset.k) { pad.navCd = 0.22; cur.dispatchEvent(new MouseEvent('click', { shiftKey: h < 0 })); return; }
  }
  const dir = P.edge(BTN.DOWN) || P.edge(BTN.RIGHT) || (pad.navCd <= 0 && (P.ly > 0.6 || P.lx > 0.6)) ? 1
    : P.edge(BTN.UP) || P.edge(BTN.LEFT) || (pad.navCd <= 0 && (P.ly < -0.6 || P.lx < -0.6)) ? -1 : 0;
  if (dir) { pad.navCd = 0.22; i = i < 0 ? 0 : (i + dir + items.length) % items.length; items[i].focus(); }
  if (P.edge(BTN.A) && i >= 0) { initAudio(); items[i].click(); }
  if (P.edge(BTN.B) && screen.id === 'overlay' && game && !game.over && !game.eliminatedPlace) $('ovResume').click();
}
// ---------------------------------------------------------------- Zielhilfe (nur Controller)
// Stärke je Einstellung: Aus, Niedrig, Standard, Stark
const ASSIST_K = [0, 0.5, 0.8, 1.1];
const wrapAng = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** Nächster sichtbarer Gegner nahe am Fadenkreuz: { dyaw, dpitch, err, cone, d } oder null */
function assistTarget(coneMul = 1) {
  const G = game;
  if (!G || !G.last) return null;
  const cp = camera.position;
  let best = null;
  for (const e of G.last.ents) {
    if (e[0] === G.you || !(e[7] & 1) || G.meta.get(e[0])?.team === G.myTeam || (e[7] & 4)) continue;
    const dx = e[1] - cp.x, dy = e[2] + 1.1 - cp.y, dz = e[3] - cp.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > 110 || d < 0.8) continue;
    const dyaw = wrapAng(Math.atan2(-dx, -dz) - yaw), dpitch = Math.asin(dy / d) - pitch;
    const err = Math.hypot(dyaw, dpitch);
    const cone = Math.max(0.05, 1.6 / d) * coneMul;
    if (err > cone || (best && err >= best.err)) continue;
    if (rayWorld([cp.x, cp.y, cp.z], [dx / d, dy / d, dz / d], d, G.world.boxes.concat(G.walls)) < d - 0.6) continue; // verdeckt
    best = { dyaw, dpitch, err, cone, d };
  }
  return best;
}
/**
 * Zielhilfe wie in Konsolen-Shootern:
 * - Bremsen: der rechte Stick wird langsamer, solange das Fadenkreuz auf einem Gegner liegt
 * - Mitziehen: bewegt man sich, zielt oder schießt, folgt der Blick einem Gegner nahe am Fadenkreuz ein Stück
 * - Anvisieren: beim Drücken von LT springt der Blick ein Stück Richtung Gegner
 * Gibt den Bremsfaktor für den rechten Stick zurück.
 */
function aimAssist(P, dt, firing) {
  const k = ASSIST_K[gfx.assist] || 0;
  if (!k) return 1;
  if (P.edge(BTN.LT)) pad.snapT = 0.16;
  pad.snapT = Math.max(0, (pad.snapT || 0) - dt);
  const tg = assistTarget(pad.snapT > 0 ? 2.4 : 1 + 0.4 * k);
  if (!tg) return 1;
  const near = 1 - tg.err / tg.cone; // 0 am Rand, 1 in der Mitte
  let pull = 0;
  if (pad.snapT > 0) pull = 9 * k;
  else if (Math.abs(P.lx) + Math.abs(P.ly) > 0.2 || Math.abs(P.rx) + Math.abs(P.ry) > 0.1 || firing || P.now[BTN.LT]) pull = 3.2 * k * near;
  const a = Math.min(1, pull * dt);
  yaw += tg.dyaw * a;
  pitch = clamp(pitch + tg.dpitch * a, -1.5, 1.5);
  return 1 - 0.45 * k * near;
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
    zip: pressed.has('KeyF') && !G.nearLoot,
    fire: locked && !paused && mouseDown, aim: locked && !paused && rightDown, reload: k('KeyR'),
    use: pressed.has('KeyF'), useHeld: k('KeyF'), q: pressed.has('KeyQ'), e: pressed.has('KeyE'),
    w1: pressed.has('Digit1'), w2: pressed.has('Digit2'), swap: wheelSwap, wr: gfx.wallrun,
  };
  pressed = new Set();
  wheelSwap = false;
  if (P && !paused && $('overlay').classList.contains('hidden')) {
    const zoomed = P.now[BTN.LT] && G.me.weapons[G.me.cur] && WEAPONS[G.me.weapons[G.me.cur][0]].zoom;
    const curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.6);
    const s = 3.2 * sens * dt * (zoomed ? 0.35 : P.now[BTN.LT] ? 0.6 : 1) * aimAssist(P, dt, P.now[BTN.RT]);
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
    const zipNear = !G.nearLoot && G.world.ziplines.length && nearZipline(G.pred, G.world.ziplines, 6);
    const nearSomething = !!G.nearLoot || (G.me.ghost && G.me.nearBeacon) || !!zipNear;
    inp.zip ||= P.edge(BTN.X) && !!zipNear;
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
canvas.addEventListener('click', () => { if (game && !paused) lockPointer(); });
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
    $('ovTitle').textContent = conn.online ? t('ov.menuOnline') : t('ov.pause');
    $('ovText').textContent = '';
    $('ovResume').textContent = t('ov.resume'); $('ovQuit').textContent = t('ov.quit');
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
    mm.fillStyle = st === '2' ? '#e5484d55' : st === '1' ? (Math.sin(t * 6) > 0 ? '#d9a44155' : '#d9a44128') : '#ffffff06';
    mm.fillRect(sx, sz, SECTOR * S, SECTOR * S);
    mm.strokeStyle = '#ffffff12';
    mm.strokeRect(sx, sz, SECTOR * S, SECTOR * S);
  }
  mm.fillStyle = '#c8ccd240';
  for (const b of G.world.boxes) {
    if (b.gone || b.kind !== 'building') continue;
    mm.fillRect((b.mn[0] + HALF) * S, (b.mn[2] + HALF) * S, (b.mx[0] - b.mn[0]) * S, (b.mx[2] - b.mn[2]) * S);
  }
  if (s.me && s.me.ghost) for (const b of s.me.beacons) { mm.fillStyle = '#46b98a'; mm.beginPath(); mm.arc((b[0] + HALF) * S, (b[1] + HALF) * S, 4, 0, 7); mm.fill(); }
  if (s.core) { mm.fillStyle = '#d9a441'; mm.beginPath(); mm.arc((s.core.x + HALF) * S, (s.core.z + HALF) * S, 5, 0, 7); mm.fill(); }
  for (const e of s.ents) {
    if (e[0] === G.you) continue;
    const meta = G.meta.get(e[0]);
    const mate = meta.team === G.myTeam;
    if (mate && (e[7] & 3)) { mm.fillStyle = e[7] & 1 ? '#46b98a' : '#46b98a66'; mm.beginPath(); mm.arc((e[1] + HALF) * S, (e[3] + HALF) * S, 3.5, 0, 7); mm.fill(); }
    else if (!mate && (e[7] & 1) && (e[7] & 16)) { mm.fillStyle = '#e5484d'; mm.fillRect((e[1] + HALF) * S - 2, (e[3] + HALF) * S - 2, 4, 4); }
  }
  const px = (G.pred.pos.x + HALF) * S, pz = (G.pred.pos.z + HALF) * S;
  mm.save(); mm.translate(px, pz); mm.rotate(-yaw);
  mm.fillStyle = '#e7e6e1';
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
  // Vitalkern: Lebensring (270°), heller Schweif zeigt den eben verlorenen Teil, Rüstung in vier Zellen
  const hpF = clamp(me.hp / 100, 0, 1);
  $('hpArc').setAttribute('stroke-dasharray', `${(75 * hpF).toFixed(2)} 100`);
  $('hpLag').setAttribute('stroke-dasharray', `${(75 * hpF).toFixed(2)} 100`);
  for (let i = 0; i < 4; i++) {
    const f = clamp((me.armor - i * 25) / 25, 0, 1);
    $('aseg' + i).setAttribute('stroke-dasharray', `${(17 * f).toFixed(2)} 100`);
  }
  $('hpNum').textContent = Math.max(0, me.hp);
  $('armorNum').textContent = me.armor;
  const vit = $('vitals');
  vit.classList.toggle('low', me.hp < 30);
  vit.classList.toggle('mid', me.hp >= 30 && me.hp < 60);
  if (G.lastHp !== undefined && me.hp < G.lastHp) { vit.classList.remove('hit'); void vit.offsetWidth; vit.classList.add('hit'); }
  G.lastHp = me.hp;
  vit.title = t('hud.hp', { hp: me.hp, armor: me.armor });
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
  $('teamsLeft').textContent = MODES[G.mode].size > 1 ? ' · ' + t('hud.teams', { n: teamsAlive }) : '';
  $('kills').textContent = me.kills;
  $('ping').textContent = conn.online ? `${pingMs} ms` : t('hud.offline');

  const ph = $('phase');
  if (s.core) { $('phaseTitle').textContent = t('hud.final'); $('phaseTimer').textContent = t('hud.holdCore'); ph.classList.remove('warn'); }
  else if (s.warn) { $('phaseTitle').textContent = t('hud.decayN', { n: s.warn }); $('phaseTimer').textContent = fmt(s.nextAt - s.time); ph.classList.add('warn'); }
  else { $('phaseTitle').textContent = t('hud.nextDecay', { n: s.wave + 1 }); $('phaseTimer').textContent = fmt(s.nextAt - WARN - s.time); ph.classList.remove('warn'); }

  if (s.ev) { $('event').classList.remove('hidden'); $('event').innerHTML = `<b>${esc(t('e.' + s.ev.id))}</b> · ${esc(t('e.' + s.ev.id + '.d'))} · ${s.ev.t} s`; }
  else $('event').classList.add('hidden');

  if (s.core) {
    $('corebar').classList.remove('hidden');
    const mine = s.core.prog[G.myTeam] || 0;
    let leader = -1, lv = 0;
    for (const [t, v] of Object.entries(s.core.prog)) if (v > lv) { lv = v; leader = +t; }
    $('coreFill').style.width = `${(mine / CORE_TIME) * 100}%`;
    const teamMode = MODES[G.mode].size > 1;
    $('coreText').textContent = t('hud.coreMine', { who: teamMode ? t('hud.yourTeam') : t('hud.you'), v: mine.toFixed(0), max: CORE_TIME })
      + (leader >= 0 && leader !== G.myTeam ? ` · ${teamMode ? t('lobby.team', { n: leader + 1 }) : t('hud.enemy')} ${lv.toFixed(0)} s` : '') + (s.core.c ? t('hud.contested') : '');
  }

  for (let i = 0; i < 2; i++) {
    const w = me.weapons[i], el = $('wp' + i);
    el.classList.toggle('active', i === me.cur);
    if (!w) { el.innerHTML = `<span>${i + 1} · ${t('hud.empty')}</span>`; continue; }
    const W = WEAPONS[w[0]];
    const ammo = me.reloading > 0 && i === me.cur ? '…' : `${w[2]}/${lvlMag(W, w[1])}`;
    el.innerHTML = `<span class="ammo">${ammo}</span>${i + 1} · ${W.name} <span class="lvl">${LEVEL_NAMES[w[1]]}</span><br><small>${wName(w[0])}</small>`;
  }
  for (let i = 0; i < 2; i++) {
    const a = me.abilities[i], el = $('ab' + i);
    const key = keyLabel(i ? 'E' : 'Q');
    el.classList.toggle('empty', !a);
    if (!a) { el.innerHTML = `<span class="key">${key}</span> ${t('hud.empty')}`; continue; }
    const A = ABILITIES[a[0]];
    const full = abilityCd({ id: a[0], level: a[1] });
    el.innerHTML = `<span class="key">${key}</span> ${aName(a[0])} <span class="lvl" style="color:#ffd34d">${LEVEL_NAMES[a[1]]}</span><br><small>${a[2] > 0 ? a[2].toFixed(1) + ' s' : t('hud.ready')}</small><div class="cd" style="width:${a[2] > 0 ? (1 - a[2] / full) * 100 : 100}%"></div>`;
  }
  // Geist
  if (me.ghost) {
    $('ghostInfo').classList.remove('hidden');
    $('ghostInfo').innerHTML = me.soloGhost
      ? (me.nearBeacon ? t('hud.holdRevive', { key: keyLabel('F'), p: Math.floor(me.reviveHold / 3 * 100) }) : t('hud.ghostSolo', { t: fmt(me.ghostT) }))
      : t('hud.ghostTeam');
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
      $('prompt').innerHTML = `<b>${KF}</b> ${W.name} ${LEVEL_NAMES[near.level]} (${esc(wName(near.wid))})${fuse ? ` · <b>${t('hud.fuse')}</b>` : ''}`;
    } else {
      const A = ABILITIES[near.wid];
      const fuse = me.abilities.some((a) => a && a[0] === near.wid && a[1] < 4);
      $('prompt').innerHTML = `<b>${KF}</b> ${t('hud.ability')} ${esc(aName(near.wid))}: ${esc(aDesc(near.wid))}${fuse ? ` · <b>${t('hud.fuse')}</b>` : ''}`;
    }
  } else if (me.alive && G.pred.zlId < 0 && nearZipline(G.pred, G.world.ziplines, 2.2)) {
    $('prompt').innerHTML = `<b>${KF}</b> ${t('hud.zip')}`;
  } else $('prompt').innerHTML = '';
  // Team-Liste
  if (MODES[G.mode].size > 1) {
    const rows = [];
    for (const e of s.ents) {
      const meta = G.meta.get(e[0]);
      if (meta.team !== G.myTeam) continue;
      const cls = e[7] & 1 ? '' : e[7] & 2 ? 'ghost' : 'dead';
      rows.push(`<div class="tm ${cls}">${esc(meta.name)}${e[0] === G.you ? t('lobby.you') : ''}${e[7] & 2 ? t('hud.ghost') : ''}<div class="bar"><div style="width:${e[5]}%"></div></div></div>`);
    }
    $('teamPanel').innerHTML = rows.join('');
  } else $('teamPanel').innerHTML = '';
  drawMinimap(s);
}

// ---------------------------------------------------------------- Hauptschleife
// Vorschau-Stadt im Menü (Abendstimmung)
let preview = null;
function ensurePreview() {
  if (!PHOTO.ready) return; // Vorschau erst mit Foto-Texturen bauen
  if (preview) { if (!preview.root.parent) { scene.add(preview.root); applyTodVisuals('abend'); } return; }
  const world = generateWorld(20240611);
  const root = new THREE.Group();
  applyTodVisuals('abend');
  buildCity(world, root, 'abend');
  scene.add(root);
  preview = { root };
}
function hidePreview() { if (preview && preview.root.parent) scene.remove(preview.root); }
let lastFrame = performance.now();
let pingTimer = 0;
let lastRender = 0, fpsFrames = 0, fpsT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (gfx.fpsCap && now - lastRender < 1000 / gfx.fpsCap - 1) return; // Bildratenbegrenzung
  lastRender = now;
  fpsFrames++;
  if (now - fpsT > 500) { if (gfx.showFps) $('fps').textContent = `${Math.round(fpsFrames * 1000 / (now - fpsT))} FPS`; fpsFrames = 0; fpsT = now; }
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  const P = readPad(dt);
  const menuOpen = ['menu', 'lobby', 'overlay', 'settings'].some((id) => !$(id).classList.contains('hidden'));
  if (P && game && P.edge(BTN.START)) {
    if (!$('overlay').classList.contains('hidden')) { if (!game.over && !game.eliminatedPlace) $('ovResume').click(); }
    else {
      paused = !conn.online;
      $('ovTitle').textContent = conn.online ? t('ov.menuOnline') : t('ov.pause');
      $('ovText').textContent = '';
      $('ovResume').textContent = t('ov.resume'); $('ovQuit').textContent = t('ov.quit');
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
      game.frameDt = dt;
      syncWorld(dt);
      renderEntities();
      updateFx(dt);
      updateDamageNumbers(dt);
      updateCamera(dt);
      updateHud(dt);
    }
  } else if (!game) {
    // Menü: langsamer Kameraflug über eine Vorschau-Stadt
    ensurePreview();
    const t = now / 1000;
    camera.position.set(Math.sin(t * 0.03) * 150, 70, Math.cos(t * 0.03) * 150);
    camera.lookAt(0, 20, 0);
  }
  effects.update(dt);
  setVisualTime(now / 1000);
  if (game && game.city) game.city.tick(now / 1000);
  env.follow(camera.position, now / 1000);
  if (usePipeline) composer.render(); else renderer.render(scene, camera);
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
  updateListener();
  // eigene Schritte (leise, nicht räumlich)
  const Pp = G.pred, hsp = Math.hypot(Pp.vel.x, Pp.vel.z);
  if (actx && Pp.onGround && !(Pp.slideT > 0) && hsp > 2 && me.alive) {
    G.ownStep = (G.ownStep || 0) + hsp * dt;
    if (G.ownStep > (hsp > 10 ? 2.6 : 2.1)) { G.ownStep = 0; stepSound(master, 0.35, false); }
  }
  G.camOffset.multiplyScalar(Math.max(0, 1 - dt * 12));
  const P = G.pred;
  const eye = P.slideT > 0 && P.onGround ? 0.9 : EYE;
  G.landDip = Math.max(0, G.landDip - dt * 1.6);
  const dip = Math.sin(Math.min(1, G.landDip / 0.45) * Math.PI) * G.landDip;
  G.shake = Math.max(0, G.shake - dt * 2.5);
  const sk = gfx.shake ? G.shake * G.shake * 0.35 : 0;
  camera.position.set(P.pos.x + G.camOffset.x + (Math.random() - 0.5) * sk, P.pos.y + eye - dip + G.camOffset.y + (Math.random() - 0.5) * sk, P.pos.z + G.camOffset.z + (Math.random() - 0.5) * sk);
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
  const target = zoomed ? 28 : aiming ? gfx.fov * 0.8 : gfx.fov + clamp((hspeed - 8.5) * 0.9, 0, 16);
  camera.fov += (target - camera.fov) * Math.min(1, 12 * dt);
  camera.updateProjectionMatrix();
  G.recoil = Math.max(0, G.recoil - dt * 8);
  if (G.viewModel) {
    G.viewModel.visible = !zoomed;
    const speed = Math.hypot(G.pred.vel.x, G.pred.vel.z);
    const bob = G.pred.onGround ? Math.sin(performance.now() / (sprint ? 70 : 100)) * speed * 0.002 : 0;
    // Waffe schwingt beim Umsehen leicht nach
    const sw = G.sway;
    let dyaw = yaw - sw.yaw; if (dyaw > Math.PI) dyaw -= 2 * Math.PI; else if (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    sw.x += (clamp(dyaw * 2.5, -0.06, 0.06) - sw.x) * Math.min(1, dt * 10);
    sw.y += (clamp((pitch - sw.pitch) * 2.5, -0.05, 0.05) - sw.y) * Math.min(1, dt * 10);
    sw.yaw = yaw; sw.pitch = pitch;
    G.viewModel.position.x = 0.19 + sw.x;
    G.viewModel.position.y = -0.155 + bob - G.recoil * 0.03 - sw.y;
    G.viewModel.position.z = G.viewModel.userData.z + G.recoil * 0.05;
    G.viewModel.rotation.x = me.reloading > 0 ? -0.6 : G.recoil * 0.15;
  }
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- Grafikmenü
const onoff = (v) => t(v ? 'gq.on' : 'gq.off');
const pct = (v) => `${Math.round(v * 100)} %`;
const GFX_ROWS = [
  { group: 'gfx.g.display' },
  { k: 'scale', vals: [0.5, 0.67, 0.75, 0.85, 1, 1.25, 1.5, 2], fmt: pct, preset: true },
  { k: 'fov', vals: [60, 65, 70, 75, 78, 80, 85, 90, 95, 100, 105, 110], fmt: (v) => `${v}°` },
  { k: 'brightness', vals: [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5], fmt: pct },
  { k: 'fpsCap', vals: [0, 30, 60, 75, 120, 144, 165, 240], fmt: (v) => (v ? `${v} FPS` : t('gq.unlimited')) },
  { k: 'showFps', vals: [false, true], fmt: onoff },
  { k: 'fullscreen', action: true },
  { group: 'gfx.g.quality' },
  { k: 'tex', vals: ['1k', '2k', '4k'], fmt: (v) => v.toUpperCase(), preset: true, restart: true },
  { k: 'shadows', vals: [0, 1, 2, 3], fmt: (v) => t(['gq.off', 'gq.low', 'gq.mid', 'gq.high'][v]), preset: true },
  { k: 'aa', vals: [0, 2, 4, 8], fmt: (v) => (v ? `MSAA ${v}×` : t('gq.off')), preset: true },
  { k: 'ao', vals: [false, true], fmt: onoff, preset: true },
  { k: 'bloom', vals: [false, true], fmt: onoff, preset: true },
  { k: 'grade', vals: [false, true], fmt: onoff, preset: true },
  { k: 'aniso', vals: [1, 2, 4, 8, 16], fmt: (v) => `${v}×`, preset: true, restart: true },
  { k: 'draw', vals: [0.6, 0.7, 0.85, 1, 1.3, 1.6], fmt: pct, preset: true },
  { k: 'effects', vals: [0, 1], fmt: (v) => t(v ? 'gq.high' : 'gq.low'), preset: true },
  { group: 'gfx.g.comfort' },
  { k: 'shake', vals: [true, false], fmt: onoff },
  { group: 'gfx.g.audio' },
  { k: 'audioOut', vals: () => audioDevices.map((d) => d.id), fmt: (v) => audioDevices.find((d) => d.id === v)?.label || t('gq.default') },
  { k: 'audioMode', vals: ['hp', 'stereo', 'mono'], fmt: (v) => t('gq.am.' + v) },
  { group: 'gfx.g.control' },
  { k: 'assist', vals: [0, 1, 2, 3], fmt: (v) => t(['gq.off', 'gq.low', 'gq.std', 'gq.strong'][v]) },
  { k: 'wallrun', vals: [1, 2, 0], fmt: (v) => t(['gq.off', 'gq.wrHold', 'gq.wrAuto'][v]) },
];
let settingsFrom = 'menu', gfxAtOpen = null;
function openSettings() {
  refreshAudioDevices().then(() => { if (!$('settings').classList.contains('hidden')) renderSettings(); });
  settingsFrom = ['overlay', 'menu', 'lobby'].find((id) => !$(id).classList.contains('hidden')) || (game ? 'overlay' : 'menu');
  gfxAtOpen = { tex: gfx.tex, aniso: gfx.aniso };
  renderSettings();
  showScreen('settings');
  if (game) $('hud').classList.remove('hidden');
  $('setPresets').querySelector('button')?.focus();
}
function renderSettings() {
  const pr = $('setPresets');
  pr.innerHTML = '';
  for (const p of [...Object.keys(GFX_PRESETS), 'custom']) {
    const b = document.createElement('button');
    b.textContent = p === 'custom' ? t('gfx.custom') : t('gfx.p.' + p);
    b.classList.toggle('on', gfx.preset === p);
    if (p === 'custom') b.disabled = true;
    else b.onclick = () => { Object.assign(gfx, GFX_PRESETS[p]); gfx.preset = p; saveGfx(); applyGfx(); renderSettings(); renderFxBtn(); };
    pr.appendChild(b);
  }
  const box = $('setRows');
  box.innerHTML = '';
  for (const row of GFX_ROWS) {
    if (row.group) { const h = document.createElement('h3'); h.textContent = t(row.group); box.appendChild(h); continue; }
    const r = document.createElement('div');
    r.className = 'setrow';
    const label = document.createElement('span');
    label.textContent = t('gfx.' + row.k) + (row.restart ? ' *' : '');
    const b = document.createElement('button');
    b.className = 'cyc';
    if (row.action) {
      b.textContent = document.fullscreenElement ? t('gq.on') : t('gq.off');
      b.onclick = () => { (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.then?.(() => renderSettings()).catch?.(() => {}); setTimeout(renderSettings, 300); };
    } else {
      b.innerHTML = `<i>‹</i>${esc(row.fmt(gfx[row.k]))}<i>›</i>`;
      const step = (dir) => {
        const vals = typeof row.vals === 'function' ? row.vals() : row.vals;
        const i = vals.indexOf(gfx[row.k]);
        gfx[row.k] = vals[((i < 0 ? 0 : i) + dir + vals.length) % vals.length];
        if (row.preset) gfx.preset = 'custom';
        saveGfx(); applyGfx(); renderSettings(); renderFxBtn();
        $('setRows').querySelector(`[data-k="${row.k}"]`)?.focus();
      };
      b.onclick = (e) => step(e.shiftKey ? -1 : 1);
      b.oncontextmenu = (e) => { e.preventDefault(); step(-1); };
      b.dataset.k = row.k;
    }
    r.append(label, b);
    box.appendChild(r);
  }
  const needRestart = gfxAtOpen && (gfxAtOpen.tex !== gfx.tex || gfxAtOpen.aniso !== gfx.aniso);
  $('setNote').textContent = needRestart ? t('gfx.restart') : t('gfx.hint');
}
$('setBack').onclick = () => {
  const needRestart = gfxAtOpen && (gfxAtOpen.tex !== gfx.tex || gfxAtOpen.aniso !== gfx.aniso);
  if (needRestart && !game) { location.reload(); return; } // Texturen neu laden
  showScreen(settingsFrom);
  if (game) $('hud').classList.remove('hidden');
};
$('ovGfx').onclick = () => openSettings();
applyGfx();

// ---------------------------------------------------------------- Erster Start: Sprache wählen
function showLangPick() {
  const box = $('langButtons');
  box.innerHTML = '';
  const suggested = guessLang();
  lang = null;
  for (const [k, name] of Object.entries(LANGS)) {
    const b = document.createElement('button');
    b.textContent = name;
    b.dataset.lang = k;
    if (k === suggested) b.classList.add('suggested');
    b.onclick = () => { setLang(k); showScreen('menu'); };
    box.appendChild(b);
  }
  // Überschrift zweisprachig: vorgeschlagene Sprache + Englisch
  lang = suggested;
  applyI18n();
  lang = null;
  showScreen('langPick');
  box.querySelector('.suggested')?.focus();
}
if (lang) showScreen('menu'); else showLangPick();

// Für automatisierte Tests
window.__zz = {
  get game() { return game; }, get conn() { return conn; }, get lobby() { return lobby; },
  keys, pad, get lang() { return lang; }, models: MODELS,
  playSeed: (seed, mode = 'solo') => { initAudio(); if (conn) conn.close(); conn = new LocalConn(onMessage); conn.start(mode, botConfig, playerName(), seed); },
  setLook: (y, p) => { yaw = y; pitch = p; }, getLook: () => [yaw, pitch], assistTarget: (m) => assistTarget(m), camPos: () => camera.position.toArray(), press: (code) => pressed.add(code), setMouse: (d) => { mouseDown = d; },
};

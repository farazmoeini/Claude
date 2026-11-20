// Zerfallzone – eigene 3D-Modelle (GLB) laden: Figuren mit Animationen und Waffen in der Hand.
// Ohne public/models/manifest.json werden die eingebauten, prozeduralen Figuren verwendet.
// Aufbau der manifest.json: siehe public/models/README.md
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export const MODELS = { ready: false, character: null, weapons: {}, manifest: null, promise: Promise.resolve() };

const CLIP_GUESS = {
  idle: /idle|stand|breath/i,
  run: /run|sprint|jog/i,
  walk: /walk/i,
  jump: /jump|fall|air/i,
};

/** Lädt das Modellpaket, falls vorhanden. Fehler werden protokolliert, das Spiel läuft mit eingebauten Figuren weiter. */
export function loadModelPack(base = 'models/') {
  // höchstens 20 s warten, danach mit eingebauten Figuren weiter
  MODELS.promise = Promise.race([loadPack(base), new Promise((r) => setTimeout(r, 20000))]);
  return MODELS.promise;
}
async function loadPack(base) {
  let manifest;
  try {
    const r = await fetch(base + 'manifest.json', { cache: 'no-cache' });
    if (!r.ok) return MODELS;
    manifest = await r.json();
  } catch { return MODELS; }
  const loader = new GLTFLoader();
  const load = (file) => new Promise((res, rej) => loader.load(base + file, res, undefined, rej));
  try {
    const cache = new Map();
    const loadOnce = (file) => { if (!cache.has(file)) cache.set(file, load(file)); return cache.get(file); };
    if (manifest.character && manifest.character.file) {
      const g = await loadOnce(manifest.character.file);
      const cfg = { ...manifest.character };
      // Größe automatisch: genaue Höhe inkl. Skelett messen und auf die gewünschte Körpergröße bringen
      if (cfg.height) {
        g.scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(g.scene, true);
        const h = box.max.y - box.min.y;
        if (h > 0) { cfg.scale = cfg.height / h; cfg.offsetY = cfg.offsetY ?? -box.min.y * cfg.scale; }
      }
      MODELS.character = { scene: g.scene, clips: g.animations, cfg };
      if (cfg.weapon) { try { MODELS.handWeapon = (await loadOnce(cfg.weapon)).scene; } catch (e) { console.warn('Handwaffe fehlt:', e.message || e); } }
    }
    for (const [id, cfg] of Object.entries(manifest.weapons || {})) {
      try { const g = await loadOnce(cfg.file); MODELS.weapons[id] = { scene: g.scene, cfg }; } catch (e) { console.warn('Waffenmodell fehlt:', id, e.message || e); }
    }
    MODELS.manifest = manifest;
    MODELS.ready = true;
  } catch (e) { console.warn('Modellpaket konnte nicht geladen werden:', e.message || e); }
  return MODELS;
}

function findClip(clips, cfgName, guess) {
  if (cfgName) { const c = clips.find((x) => x.name === cfgName); if (c) return c; }
  return clips.find((x) => guess.test(x.name)) || null;
}

/** Figur aus dem Modellpaket. Gibt dasselbe Grundgerüst zurück wie makeCharacter (group, mats, gun, kick). */
export function makeModelCharacter(teamCol, accent, outlineCol) {
  const M = MODELS.character;
  const cfg = M.cfg;
  const inner = cloneSkinned(M.scene);
  const s = cfg.scale ?? 1;
  inner.scale.setScalar(s);
  inner.rotation.y = cfg.rotY ?? Math.PI; // die meisten Pakete schauen nach +z, das Spiel nach −z
  if (cfg.offsetY) inner.position.y = cfg.offsetY;
  const group = new THREE.Group();
  group.add(inner);
  const mats = [];
  const tintNames = (cfg.tintMaterials || []).map((n) => n.toLowerCase());
  inner.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.frustumCulled = false; // gehäutete Modelle haben sonst falsche Grenzen
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const cloned = list.map((m) => {
      const c = m.clone();
      c.transparent = true;
      const name = (m.name || '').toLowerCase();
      if (tintNames.length ? tintNames.some((n) => name.includes(n)) : /team|accent|main|primary/.test(name)) {
        if (c.color) c.color.set(teamCol);
        if (c.emissive) { c.emissive.set(teamCol); c.emissiveIntensity = 0.25; }
      }
      mats.push(c);
      return c;
    });
    o.material = Array.isArray(o.material) ? cloned : cloned[0];
  });
  // Waffe an die rechte Hand hängen, wenn ein Knochen dafür bekannt ist
  const gun = new THREE.Group();
  const handName = cfg.handBone || 'hand_r';
  let hand = null;
  inner.traverse((o) => { if (!hand && o.isBone && o.name.toLowerCase().replace(/[^a-z_]/g, '').includes(handName.toLowerCase())) hand = o; });
  (hand || group).add(gun);
  if (!hand) gun.position.set(0.2, 1.2, -0.4);
  if (MODELS.handWeapon) {
    group.updateMatrixWorld(true);
    const ws = new THREE.Vector3(); (hand || group).getWorldScale(ws);
    const w = fitLength(MODELS.handWeapon.clone(true), cfg.weaponLength ?? 0.55);
    const holder = new THREE.Group();
    holder.add(w);
    holder.scale.setScalar(1 / (ws.x || 1));
    if (cfg.weaponRot) holder.rotation.set(...cfg.weaponRot);
    if (cfg.weaponPos) holder.position.set(...cfg.weaponPos.map((v) => v / (ws.x || 1)));
    gun.add(holder);
  }
  const mixer = new THREE.AnimationMixer(inner);
  const clipNames = cfg.clips || {};
  const actions = {};
  for (const k of Object.keys(CLIP_GUESS)) {
    const clip = findClip(M.clips, clipNames[k], CLIP_GUESS[k]);
    if (clip) actions[k] = mixer.clipAction(clip);
  }
  const first = actions.idle || actions.run || actions.walk;
  if (first) first.play();
  return { group, mats, gun, kick: 0, model: true, mixer, actions, current: first, chest: inner, outlineCol };
}

/** Zwischen Stehen, Gehen, Laufen und Sprung überblenden */
export function animateModelCharacter(rig, speed, airborne, dt) {
  const want = airborne && rig.actions.jump ? 'jump' : speed > 7 && rig.actions.run ? 'run' : speed > 1.5 ? (rig.actions.walk ? 'walk' : rig.actions.run ? 'run' : 'idle') : 'idle';
  const next = rig.actions[want] || rig.current;
  if (next && next !== rig.current) {
    next.reset().play();
    if (rig.current) next.crossFadeFrom(rig.current, 0.18, false);
    rig.current = next;
  }
  if (rig.current === rig.actions.run || rig.current === rig.actions.walk) rig.current.timeScale = Math.max(0.6, speed / (rig.current === rig.actions.run ? 9 : 5));
  rig.kick = Math.max(0, rig.kick - dt * 8);
  rig.mixer.update(dt);
}

/** Modell so skalieren, dass seine längste Seite `len` Meter misst, und um den Ursprung zentrieren */
function fitLength(o, len) {
  o.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const s = len / Math.max(size.x, size.y, size.z, 1e-6);
  const wrap = new THREE.Group();
  o.position.sub(c);
  wrap.add(o);
  wrap.scale.setScalar(s);
  wrap.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
  return wrap;
}
/** Waffe in der Hand aus dem Modellpaket (für die Ich-Ansicht); null, wenn keine vorhanden */
export function makeModelWeapon(id) {
  const W = MODELS.weapons[id];
  if (!W) return null;
  const c = W.cfg;
  const o = c.length ? fitLength(W.scene.clone(true), c.length) : W.scene.clone(true);
  if (!c.length) o.scale.setScalar(c.scale ?? 1);
  if (c.rot) o.rotation.set(...c.rot);
  if (c.pos) o.position.set(...c.pos);
  o.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.frustumCulled = false; } });
  const g = new THREE.Group();
  g.add(o);
  return g;
}

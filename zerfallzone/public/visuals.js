// Zerfallzone – Grafik: Tageszeiten, Himmel, Stadt-Architektur, Straßen, Figuren und Effekte.
// Eigener Stil. Alles wird prozedural erzeugt; Kollisionen kommen unverändert aus shared/sim.js.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { HALF, SECTOR, NS, NODE, ROAD, ALLEY, LOT, LOT_OFF, districtOf } from './shared/sim.js';

// ---------------------------------------------------------------- Farbabstimmung (letzter Bildschritt)
export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, lift: { value: new THREE.Vector3() }, gamma: { value: new THREE.Vector3(1, 1, 1) }, gain: { value: new THREE.Vector3(1, 1, 1) },
    saturation: { value: 1 }, contrast: { value: 1 }, vignette: { value: 0.25 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 lift; uniform vec3 gamma; uniform vec3 gain; uniform float saturation; uniform float contrast; uniform float vignette;
    varying vec2 vUv;
    void main(){
      vec4 t = texture2D(tDiffuse, vUv); vec3 c = t.rgb;
      c = c * gain + lift * (1.0 - c);
      c = pow(max(c, 0.0), 1.0 / gamma);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      c = (c - 0.5) * contrast + 0.5;
      float v = smoothstep(0.9, 0.3, distance(vUv, vec2(0.5)));
      c *= mix(1.0 - vignette, 1.0, v);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), t.a);
    }`,
};
// gemeinsame Zeit für animierte Materialien (Zerfall-Glitch, Blinklichter)
const TIME = { value: 0 };
export function setVisualTime(t) { TIME.value = t; }

// ---------------------------------------------------------------- Tageszeiten
export const TODS = {
  tag: {
    phys: { turbidity: 3, rayleigh: 1.1, mie: 0.004, g: 0.8, elev: 52, azim: 140, gain: 0.55 },
    sky: { top: 0x2c6cd0, hor: 0xcfe3f6, gnd: 0x8c96a2, sun: 0xfff1d0, clouds: 0.5, stars: 0, disc: 1.0 },
    sunDir: [0.45, 0.82, 0.35], sunCol: 0xfff4e6, sunInt: 3.4, hemiSky: 0xc9dcf2, hemiGround: 0x6e655a, hemiInt: 0.55,
    fog: 0xbcd0e3, fogDensity: 0.0016, exposure: 0.95, windows: 0.0, lamps: 0.05, neon: 0.0, signs: 0.3, bloom: [0.05, 0.3, 0.97], envInt: 1.0, hdrScale: 0.8,
    grade: { lift: [0, 0, 0.005], gamma: [1, 1, 1], gain: [1.01, 1.0, 0.98], sat: 1.04, contrast: 1.05, vignette: 0.18 },
  },
  abend: {
    phys: { turbidity: 7, rayleigh: 2.6, mie: 0.006, g: 0.93, elev: 5, azim: 250, gain: 0.5 },
    sky: { top: 0x1f2f68, hor: 0xffa565, gnd: 0x5a4252, sun: 0xffb070, clouds: 0.45, stars: 0.1, disc: 1.4 },
    sunDir: [-0.78, 0.13, 0.35], sunCol: 0xffa766, sunInt: 2.6, hemiSky: 0xf2b8a0, hemiGround: 0x3b2c3a, hemiInt: 0.45,
    fog: 0xc99782, fogDensity: 0.0022, exposure: 1.0, windows: 0.5, lamps: 0.7, neon: 0.5, signs: 0.9, bloom: [0.22, 0.4, 0.9], envInt: 0.9, hdrScale: 0.7,
    grade: { lift: [0.012, 0.0, 0.02], gamma: [1, 1.01, 1.03], gain: [1.05, 0.99, 0.94], sat: 1.05, contrast: 1.06, vignette: 0.24 },
  },
  nacht: {
    phys: null,
    sky: { top: 0x02040c, hor: 0x1a2046, gnd: 0x07080f, sun: 0xb8ccff, clouds: 0.25, stars: 1, disc: 0.55 },
    sunDir: [0.32, 0.55, -0.5], sunCol: 0xa9c0ff, sunInt: 0.9, hemiSky: 0x5a6ab0, hemiGround: 0x1d1a28, hemiInt: 0.8,
    fog: 0x141a3a, fogDensity: 0.0028, exposure: 1.35, windows: 1.2, lamps: 1.0, neon: 0.8, signs: 1.4, bloom: [0.5, 0.45, 0.8], envInt: 0.6, hdrScale: 0.12,
    grade: { lift: [0.0, 0.004, 0.018], gamma: [1, 1, 1], gain: [0.97, 0.99, 1.05], sat: 1.05, contrast: 1.08, vignette: 0.3 },
  },
};

const SKY_VS = 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SKY_FS = `
uniform vec3 top; uniform vec3 hor; uniform vec3 gnd; uniform vec3 sunDir; uniform vec3 sunCol;
uniform float clouds; uniform float stars; uniform float disc; uniform float time;
varying vec3 vDir;
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 col = h > 0.0 ? mix(hor, top, pow(smoothstep(0.0, 1.0, h), 0.55)) : mix(hor, gnd, smoothstep(0.0, -0.25, h));
  vec3 sd3 = normalize(sunDir); float sd = max(dot(d, sd3), 0.0);
  col += sunCol * (smoothstep(1.0 - 0.0009 * disc, 1.0 - 0.0006 * disc, sd) * 4.0 + pow(sd, 10.0) * 0.35 + pow(sd, 3.0) * 0.08);
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.12);
    float c = smoothstep(0.48, 0.85, fbm(vec3(uv * 1.4 + vec2(time * 0.004, 0.0), 0.0))) * clouds * smoothstep(0.0, 0.2, h);
    vec3 cc = mix(hor, vec3(1.0), 0.55) * (0.55 + 0.6 * pow(sd, 3.0)) + sunCol * 0.15 * pow(sd, 2.0);
    col = mix(col, cc, c * 0.85);
    float st = step(0.9982, hash(floor(d * 700.0))) * stars * smoothstep(0.04, 0.3, h) * (1.0 - c);
    col += vec3(st);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

/** Licht, Himmel und Nebel; folgt dem Spieler (Schatten nur in seiner Umgebung) */
export function createEnvironment(scene, renderer) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const uniforms = {
    top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, gnd: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() },
    clouds: { value: 0 }, stars: { value: 0 }, disc: { value: 1 }, time: { value: 0 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({ uniforms, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = -1;
  scene.add(sky);
  // physikalisch berechneter Himmel (Rayleigh- und Mie-Streuung) für Tag und Abend
  const phys = new Sky();
  phys.scale.setScalar(1800);
  phys.material.uniforms.gain = { value: 0.55 };
  phys.material.onBeforeCompile = (sh) => {
    sh.uniforms.gain = phys.material.uniforms.gain;
    sh.fragmentShader = sh.fragmentShader.replace('uniform vec3 up;', 'uniform vec3 up;\nuniform float gain;').replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * gain, 1.0 );');
  };
  phys.material.fog = false;
  phys.renderOrder = -1;
  scene.add(phys);
  scene.fog = new THREE.FogExp2(0xffffff, 0.002);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 10; sc.far = 700;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  const env = { sky, hemi, sun, tod: null, preset: null };
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envNight = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), sky.material);
  const envPhys = new Sky(); envPhys.scale.setScalar(200); envPhys.material = phys.material;
  envScene.add(envNight, envPhys);
  let envRT = null;
  /** Stärke der Spiegelungen: HDRIs sind je nach Aufnahme unterschiedlich hell (Nacht-HDRI stark gedämpft) */
  env.updateEnvIntensity = () => {
    const P = env.preset;
    if (!P) return;
    ENV_INT.value = P.envInt * (hdrEnv[env.tod] ? P.hdrScale ?? 1 : 1);
    for (const m of ENV_MATS) m.envMapIntensity = m.userData.envBase * ENV_INT.value;
  };
  // echte Umgebungslichter (Poly Haven, CC0) für Spiegelungen; ohne sie dient der berechnete Himmel
  const HDRI = { tag: 'wide_street_01', abend: 'sunset_jhbcentral', nacht: 'modern_buildings_night' };
  const hdrEnv = {};
  env.hdrPromise = Promise.all(Object.entries(HDRI).map(async ([tod, file]) => {
    try {
      const t = await new RGBELoader().loadAsync(`hdri/${file}_1k.hdr`);
      t.mapping = THREE.EquirectangularReflectionMapping;
      hdrEnv[tod] = pmrem.fromEquirectangular(t).texture;
      t.dispose();
      if (env.tod === tod) { scene.environment = hdrEnv[tod]; env.updateEnvIntensity(); }
    } catch { /* ohne HDRI weiter mit berechnetem Himmel */ }
  }));
  env.apply = (tod) => {
    const P = TODS[tod] || TODS.tag;
    env.tod = tod; env.preset = P;
    uniforms.top.value.set(P.sky.top); uniforms.hor.value.set(P.sky.hor); uniforms.gnd.value.set(P.sky.gnd);
    uniforms.sunCol.value.set(P.sky.sun); uniforms.sunDir.value.set(...P.sunDir).normalize();
    uniforms.clouds.value = P.sky.clouds; uniforms.stars.value = P.sky.stars; uniforms.disc.value = P.sky.disc;
    // Sonnenstand: beim physikalischen Himmel aus Höhe und Richtung, sonst aus der Vorgabe
    if (P.phys) {
      const ph = THREE.MathUtils.degToRad(90 - P.phys.elev), th = THREE.MathUtils.degToRad(P.phys.azim);
      const d = new THREE.Vector3().setFromSphericalCoords(1, ph, th);
      uniforms.sunDir.value.copy(d);
      const u = phys.material.uniforms;
      u.turbidity.value = P.phys.turbidity; u.rayleigh.value = P.phys.rayleigh; u.mieCoefficient.value = P.phys.mie; u.mieDirectionalG.value = P.phys.g;
      u.sunPosition.value.copy(d); u.gain.value = P.phys.gain;
    }
    sky.visible = envNight.visible = !P.phys;
    phys.visible = envPhys.visible = !!P.phys;
    hemi.color.set(P.hemiSky); hemi.groundColor.set(P.hemiGround); hemi.intensity = P.hemiInt;
    sun.color.set(P.sunCol); sun.intensity = P.sunInt;
    scene.fog.color.set(P.fog); scene.fog.density = P.fogDensity / (env.drawScale || 1);
    scene.background = new THREE.Color(P.fog);
    renderer.toneMappingExposure = P.exposure * (env.brightScale || 1);
    // Himmel als Umgebungslicht und für Spiegelungen auf Glas, Metall und Waffen
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene, 0, 1, 1000);
    scene.environment = hdrEnv[tod] || envRT.texture;
    env.updateEnvIntensity();
    hemi.intensity = P.hemiInt;
  };
  env.follow = (pos, t) => {
    uniforms.time.value = t;
    sky.position.copy(pos);
    phys.position.copy(pos);
    // Schattenkamera an ein Raster binden, damit Schatten beim Laufen nicht flimmern
    const g = 4, tx = Math.round(pos.x / g) * g, tz = Math.round(pos.z / g) * g;
    const d = uniforms.sunDir.value;
    sun.target.position.set(tx, 0, tz);
    sun.position.set(tx + d.x * 350, d.y * 350, tz + d.z * 350);
  };
  env.setDrawDistance = (k) => { env.drawScale = k; if (env.preset) scene.fog.density = env.preset.fogDensity / k; };
  env.setBrightness = (k) => { env.brightScale = k; if (env.preset) renderer.toneMappingExposure = env.preset.exposure * k; };
  env.setShadows = (on) => { renderer.shadowMap.enabled = on; sun.castShadow = on; };
  env.setShadowSize = (n) => { if (sun.shadow.mapSize.x === n) return; sun.shadow.mapSize.set(n, n); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } };
  env.apply('tag');
  return env;
}

// ---------------------------------------------------------------- Texturen
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  return t;
}
function grain(g, w, h, amount, alpha = 0.06) {
  for (let i = 0; i < amount; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha * 0.7})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}
const ENV_INT = { value: 0.5 };
const ENV_MATS = new Set();
/** Material für Himmelsspiegelungen anmelden (Stärke je Material × Stärke der Tageszeit) */
export function envMat(m, base) { m.userData.envBase = base; m.envMapIntensity = base * ENV_INT.value; ENV_MATS.add(m); return m; }
// ---------------------------------------------------------------- Foto-Texturen (Poly Haven, CC0) – siehe public/ASSETS-LICENSES.md
const PHOTO_IDS = ['asphalt_02', 'concrete_pavers_02', 'white_plaster_rough_02', 'concrete_panels', 'worn_corrugated_iron', 'gravel_concrete', 'rough_concrete'];
export const PHOTO = { ready: false, img: {}, promise: null, res: '1k' };
let MAX_ANISO = 8;
export function setMaxAnisotropy(n) { MAX_ANISO = Math.max(1, Math.min(16, n | 0)); }
/** Lädt die Foto-Texturen einmal in der gewählten Auflösung (1k liegt im Spiel, 2k/4k per `npm run assets`).
 *  Fehlen sie, zeichnet das Spiel weiter seine eigenen Texturen. */
export function loadPhotoTextures(res = '1k', base = 'textures/') {
  if (PHOTO.promise) return PHOTO.promise;
  PHOTO.res = res;
  const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  const maps = res === '1k' ? ['diff', 'nor'] : ['diff', 'nor', 'rough'];
  PHOTO.promise = Promise.all(PHOTO_IDS.flatMap((id) => maps.map(async (k) => { PHOTO.img[id + '/' + k] = await load(`${base}${id}/${res === '1k' ? '' : res + '/'}${k}.jpg`); })))
    .then(() => { PHOTO.ready = true; });
  return PHOTO.promise;
}
const photo = (id, k) => PHOTO.img[id + '/' + k] || null;
function photoTex(id, k, repeat = 1) {
  const im = photo(id, k);
  if (!im) return null;
  const t = new THREE.Texture(im);
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = k === 'diff' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = MAX_ANISO;
  t.repeat.set(repeat, repeat);
  return t;
}
/** Musterfüllung aus einem Foto: ein Bild deckt `units` Einheiten ab */
function photoPattern(g, id, k, units) {
  const im = photo(id, k);
  if (!im) return null;
  const p = g.createPattern(im, 'repeat');
  p.setTransform(new DOMMatrix().scale(units / im.width));
  return p;
}

/** Normalenkarte aus der Helligkeit einer Textur (Sobel-Filter): dunkle Stellen liegen tiefer */
function normalFromCanvas(src, strength = 2.5) {
  const w = src.width, h = src.height;
  const s = src.getContext('2d').getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (s[i * 4] * 0.3 + s[i * 4 + 1] * 0.59 + s[i * 4 + 2] * 0.11) / 255;
  const [c, g] = canvas(w, h);
  const img = g.createImageData(w, h), d = img.data;
  const L = (x, y) => lum[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1)) - (L(x - 1, y - 1) + 2 * L(x - 1, y) + L(x - 1, y + 1));
    const dy = (L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1)) - (L(x - 1, y - 1) + 2 * L(x, y - 1) + L(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
/** Verwitterung: Regenschlieren von oben, Schmutz am Fuß */
function weather(g, w, h, amount = 1) {
  for (let i = 0; i < 26 * amount; i++) {
    const x = Math.random() * w, y = Math.random() * h * 0.8, len = 40 + Math.random() * 160, wd = 2 + Math.random() * 7;
    const gr = g.createLinearGradient(0, y, 0, y + len);
    gr.addColorStop(0, `rgba(30,28,24,${0.05 + Math.random() * 0.08})`); gr.addColorStop(1, 'rgba(30,28,24,0)');
    g.fillStyle = gr; g.fillRect(x, y, wd, len);
  }
  const gb = g.createLinearGradient(0, h * 0.75, 0, h);
  gb.addColorStop(0, 'rgba(40,36,30,0)'); gb.addColorStop(1, `rgba(40,36,30,${0.12 * amount})`);
  g.fillStyle = gb; g.fillRect(0, h * 0.75, w, h * 0.25);
}
const FW = 256, FH = 448; // ein Kachel-Ausschnitt = 8 m breit × 4 Stockwerke (14 m)
const FLOOR = FH / 4;
/** Fassade: Farb-Textur + Leuchtfenster für Abend und Nacht */
const FACADE_PHOTO = { 1: 'concrete_panels', 2: 'white_plaster_rough_02', 3: 'worn_corrugated_iron' };
function makeFacade(style) {
  const FS = PHOTO.res === '1k' ? 2 : 4; // 2k/4k: Fassaden in vierfacher Auflösung
  const [c, g] = canvas(FW * FS, FH * FS);
  const [ce, ge] = canvas(FW * FS, FH * FS);
  const [cr, gr] = canvas(FW * FS, FH * FS); // Rauheit (grün) und Metall (blau): Scheiben glänzen, Wände matt
  g.scale(FS, FS); ge.scale(FS, FS); gr.scale(FS, FS);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, FW, FH);
  gr.fillStyle = style === 0 ? 'rgb(0,20,150)' : 'rgb(0,232,0)'; gr.fillRect(0, 0, FW, FH);
  const glass = (x, y, w, h) => { gr.fillStyle = 'rgb(0,26,115)'; gr.fillRect(x, y, w, h); };
  const solid = (x, y, w, h) => { gr.fillStyle = 'rgb(0,150,170)'; gr.fillRect(x, y, w, h); }; // Rahmen: Metall
  const wallId = FACADE_PHOTO[style];
  const wall = wallId ? photoPattern(g, wallId, 'diff', style === 3 ? 64 : 80) : null; // ein Foto = 2–2,5 m Wand
  const lit = (x, y, w, h, p) => {
    if (Math.random() > p) return;
    ge.fillStyle = Math.random() < 0.7 ? '#ffd9a0' : Math.random() < 0.5 ? '#bfe3ff' : '#ffb8e8';
    ge.globalAlpha = 0.55 + Math.random() * 0.45;
    ge.fillRect(x, y, w, h);
    ge.globalAlpha = 1;
  };
  if (style === 0) { // Glasturm: Vorhangfassade mit Spiegelung
    const grd = g.createLinearGradient(0, 0, FW, FH);
    grd.addColorStop(0, '#9fc6e6'); grd.addColorStop(0.5, '#4f7fa8'); grd.addColorStop(1, '#2a4d72');
    g.fillStyle = grd; g.fillRect(0, 0, FW, FH);
    for (let f = 0; f < 4; f++) {
      const y = f * FLOOR;
      for (let x = 0; x < FW; x += 32) {
        g.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`; g.fillRect(x, y, 32, FLOOR);
        lit(x + 3, y + 14, 26, FLOOR - 22, 0.32);
      }
      g.fillStyle = '#1d2c3d'; g.fillRect(0, y, FW, 10);       // Geschossdecke
      solid(0, y, FW, 10);
    }
    g.fillStyle = '#22344a';
    for (let x = 0; x < FW; x += 32) { g.fillRect(x, 0, 3, FH); solid(x, 0, 3, FH); } // Pfosten
  } else if (style === 1) { // Bürobau: Betonbänder und Fensterbänder
    g.fillStyle = wall || '#d3cec4'; g.fillRect(0, 0, FW, FH);
    if (!wall) grain(g, FW, FH, 2500);
    for (let f = 0; f < 4; f++) {
      const y = f * FLOOR;
      const wg = g.createLinearGradient(0, y + 34, 0, y + 98);
      wg.addColorStop(0, '#5d7a93'); wg.addColorStop(1, '#2b3a4b');
      g.fillStyle = wg; g.fillRect(0, y + 34, FW, 64);
      glass(0, y + 34, FW, 64);
      g.fillStyle = '#9aa3ab';
      for (let x = 0; x < FW; x += 32) { g.fillRect(x, y + 34, 3, 64); solid(x, y + 34, 3, 64); lit(x + 3, y + 36, 29, 60, 0.35); }
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, y + 98, FW, 4);
    }
  } else if (style === 2) { // Wohnhaus: Putz, Einzelfenster, Balkone
    g.fillStyle = wall || '#e6dccb'; g.fillRect(0, 0, FW, FH);
    if (!wall) grain(g, FW, FH, 3000, 0.05);
    for (let f = 0; f < 4; f++) {
      const y = f * FLOOR;
      for (let i = 0; i < 4; i++) {
        const x = 12 + i * 64;
        g.fillStyle = '#f7f4ee'; g.fillRect(x - 4, y + 24, 48, 64);
        const wg = g.createLinearGradient(0, y + 28, 0, y + 84);
        wg.addColorStop(0, '#6f8ea8'); wg.addColorStop(1, '#33475a');
        g.fillStyle = wg; g.fillRect(x, y + 28, 40, 56);
        glass(x, y + 28, 40, 56);
        g.fillStyle = '#f7f4ee'; g.fillRect(x + 19, y + 28, 2, 56);
        lit(x, y + 28, 40, 56, 0.4);
        if ((i + f) % 2 === 0) { g.fillStyle = '#8b8f94'; g.fillRect(x - 8, y + 86, 56, 8); g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x - 8, y + 94, 56, 6); }
      }
    }
  } else { // Industrie: Wellblech und hohe Fensterstreifen
    if (wall) { g.fillStyle = wall; g.fillRect(0, 0, FW, FH); }
    else { for (let x = 0; x < FW; x += 8) { g.fillStyle = x % 16 ? '#69717c' : '#59616b'; g.fillRect(x, 0, 8, FH); } grain(g, FW, FH, 2000, 0.08); }
    for (let f = 0; f < 4; f += 2) {
      const y = f * FLOOR + 30;
      g.fillStyle = '#26323e'; g.fillRect(16, y, FW - 32, 40);
      glass(16, y, FW - 32, 40);
      g.fillStyle = '#8e969f';
      for (let x = 16; x < FW - 16; x += 28) { g.fillRect(x, y, 3, 40); solid(x, y, 3, 40); }
      lit(16, y, FW - 32, 40, 0.5);
    }
    g.fillStyle = 'rgba(180,150,40,0.5)'; g.fillRect(0, FH - 14, FW, 6);
  }
  if (style !== 0) weather(g, FW, FH, style === 3 ? 1.4 : 1);
  let nrm = null;
  if (style !== 0) {
    nrm = normalFromCanvas(c, style === 3 ? 3 : 2.2);
    const wallN = wallId && photo(wallId, 'nor');
    if (wallN) { // Foto-Relief der Wand + Kanten der Fenster aus der Farbtextur
      const [cn, gn] = canvas(FW * FS, FH * FS);
      gn.scale(FS, FS);
      gn.fillStyle = photoPattern(gn, wallId, 'nor', style === 3 ? 64 : 80); gn.fillRect(0, 0, FW, FH);
      gn.setTransform(1, 0, 0, 1, 0, 0); gn.globalAlpha = 0.5; gn.drawImage(nrm.image, 0, 0);
      nrm = new THREE.CanvasTexture(cn); nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping; nrm.colorSpace = THREE.NoColorSpace;
    }
  }
  const rm = new THREE.CanvasTexture(cr);
  rm.wrapS = rm.wrapT = THREE.RepeatWrapping; rm.colorSpace = THREE.NoColorSpace; rm.anisotropy = MAX_ANISO;
  return { map: tex(c), emi: tex(ce), nrm, rm };
}
function makeRoof() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#8d8f93'; g.fillRect(0, 0, 256, 256);
  grain(g, 256, 256, 6000, 0.1);
  for (let i = 0; i < 14; i++) { const r = 8 + Math.random() * 40; const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, 'rgba(50,48,44,0.18)'); gr.addColorStop(1, 'rgba(50,48,44,0)'); g.save(); g.translate(Math.random() * 256, Math.random() * 256); g.fillStyle = gr; g.fillRect(-r, -r, 2 * r, 2 * r); g.restore(); }
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  const t = tex(c); t.userData.nrm = normalFromCanvas(c, 3);
  return t;
}
function makeBarrier() {
  const [c, g] = canvas(256, 256);
  g.scale(2, 2);
  g.fillStyle = photoPattern(g, 'rough_concrete', 'diff', 128) || '#c9c6bf'; g.fillRect(0, 0, 128, 128);
  if (!photo('rough_concrete', 'diff')) grain(g, 128, 128, 1200, 0.08);
  for (let x = -128; x < 128; x += 32) { g.fillStyle = '#e8622a'; g.beginPath(); g.moveTo(x, 70); g.lineTo(x + 16, 70); g.lineTo(x + 48, 100); g.lineTo(x + 32, 100); g.fill(); }
  return tex(c);
}
/** Werbetafeln mit erfundenen Namen (Atlas 2 × 4) */
const SIGN_TEXTS = [['NOVA', '#2cf3ff'], ['RAMEN', '#ff4d6d'], ['HOTEL', '#ffd34d'], ['24/7', '#7dff6b'], ['KINO', '#b06cff'], ['VOLT', '#ff9b2c'], ['LUMA', '#ff4dd2'], ['BAR', '#2c8bff']];
function makeSigns() {
  const [c, g] = canvas(1024, 1024);
  SIGN_TEXTS.forEach(([txt, col], i) => {
    const x = (i % 2) * 512, y = Math.floor(i / 2) * 256;
    g.fillStyle = '#0b0d18'; g.fillRect(x, y, 512, 256);
    g.strokeStyle = col; g.lineWidth = 10; g.strokeRect(x + 14, y + 14, 484, 228);
    g.font = 'bold 150px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = col; g.shadowBlur = 30; g.fillStyle = col; g.fillText(txt, x + 256, y + 132);
    g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.globalAlpha = 0.5; g.fillText(txt, x + 256, y + 132); g.globalAlpha = 1;
  });
  return tex(c, false);
}
/** Boden der ganzen Stadt: Asphalt, Gehwege, Plätze, Markierungen, Zebrastreifen */
// Stadtviertel-Farben (Fassaden, Neon, Minimap): Ziegelrot, Petrol, Ocker, Kühlblau
export const DISTRICT_COLORS = [[1.3, 0.68, 0.5], [0.5, 1.02, 0.96], [1.25, 1.02, 0.45], [0.64, 0.8, 1.3]];
export const DISTRICT_NEON = [[1, 0.42, 0.25], [0.17, 0.95, 0.85], [1, 0.8, 0.25], [0.45, 0.6, 1]];
function makeGround(world) {
  const N = 3072, s = N / (HALF * 2), P = (v) => (v + HALF) * s;
  const poiOf = new Map((world.pois || []).map((p) => [p.sector, p.type]));
  const [c, g] = canvas(N, N);
  g.fillStyle = '#3b3e44'; g.fillRect(0, 0, N, N);
  grain(g, N, N, 90000, 0.09);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '70,72,76' : '48,50,54'},0.5)`; g.fillRect(Math.random() * N, Math.random() * N, 8 + Math.random() * 30, 6 + Math.random() * 22); } // Flicken
  for (let i = 0; i < 140; i++) { const x = Math.random() * N, y = Math.random() * N, r = 3 + Math.random() * 10; g.fillStyle = 'rgba(15,15,18,0.25)'; g.beginPath(); g.ellipse(x, y, r, r * 0.6, Math.random() * 3, 0, 7); g.fill(); } // Ölflecken
  g.strokeStyle = 'rgba(20,20,22,0.55)'; g.lineWidth = 1;
  for (let i = 0; i < 420; i++) { let x = Math.random() * N, y = Math.random() * N; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 14; y += (Math.random() - 0.5) * 14; g.lineTo(x, y); } g.stroke(); } // Risse
  for (let sz = 0; sz < NS; sz++) for (let sx = 0; sx < NS; sx++) for (let lx = 0; lx < 2; lx++) for (let lz = 0; lz < 2; lz++) {
    const x0 = -HALF + sx * SECTOR + LOT_OFF[lx], z0 = -HALF + sz * SECTOR + LOT_OFF[lz];
    const poi = poiOf.get(sz * NS + sx);
    g.fillStyle = '#a19d96'; g.fillRect(P(x0 - 1.6), P(z0 - 1.6), (LOT + 3.2) * s, (LOT + 3.2) * s);   // Bordstein/Gehweg
    if (poi === 'park') { g.fillStyle = '#4c6a37'; g.fillRect(P(x0), P(z0), LOT * s, LOT * s); grain(g, 0, 0, 0, 0); for (let k = 0; k < 220; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '90,120,60' : '50,75,38'},0.5)`; g.fillRect(P(x0 + Math.random() * LOT), P(z0 + Math.random() * LOT), 3, 3); } continue; }
    if (poi === 'baustelle') { g.fillStyle = '#7a6650'; g.fillRect(P(x0), P(z0), LOT * s, LOT * s); for (let k = 0; k < 160; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '110,92,70' : '84,70,54'},0.6)`; g.fillRect(P(x0 + Math.random() * LOT), P(z0 + Math.random() * LOT), 5, 4); } continue; }
    if (poi === 'hafen') { g.fillStyle = '#56585c'; g.fillRect(P(x0), P(z0), LOT * s, LOT * s); g.fillStyle = '#d9b23a'; for (let k = 0; k < LOT; k += 5.9) g.fillRect(P(x0), P(z0 + k + 0.1), LOT * s, 0.18 * s); continue; }
    g.fillStyle = poi === 'platz' ? '#a39c90' : '#8f8b84'; g.fillRect(P(x0), P(z0), LOT * s, LOT * s);   // Platz
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1;
    for (let k = 0; k <= LOT; k += 1.5) { g.beginPath(); g.moveTo(P(x0 + k), P(z0)); g.lineTo(P(x0 + k), P(z0 + LOT)); g.stroke(); g.beginPath(); g.moveTo(P(x0), P(z0 + k)); g.lineTo(P(x0 + LOT), P(z0 + k)); g.stroke(); }
  }
  // Hauptstraßen: doppelte Mittellinie, gestrichelte Fahrstreifen, Zebrastreifen; Gassen: einfache Mittellinie
  const near = (t, w) => { const m = ((t + HALF) % SECTOR + SECTOR) % SECTOR; return m < w || m > SECTOR - w; };
  for (let i = 1; i < NS; i++) {
    const L = -HALF + i * SECTOR;
    for (let t = -HALF; t < HALF; t += 1) {
      if (near(t, ROAD + 3.2)) continue;
      g.fillStyle = '#e2c46a';
      for (const o of [-0.3, 0.12]) { g.fillRect(P(L + o), P(t), 0.18 * s, 1.05 * s); g.fillRect(P(t), P(L + o), 1.05 * s, 0.18 * s); }
      if (((t % 6) + 6) % 6 < 3) { g.fillStyle = '#e9e6dc'; for (const o of [-4.6, 4.4]) { g.fillRect(P(L + o), P(t), 0.2 * s, 1.05 * s); g.fillRect(P(t), P(L + o), 1.05 * s, 0.2 * s); } }
    }
  }
  g.fillStyle = 'rgba(233,230,220,0.75)';
  for (let i = 0; i < NS; i++) {
    const L = -HALF + i * SECTOR + SECTOR / 2;
    for (let t = -HALF; t < HALF; t += 5) { if (near(t, ROAD + 2)) continue; g.fillRect(P(L - 0.1), P(t), 0.2 * s, 2.4 * s); g.fillRect(P(t), P(L - 0.1), 2.4 * s, 0.2 * s); }
  }
  g.fillStyle = '#e9e6dc';
  for (let i = 1; i < NS; i++) for (let j = 1; j < NS; j++) {
    const X = -HALF + i * SECTOR, Z = -HALF + j * SECTOR;
    for (let k = -ROAD + 0.8; k <= ROAD - 1.2; k += 1.15) {
      g.fillRect(P(X + k), P(Z - ROAD - 3), 0.65 * s, 2.6 * s); g.fillRect(P(X + k), P(Z + ROAD + 0.4), 0.65 * s, 2.6 * s);
      g.fillRect(P(X - ROAD - 3), P(Z + k), 2.6 * s, 0.65 * s); g.fillRect(P(X + ROAD + 0.4), P(Z + k), 2.6 * s, 0.65 * s);
    }
  }
  const t = tex(c, false);
  t.userData.nrm = normalFromCanvas(c, 2);
  t.userData.nrm.wrapS = t.userData.nrm.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
function makeGlow(color) {
  const [c, g] = canvas(64, 64);
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, color); r.addColorStop(0.35, color.replace('1)', '0.5)')); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- Geometrie-Baukasten
/** Sammelt Dreiecke mit Welt-UVs und Farben; ein Baukasten = ein Material = ein Zeichenaufruf */
class Geo {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; }
  quad(a, b, c, d, n, uvs, col) {
    const v = [a, b, c, a, c, d], u = [uvs[0], uvs[1], uvs[2], uvs[0], uvs[2], uvs[3]];
    for (let i = 0; i < 6; i++) { this.p.push(v[i][0], v[i][1], v[i][2]); this.n.push(n[0], n[1], n[2]); this.uv.push(u[i][0], u[i][1]); this.c.push(col[0], col[1], col[2]); }
  }
  /** Quader mit Welt-UVs (Seiten: sx m breit, sy m hoch je Kachel) */
  box(x0, x1, y0, y1, z0, z1, { col = [1, 1, 1], sx = 8, sy = 14, top = true, bottom = false, topScale = 8 } = {}) {
    const sideUV = (a, b, ua, ub) => [[ua / sx, a / sy], [ub / sx, a / sy], [ub / sx, b / sy], [ua / sx, b / sy]];
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], sideUV(y0, y1, -z1, -z0), col);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], sideUV(y0, y1, z0, z1), col);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], sideUV(y0, y1, x0, x1), col);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], sideUV(y0, y1, -x1, -x0), col);
    if (top) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[x0 / topScale, -z1 / topScale], [x1 / topScale, -z1 / topScale], [x1 / topScale, -z0 / topScale], [x0 / topScale, -z0 / topScale]], col);
    if (bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], col);
  }
  /** Prisma (z. B. Wassertank) */
  prism(cx, cz, r, y0, y1, sides, col) {
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * r, cz + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, cz + Math.sin(a1) * r];
      const nm = [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)];
      this.quad([p1[0], y0, p1[1]], [p0[0], y0, p0[1]], [p0[0], y1, p0[1]], [p1[0], y1, p1[1]], nm, [[0, 0], [1, 0], [1, 1], [0, 1]], col);
      this.quad([cx, y1, cz], [cx, y1, cz], [p0[0], y1, p0[1]], [p1[0], y1, p1[1]], [0, 1, 0], [[0, 0], [0, 0], [0, 0], [0, 0]], col);
    }
  }
  /** Rad: Zylinder mit Achse entlang x (axisX) oder z */
  wheel(cx, cy, cz, r, w, axisX, col, sides = 12) {
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
      const p = (a, s) => axisX ? [cx + s * w / 2, cy + Math.cos(a) * r, cz + Math.sin(a) * r] : [cx + Math.sin(a) * r, cy + Math.cos(a) * r, cz + s * w / 2];
      const nm = axisX ? [0, Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2)] : [Math.sin((a0 + a1) / 2), Math.cos((a0 + a1) / 2), 0];
      this.quad(p(a0, -1), p(a1, -1), p(a1, 1), p(a0, 1), nm, [[0, 0], [1, 0], [1, 1], [0, 1]], col);
      for (const s of [-1, 1]) { const c = axisX ? [cx + s * w / 2, cy, cz] : [cx, cy, cz + s * w / 2]; const n = axisX ? [s, 0, 0] : [0, 0, s]; this.quad(c, c, p(a1, s), p(a0, s), n, [[0, 0], [0, 0], [0, 0], [0, 0]], col); }
    }
  }
  /** einseitige Fläche (Schild) mit freien UVs */
  plane(a, b, c, d, n, uvs, col = [1, 1, 1]) { this.quad(a, b, c, d, n, uvs, col); }
  get empty() { return this.p.length === 0; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------- Materialien (einmal, für alle Runden)
let M = null;
/** Boden einer Welt: Straßenplan als Textur, Foto-Asphalt als Detail */
function groundMaterial(world) {
  const t = makeGround(world);
  const det = photoTex('asphalt_02', 'diff');
  const mat = new THREE.MeshStandardMaterial({ map: t, normalMap: photoTex('asphalt_02', 'nor', 112) || t.userData.nrm, normalScale: new THREE.Vector2(0.7, 0.7), roughnessMap: photoTex('asphalt_02', 'rough', 112), roughness: 1 });
  if (det) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: det };
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n  vec3 det = texture2D(detailMap, vMapUv * 112.0).rgb;\n  diffuseColor.rgb *= det * 2.1;');
    };
    mat.customProgramCacheKey = () => 'ground-detail';
  }
  return envMat(mat, 0.3);
}
function materials() {
  if (M) return M;
  const fac = [0, 1, 2, 3].map(makeFacade);
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  M = {
    facade: fac.map((f) => std({ map: f.map, emissive: 0xffffff, emissiveMap: f.emi, emissiveIntensity: 0, roughness: 1, metalness: 1, roughnessMap: f.rm, metalnessMap: f.rm, ...(f.nrm ? { normalMap: f.nrm, normalScale: new THREE.Vector2(0.8, 0.8) } : {}) })),
    roof: (() => { const d = photoTex('gravel_concrete', 'diff', 2); if (d) return std({ map: d, normalMap: photoTex('gravel_concrete', 'nor', 2), roughnessMap: photoTex('gravel_concrete', 'rough', 2), roughness: 1 }); const t = makeRoof(); return std({ map: t, normalMap: t.userData.nrm, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95 }); })(),
    trim: std({ color: 0xd8d4cc, roughness: 0.9, map: photoTex('rough_concrete', 'diff', 3), normalMap: photoTex('rough_concrete', 'nor', 3), roughnessMap: photoTex('rough_concrete', 'rough', 3) }),
    prop: std({ color: 0xffffff, roughness: 0.45, metalness: 0.5 }),
    neon: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    beacon: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    carPaint: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.32 }),
    carGlass: new THREE.MeshStandardMaterial({ color: 0x141a20, metalness: 0.9, roughness: 0.06 }),
    carTire: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    carLight: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    signs: new THREE.MeshStandardMaterial({ map: makeSigns(), emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 1, roughness: 0.5 }),
    barrier: new THREE.MeshStandardMaterial({ map: makeBarrier(), normalMap: photoTex('rough_concrete', 'nor', 1), roughness: 0.85 }),
    pavers: new THREE.MeshStandardMaterial({ map: photoTex('concrete_pavers_02', 'diff'), normalMap: photoTex('concrete_pavers_02', 'nor'), roughnessMap: photoTex('concrete_pavers_02', 'rough'), roughness: 1, color: 0xd8d6d0 }),
    ground: null, // je Welt, siehe groundMaterial()
    outer: new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 1 }),
    cont: std({ map: photoTex('worn_corrugated_iron', 'diff', 1), normalMap: photoTex('worn_corrugated_iron', 'nor', 1), roughness: 0.7, metalness: 0.35 }),
    hedge: std({ color: 0x9ec27a, roughness: 1, map: photoTex('gravel_concrete', 'diff', 1) }),
    lampPole: new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.5, metalness: 0.6 }),
    lampHead: new THREE.MeshBasicMaterial({ color: 0xfff1c8, toneMapped: false }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 1 }),
    crown: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }),
    skyline: new THREE.MeshStandardMaterial({ color: 0x8792a6, roughness: 0.9, emissive: 0xffffff, emissiveIntensity: 0 }),
  };
  M.signs.emissiveMap = M.signs.map;
  M.facade.forEach((f, i) => envMat(f, i === 0 ? 1.6 : 1.1));
  envMat(M.carPaint, 1.2); if (M.pavers.map) envMat(M.pavers, 0.3); envMat(M.carGlass, 1.6); envMat(M.roof, 0.35); envMat(M.trim, 0.5); envMat(M.prop, 1.0); envMat(M.barrier, 0.4); envMat(M.lampPole, 0.9);
  // Zerfallene Sektoren: rot getönte Kopien
  M.decayed = {};
  for (const k of ['roof', 'trim', 'prop']) { M.decayed[k] = M[k].clone(); M.decayed[k].color.set(0xff5a6a); M.decayed[k].emissive = new THREE.Color(0x400008); }
  M.decayed.facade = M.facade.map((m) => { const d = m.clone(); d.color.set(0xff6070); d.emissive = new THREE.Color(0xff2040); d.emissiveIntensity = 0.25; d.emissiveMap = null; return d; });
  // Zerfall als digitales Glitch-Muster: wandernde Leuchtbänder und Raster in Rot/Cyan
  for (const d of [...M.decayed.facade, M.decayed.roof, M.decayed.trim, M.decayed.prop]) glitch(d);
  M.lampGlow = makeGlow('rgba(255,225,170,1)');
  return M;
}

function glitch(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = TIME;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; varying vec3 vWP;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float band = step(0.9, fract(vWP.y * 0.35 - uTime * 0.9));
        vec2 cell = floor(vec2(vWP.x + vWP.z, vWP.y) * 1.2);
        float blink = step(0.93, fract(sin(dot(cell, vec2(12.9898, 78.233)) + floor(uTime * 6.0)) * 43758.5453));
        totalEmissiveRadiance += vec3(1.0, 0.12, 0.25) * band * 1.6 + vec3(0.2, 0.95, 1.0) * blink * 1.2;`);
  };
  mat.customProgramCacheKey = () => 'glitch';
}

const TINTS = {
  0: [[0.85, 0.95, 1.05], [0.8, 1.0, 0.95], [1, 1, 1], [0.95, 0.9, 1.05]],
  1: [[1, 1, 1], [0.95, 0.95, 0.92], [0.88, 0.9, 0.95], [1.02, 0.98, 0.9]],
  2: [[1, 1, 1], [1.02, 0.86, 0.76], [0.84, 0.95, 0.88], [0.86, 0.9, 1.02], [1.04, 0.96, 0.82]],
  3: [[1, 1, 1], [0.9, 0.62, 0.5], [0.66, 0.78, 0.9], [0.7, 0.85, 0.72]],
};
const NEON = [[0.17, 0.95, 1], [1, 0.3, 0.82], [1, 0.83, 0.3], [0.69, 0.42, 1]];

/** Baut die sichtbare Stadt. Rückgabe: Sektor-Objekte (für Zerfall) und Aktualisierungen je Tageszeit */
export function buildCity(world, root, tod) {
  const m = materials();
  const P = TODS[tod] || TODS.tag;
  const R = mulberry(world.seed ^ 0x5bd1e995);
  // Boden
  if (buildCity.ground) { buildCity.ground.map?.dispose(); buildCity.ground.dispose(); }
  const groundMat = buildCity.ground = groundMaterial(world);
  const poiOf = new Map((world.pois || []).map((p) => [p.sector, p.type]));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  root.add(ground);
  if (m.pavers.map) {
    const pv = new Geo();
    for (let sz = 0; sz < NS; sz++) for (let sx = 0; sx < NS; sx++) for (let lx = 0; lx < 2; lx++) for (let lz = 0; lz < 2; lz++) {
      if (['park', 'baustelle', 'hafen'].includes(poiOf.get(sz * NS + sx))) continue;
      const x0 = -HALF + sx * SECTOR + LOT_OFF[lx] - 1.6, z0 = -HALF + sz * SECTOR + LOT_OFF[lz] - 1.6, x1 = x0 + LOT + 3.2, z1 = z0 + LOT + 3.2, y = 0.012, k = 1 / 3;
      pv.plane([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [[x0 * k, -z1 * k], [x1 * k, -z1 * k], [x1 * k, -z0 * k], [x0 * k, -z0 * k]]);
    }
    const pm = new THREE.Mesh(pv.build(), m.pavers);
    pm.receiveShadow = true;
    root.add(pm);
  }
  const outer = new THREE.Mesh(new THREE.RingGeometry(HALF * 1.42, 1400, 4, 1, Math.PI / 4), m.outer);
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02;
  root.add(outer);
  const rim = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2.84, HALF * 2.84), m.outer);
  rim.rotation.x = -Math.PI / 2; rim.position.y = -0.03;
  root.add(rim);

  // Sektoren: je Material ein Baukasten
  const sectors = [];
  for (let i = 0; i < NS * NS; i++) sectors.push({ geos: { f0: new Geo(), f1: new Geo(), f2: new Geo(), f3: new Geo(), roof: new Geo(), trim: new Geo(), prop: new Geo(), neon: new Geo(), signs: new Geo(), beacon: new Geo(), cont: new Geo(), hedge: new Geo() }, meshes: [], decayed: false });
  const crates = new Geo();
  const cars = { paint: new Geo(), glass: new Geo(), tire: new Geo(), light: new Geo() };
  const PAINT = [[0.11, 0.12, 0.13], [0.85, 0.85, 0.86], [0.54, 0.56, 0.59], [0.23, 0.29, 0.36], [0.42, 0.12, 0.12], [0.18, 0.23, 0.18], [0.35, 0.31, 0.28], [0.24, 0.25, 0.27]];
  for (const b of world.boxes) {
    const [x0, y0, z0] = b.mn, [x1, y1, z1] = b.mx;
    if (b.kind === 'crate') { crates.box(x0 - 0.05, x1 + 0.05, y0, y1, z0, z1, { sx: 1.5, sy: 1.5, topScale: 1.5 }); continue; }
    if (b.kind === 'car') { buildCar(cars, b, PAINT[b.paint % PAINT.length]); continue; }
    const S = sectors[b.sector].geos;
    if (b.kind === 'building') {
      const style = b.style ?? 1;
      const tints = TINTS[style];
      const base = tints[Math.floor((b.tint ?? R()) * tints.length)];
      const dc = DISTRICT_COLORS[b.district ?? 0], mixK = style === 0 ? 0.55 : 1;
      const col = base.map((v, k) => v * (1 + (dc[k] - 1) * mixK));
      S['f' + style].box(x0, x1, y0, y1, z0, z1, { col, top: false });
      S.roof.box(x0, x1, y1 - 0.01, y1, z0, z1, { col: [1, 1, 1], sx: 8, sy: 8 });
      // Gesimse alle 4 Stockwerke (außer bei Glastürmen), außen vor der Fassade
      if (style !== 0) for (let y = 14; y < y1 - 2; y += 14) S.trim.box(x0 - 0.22, x1 + 0.22, y - 0.18, y + 0.18, z0 - 0.22, z1 + 0.22, { col: [0.92, 0.92, 0.92] });
      // Brüstung am Dachrand (außerhalb der Kollision) mit Leuchtstreifen
      const t = 0.28, ph = 0.55;
      S.trim.box(x0 - t, x1 + t, y1, y1 + ph, z0 - t, z0, { col: [0.85, 0.85, 0.85] });
      S.trim.box(x0 - t, x1 + t, y1, y1 + ph, z1, z1 + t, { col: [0.85, 0.85, 0.85] });
      S.trim.box(x0 - t, x0, y1, y1 + ph, z0, z1, { col: [0.85, 0.85, 0.85] });
      S.trim.box(x1, x1 + t, y1, y1 + ph, z0, z1, { col: [0.85, 0.85, 0.85] });
      const nc = R() < 0.65 ? DISTRICT_NEON[b.district ?? 0] : NEON[Math.floor(R() * NEON.length)];
      if (R() < 0.7) {
        S.neon.box(x0 - t - 0.02, x1 + t + 0.02, y1 + ph - 0.08, y1 + ph, z0 - t - 0.02, z0 - t, { col: nc, top: false });
        S.neon.box(x0 - t - 0.02, x1 + t + 0.02, y1 + ph - 0.08, y1 + ph, z1 + t, z1 + t + 0.02, { col: nc, top: false });
      }
      // Lisenen (senkrechte Pfeiler) an Bürobauten und Hallen, Balkone an Wohnhäusern
      const faces = [
        { a: [x0, z1], b: [x1, z1], n: [0, 1] }, { a: [x1, z0], b: [x0, z0], n: [0, -1] },
        { a: [x1, z1], b: [x1, z0], n: [1, 0] }, { a: [x0, z0], b: [x0, z1], n: [-1, 0] },
      ];
      for (const fc of faces) {
        const len = Math.hypot(fc.b[0] - fc.a[0], fc.b[1] - fc.a[1]);
        const dx = (fc.b[0] - fc.a[0]) / len, dz = (fc.b[1] - fc.a[1]) / len;
        const at = (s, out, half, y0b, y1b, depth) => {
          const cx = fc.a[0] + dx * s + fc.n[0] * out, cz = fc.a[1] + dz * s + fc.n[1] * out;
          const hx = Math.abs(dx) * half + Math.abs(fc.n[0]) * depth, hz = Math.abs(dz) * half + Math.abs(fc.n[1]) * depth;
          return [cx - hx, cx + hx, y0b, y1b, cz - hz, cz + hz];
        };
        if (style === 1 || style === 3) {
          for (let s = 4; s < len - 1; s += 8) S.trim.box(...at(s, 0.12, 0.18, 0.9, y1, 0.12), { col: style === 3 ? [0.55, 0.57, 0.6] : [0.9, 0.9, 0.88], top: true });
        } else if (style === 2) {
          for (let y = 4.375; y < y1 - 2; y += 7) for (let s = 3; s < len - 1.5; s += 4) {
            S.trim.box(...at(s, 0.45, 0.85, y - 0.12, y, 0.45), { col: [0.82, 0.82, 0.84] });            // Platte
            S.trim.box(...at(s, 0.88, 0.85, y, y + 0.85, 0.03), { col: [0.6, 0.66, 0.72] });            // Geländer
          }
        }
      }
      // Antenne mit Warnlicht auf hohen Türmen (Ecke, damit Seilbahnmast frei bleibt)
      if (b.h0 > 32) {
        const ax = x0 + 1.5, az = z0 + 1.5, ah = 6 + R() * 8;
        S.prop.box(ax - 0.08, ax + 0.08, y1, y1 + ah, az - 0.08, az + 0.08, { col: [0.7, 0.7, 0.72] });
        S.prop.box(ax - 0.5, ax + 0.5, y1 + ah * 0.6, y1 + ah * 0.6 + 0.06, az - 0.04, az + 0.04, { col: [0.7, 0.7, 0.72] });
        S.beacon.box(ax - 0.18, ax + 0.18, y1 + ah, y1 + ah + 0.3, az - 0.18, az + 0.18, { col: [1, 0.15, 0.15] });
      }
      // Sockel im Erdgeschoss
      S.trim.box(x0 - 0.12, x1 + 0.12, 0, 0.9, z0 - 0.12, z1 + 0.12, { col: [0.55, 0.56, 0.6], top: false });
      // Werbetafel an hohen Gebäuden
      if (b.h0 > 22 && R() < 0.55) {
        const k = Math.floor(R() * SIGN_TEXTS.length), u0 = (k % 2) * 0.5, v0 = 1 - Math.floor(k / 2) * 0.25;
        const uvs = [[u0, v0 - 0.25], [u0 + 0.5, v0 - 0.25], [u0 + 0.5, v0], [u0, v0]];
        const sh = 3.2, sw = Math.min(6.4, (x1 - x0) - 2), ys = y1 - 4.5 - R() * Math.min(10, y1 * 0.3), cx = (x0 + x1) / 2;
        if (sw > 3) {
          const side = R() < 0.5 ? -1 : 1, zz = side < 0 ? z0 - 0.08 : z1 + 0.08;
          if (side > 0) S.signs.plane([cx - sw / 2, ys, zz], [cx + sw / 2, ys, zz], [cx + sw / 2, ys + sh, zz], [cx - sw / 2, ys + sh, zz], [0, 0, 1], uvs);
          else S.signs.plane([cx + sw / 2, ys, zz], [cx - sw / 2, ys, zz], [cx - sw / 2, ys + sh, zz], [cx + sw / 2, ys + sh, zz], [0, 0, -1], uvs);
        }
      }
    } else if (b.kind === 'container') {
      const CP = [[0.62, 0.2, 0.14], [0.16, 0.32, 0.55], [0.2, 0.45, 0.28], [0.85, 0.45, 0.12], [0.78, 0.78, 0.74], [0.75, 0.62, 0.15]];
      S.cont.box(x0, x1, y0, y1, z0, z1, { col: CP[(b.paint ?? 0) % CP.length], sx: 2.6, sy: 2.6, topScale: 3 });
      S.prop.box(x0 - 0.04, x0 + 0.15, y0, y1, z0 - 0.04, z1 + 0.04, { col: [0.25, 0.26, 0.27] }); // Türende
    } else if (b.kind === 'steel') {
      S.prop.box(x0, x1, y0, y1, z0, z1, { col: [0.95, 0.68, 0.08] });
    } else if (b.kind === 'hedge') {
      S.hedge.box(x0, x1, y0, y1, z0, z1, { col: [0.36, 0.52, 0.26], sx: 2, sy: 2, topScale: 2 });
    } else if (b.kind === 'planter') {
      S.trim.box(x0, x1, y0, y1, z0, z1, { col: [0.82, 0.8, 0.76], top: false });
      S.hedge.box(x0 + 0.15, x1 - 0.15, y1 - 0.05, y1 + 0.35, z0 + 0.15, z1 - 0.15, { col: [0.4, 0.58, 0.28], sx: 2, sy: 2, topScale: 2 });
    } else if (b.kind === 'kiosk' || b.kind === 'stall') {
      const dc = DISTRICT_NEON[districtOf(Math.floor(b.sector % NS), Math.floor(b.sector / NS))];
      S.prop.box(x0, x1, y0, y1, z0, z1, { col: b.kind === 'kiosk' ? [0.86, 0.86, 0.84] : [0.55, 0.42, 0.3] });
      if (b.kind === 'kiosk') S.neon.box(x0 - 0.05, x1 + 0.05, y1 - 0.35, y1 - 0.2, z0 - 0.05, z1 + 0.05, { col: dc, top: false });
    } else if (b.kind === 'monument') {
      S.trim.box(x0, x1, y0, y1, z0, z1, { col: [0.95, 0.93, 0.88], sx: 3, sy: 3 });
      S.beacon.box(x0 - 0.05, x1 + 0.05, y1 - 0.6, y1, z0 - 0.05, z1 + 0.05, { col: [1, 0.75, 0.3] });
    } else if (b.kind === 'hall') {
      const dc = DISTRICT_COLORS[districtOf(b.sector % NS, Math.floor(b.sector / NS))];
      S.f3.box(x0, x1, y0, y1, z0, z1, { col: dc.map((v) => v * 0.85), top: true, sx: 6, sy: 9 });
    } else if (b.kind === 'slab' || b.kind === 'block') {
      S.trim.box(x0, x1, y0, y1, z0, z1, { col: b.kind === 'slab' ? [0.78, 0.77, 0.74] : [0.7, 0.69, 0.66], sx: 4, sy: 4, topScale: 4, bottom: b.kind === 'slab' });
    } else if (b.kind === 'roof') { // Treppenhaus auf dem Dach
      S.f1.box(x0, x1, y0, y1, z0, z1, { col: [0.82, 0.82, 0.86], top: false, sx: 4, sy: 3.5 });
      S.roof.box(x0 - 0.15, x1 + 0.15, y1, y1 + 0.15, z0 - 0.15, z1 + 0.15, {});
    } else if (b.kind === 'prop') {
      const c = b.prop === 'tank' ? [0.75, 0.78, 0.82] : b.prop === 'vent' ? [0.6, 0.62, 0.66] : [0.86, 0.88, 0.9];
      if (b.prop === 'tank') {
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, r = (x1 - x0) / 2;
        for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) S.prop.box(cx + dx - 0.07, cx + dx + 0.07, y0, y0 + 0.9, cz + dz - 0.07, cz + dz + 0.07, { col: [0.4, 0.4, 0.42] });
        S.prop.prism(cx, cz, r, y0 + 0.9, y1, 10, c);
      } else {
        S.prop.box(x0, x1, y0, y1, z0, z1, { col: c });
        if (b.prop === 'ac') { // Lüftergitter oben
          S.prop.box(x0 + 0.3, x0 + 1.0, y1, y1 + 0.06, z0 + 0.4, z1 - 0.4, { col: [0.25, 0.27, 0.3] });
          S.prop.box(x1 - 1.0, x1 - 0.3, y1, y1 + 0.06, z0 + 0.4, z1 - 0.4, { col: [0.25, 0.27, 0.3] });
        } else S.prop.box(x0 + 0.2, x1 - 0.2, y1, y1 + 0.35, z0 + 0.2, z1 - 0.2, { col: [0.45, 0.47, 0.5] });
      }
    }
  }
  const matFor = { f0: m.facade[0], f1: m.facade[1], f2: m.facade[2], f3: m.facade[3], roof: m.roof, trim: m.trim, prop: m.prop, neon: m.neon, signs: m.signs, beacon: m.beacon, cont: m.cont, hedge: m.hedge };
  const decayFor = { f0: m.decayed.facade[0], f1: m.decayed.facade[1], f2: m.decayed.facade[2], f3: m.decayed.facade[3], roof: m.decayed.roof, trim: m.decayed.trim, prop: m.decayed.prop, cont: m.decayed.prop, hedge: m.decayed.trim };
  for (const s of sectors) {
    const group = new THREE.Group();
    for (const [k, g] of Object.entries(s.geos)) {
      if (g.empty) continue;
      const mesh = new THREE.Mesh(g.build(), matFor[k]);
      mesh.castShadow = !['neon', 'signs', 'beacon'].includes(k); mesh.receiveShadow = !['neon', 'beacon'].includes(k);
      mesh.userData.key = k;
      group.add(mesh);
      s.meshes.push(mesh);
    }
    root.add(group);
    s.group = group;
    delete s.geos;
  }
  const crateMesh = new THREE.Mesh(crates.build(), m.barrier);
  crateMesh.castShadow = crateMesh.receiveShadow = true;
  root.add(crateMesh);
  for (const [k, mat] of [['paint', m.carPaint], ['glass', m.carGlass], ['tire', m.carTire], ['light', m.carLight]]) {
    if (cars[k].empty) continue;
    const mesh = new THREE.Mesh(cars[k].build(), mat);
    mesh.castShadow = k !== 'light'; mesh.receiveShadow = true;
    root.add(mesh);
  }

  // Straßenlaternen und Bäume an den Plätzen (nur Optik)
  const occupied = (x, z, pad) => world.boxes.some((b) => b.kind !== 'crate' && x > b.mn[0] - pad && x < b.mx[0] + pad && z > b.mn[2] - pad && z < b.mx[2] + pad);
  const lamps = [], trees = [];
  for (let sz = 0; sz < NS; sz++) for (let sx = 0; sx < NS; sx++) for (let lx = 0; lx < 2; lx++) for (let lz = 0; lz < 2; lz++) {
    const x0 = -HALF + sx * SECTOR + LOT_OFF[lx], z0 = -HALF + sz * SECTOR + LOT_OFF[lz];
    const poi = poiOf.get(sz * NS + sx);
    for (const [cx, cz] of [[x0 - 0.8, z0 - 0.8], [x0 + LOT + 0.8, z0 + LOT + 0.8], [x0 + LOT / 2, z0 - 0.8]]) if (!occupied(cx, cz, 0.6)) lamps.push([cx, cz]);
    for (const [cx, cz] of [[x0 + 6, z0 - 0.7], [x0 + LOT - 6, z0 - 0.7], [x0 - 0.7, z0 + LOT / 2], [x0 + LOT + 0.7, z0 + LOT / 2], [x0 + LOT / 2, z0 + LOT + 0.7]]) if (R() < 0.55 && !occupied(cx, cz, 1.2)) trees.push([cx, cz]);
    if (poi === 'park' || poi === 'platz') for (let k = 0; k < (poi === 'park' ? 14 : 4); k++) { const cx = x0 + 1.5 + R() * (LOT - 3), cz = z0 + 1.5 + R() * (LOT - 3); if (!occupied(cx, cz, 1.4)) trees.push([cx, cz]); }
  }
  const dummy = new THREE.Object3D();
  const inst = (geo, mat, list, place, shadow = true) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => { place(dummy, p, i); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    im.castShadow = shadow; im.receiveShadow = false;
    root.add(im);
    return im;
  };
  inst(new THREE.CylinderGeometry(0.07, 0.1, 6, 6).translate(0, 3, 0), m.lampPole, lamps, (d, [x, z]) => { d.position.set(x, 0, z); d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0); });
  inst(new THREE.BoxGeometry(1.2, 0.08, 0.12).translate(0.55, 6, 0), m.lampPole, lamps, (d, [x, z]) => { d.position.set(x, 0, z); d.rotation.set(0, Math.atan2(-(Math.round(z / NODE) * NODE - z), Math.round(x / NODE) * NODE - x), 0); });
  const heads = inst(new THREE.BoxGeometry(0.5, 0.12, 0.3).translate(1.05, 5.92, 0), m.lampHead, lamps, (d, [x, z]) => { d.position.set(x, 0, z); d.rotation.set(0, Math.atan2(-(Math.round(z / NODE) * NODE - z), Math.round(x / NODE) * NODE - x), 0); }, false);
  // Lichtkegel der Laternen als weiche Leuchtflächen am Boden (bei Nacht)
  const pools = inst(new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2).translate(0, 0.03, 0),
    new THREE.MeshBasicMaterial({ map: m.lampGlow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, toneMapped: false }), lamps,
    (d, [x, z]) => { const a = Math.atan2(-(Math.round(z / NODE) * NODE - z), Math.round(x / NODE) * NODE - x); d.rotation.set(0, 0, 0); d.position.set(x + Math.cos(a) * 1.05, 0, z - Math.sin(a) * 1.05); }, false);
  inst(new THREE.CylinderGeometry(0.12, 0.18, 2.6, 6).translate(0, 1.3, 0), m.trunk, trees, (d, [x, z]) => { d.position.set(x, 0, z); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); });
  const crowns = inst(new THREE.IcosahedronGeometry(1.6, 3).translate(0, 3.6, 0), m.crown, trees, (d, [x, z]) => { d.position.set(x, 0, z); d.rotation.set(0, R() * 6, 0); const s = 0.8 + R() * 0.45; d.scale.set(s, s * 1.1, s); });
  const crowns2 = inst(new THREE.IcosahedronGeometry(1.1, 3).translate(0, 4.9, 0), m.crown, trees, (d, [x, z]) => { d.position.set(x + (R() - 0.5) * 0.6, 0, z + (R() - 0.5) * 0.6); d.rotation.set(0, R() * 6, 0); const s = 0.75 + R() * 0.4; d.scale.set(s, s, s); });
  const green = new THREE.Color();
  trees.forEach((_, i) => { crowns.setColorAt(i, green.setHSL(0.24 + R() * 0.06, 0.38, 0.17 + R() * 0.06)); crowns2.setColorAt(i, green.setHSL(0.23 + R() * 0.06, 0.4, 0.21 + R() * 0.06)); });
  // Büsche an den Plätzen
  const bushes = [];
  for (const [x, z] of trees) for (let k = 0; k < 2; k++) { const bx = x + (R() - 0.5) * 3, bz = z + (R() - 0.5) * 3; if (!occupied(bx, bz, 0.8)) bushes.push([bx, bz]); }
  const bushMesh = inst(new THREE.IcosahedronGeometry(0.75, 2).translate(0, 0.45, 0), m.crown, bushes, (d, [x, z]) => { d.position.set(x, 0, z); d.rotation.set(0, R() * 6, 0); const s = 0.7 + R() * 0.5; d.scale.set(s * 1.3, s * 0.8, s); });
  bushes.forEach((_, i) => bushMesh.setColorAt(i, green.setHSL(0.25 + R() * 0.06, 0.38, 0.16 + R() * 0.05)));

  // Skyline am Horizont (unerreichbar, nur Kulisse)
  const sky = [];
  for (let i = 0; i < 160; i++) {
    const a = R() * Math.PI * 2, r = HALF * 1.65 + R() * 300;
    sky.push([Math.cos(a) * r, Math.sin(a) * r, 15 + Math.pow(R(), 1.8) * 130, 12 + R() * 22]);
  }
  const skyline = inst(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ map: makeFacade(1).map, emissive: 0xffffff, emissiveMap: makeFacade(0).emi, emissiveIntensity: 0, roughness: 0.9 }), sky,
    (d, [x, z, h, w]) => { d.position.set(x, 0, z); d.rotation.set(0, R(), 0); d.scale.set(w, h, w * (0.7 + R() * 0.6)); }, false);

  const city = { sectors, heads, pools, skyline, crateMesh, beaconBase: 1 };
  // Warnlichter blinken langsam
  city.tick = (t) => m.beacon.color.setScalar(city.beaconBase * (Math.sin(t * 2.4) > 0.3 ? 1 : 0.15));
  city.applyTod = (P2) => {
    for (const f of m.facade) f.emissiveIntensity = P2.windows;
    m.neon.color.setScalar(P2.neon);
    m.signs.emissiveIntensity = P2.signs;
    m.lampHead.color.setRGB(1, 0.95, 0.8).multiplyScalar(0.4 + P2.lamps);
    pools.visible = P2.lamps > 0.5;
    pools.material.opacity = 0.45 * P2.lamps;
    skyline.material.emissiveIntensity = P2.windows * 0.8;
    city.beaconBase = 0.3 + P2.lamps * 1.6;
  };
  city.applyTod(P);
  /** Zerfall: Sektor rot einfärben, flackern lassen und versinken (gleiche Formel wie die Kollision) */
  city.updateSector = (i, decayed, f, flicker) => {
    const s = sectors[i];
    if (decayed && !s.decayed) {
      s.decayed = true;
      for (const mesh of s.meshes) if (decayFor[mesh.userData.key]) mesh.material = decayFor[mesh.userData.key];
    }
    s.group.scale.y = Math.max(0.0001, f);
    s.group.visible = f > 0.001 && (!flicker || Math.random() > 0.18);
  };
  return city;
}

/** Geparktes Auto (eigener, schlichter Entwurf): Karosserie, Kabine mit Scheiben, Räder, Lichter */
function buildCar(G, b, paint) {
  const [x0, , z0] = b.mn, [x1, , z1] = b.mx;
  const ax = b.alongX, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const L = ax ? x1 - x0 : z1 - z0, W = ax ? z1 - z0 : x1 - x0, hl = L / 2, hw = W / 2;
  const dir = b.flip ? -1 : 1; // Fahrtrichtung entlang der Längsachse
  // Hilfsfunktion: Quader in Fahrzeug-Koordinaten (u = längs, v = quer)
  const box = (geo, u0, u1, y0, y1, v0, v1, col) => {
    const a = ax ? [cx + u0 * dir, cx + u1 * dir].sort((p, q) => p - q) : [cx + v0, cx + v1];
    const c = ax ? [cz + v0, cz + v1] : [cz + u0 * dir, cz + u1 * dir].sort((p, q) => p - q);
    geo.box(a[0], a[1], y0, y1, c[0], c[1], { col, sx: 4, sy: 4, topScale: 4 });
  };
  box(G.paint, -hl, hl, 0.3, 0.82, -hw, hw, paint);                         // Unterbau
  box(G.paint, -hl + 0.95, hl - 0.7, 0.82, 0.9, -hw + 0.04, hw - 0.04, paint); // Schulter
  box(G.glass, -hl + 1.15, hl - 1.1, 0.9, 1.34, -hw + 0.1, hw - 0.1, [1, 1, 1]); // Kabine mit Scheiben
  box(G.paint, -hl + 1.25, hl - 1.2, 1.34, 1.42, -hw + 0.12, hw - 0.12, paint);  // Dach
  box(G.tire, hl - 0.05, hl + 0.05, 0.3, 0.55, -hw + 0.05, hw - 0.05, [0.12, 0.12, 0.13]); // Stoßfänger
  box(G.tire, -hl - 0.05, -hl + 0.05, 0.3, 0.55, -hw + 0.05, hw - 0.05, [0.12, 0.12, 0.13]);
  box(G.light, hl + 0.04, hl + 0.06, 0.62, 0.72, -hw + 0.12, -hw + 0.42, [1, 0.95, 0.85]); // Scheinwerfer
  box(G.light, hl + 0.04, hl + 0.06, 0.62, 0.72, hw - 0.42, hw - 0.12, [1, 0.95, 0.85]);
  box(G.light, -hl - 0.06, -hl - 0.04, 0.64, 0.74, -hw + 0.1, -hw + 0.4, [0.9, 0.1, 0.08]); // Rücklichter
  box(G.light, -hl - 0.06, -hl - 0.04, 0.64, 0.74, hw - 0.4, hw - 0.1, [0.9, 0.1, 0.08]);
  for (const u of [hl - 0.78, -hl + 0.78]) for (const s of [-1, 1]) {
    const wx = ax ? cx + u * dir : cx + s * (hw - 0.08), wz = ax ? cz + s * (hw - 0.08) : cz + u * dir;
    G.tire.wheel(wx, 0.33, wz, 0.33, 0.24, !ax, [0.08, 0.08, 0.09]);
    G.tire.wheel(ax ? wx : wx + s * 0.005, 0.33, ax ? wz + s * 0.005 : wz, 0.19, 0.25, !ax, [0.55, 0.56, 0.58]); // Felge
  }
}

function mulberry(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- Figuren mit Bewegung
const PART = {};
function partGeo(key, make) { return PART[key] || (PART[key] = make()); }
// ---------------------------------------------------------------- Waffenmodelle (eigene Entwürfe)
const WMAT = {};
function wmat(key, make) { return WMAT[key] || (WMAT[key] = make()); }
const gunmetal = () => wmat('gunmetal', () => envMat(new THREE.MeshStandardMaterial({ color: 0x2c3036, metalness: 0.75, roughness: 0.38 }), 1.0));
const polymer = () => wmat('polymer', () => envMat(new THREE.MeshStandardMaterial({ color: 0x1b1d21, metalness: 0.05, roughness: 0.82 }), 0.3));
const FURNITURE = { funke: 0x1b1d21, puls: 0x9c8a67, hagel: 0x222427, lanze: 0x3a3f47, dorn: 0x1d1f22, moerser: 0x55584a };
const furniture = (id) => wmat('f_' + id, () => envMat(new THREE.MeshStandardMaterial({ color: FURNITURE[id] || 0x2a2d33, metalness: 0.1, roughness: 0.7 }), 0.4));
const accentMat = (col) => wmat('a_' + col, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(0.8), toneMapped: false }));
/** Waffe als Modell. Ursprung am Griff, Lauf zeigt nach −z. Gleiche Modelle für Ich-Ansicht und Figuren. */
export function makeWeapon(id, accent = 0x2cf3ff) {
  const g = new THREE.Group();
  const M = gunmetal(), P = polymer(), F = furniture(id), A = accentMat(accent);
  const rb = (w, h, d) => partGeo(`w${w}_${h}_${d}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.18));
  const cy = (r, len, seg = 14) => partGeo(`c${r}_${len}`, () => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2));
  const add = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; g.add(m); return m; };
  const grip = (z = 0.07) => add(rb(0.034, 0.105, 0.048), P, 0, -0.075, z, -0.3);
  const guard = (z = 0.02) => add(rb(0.01, 0.012, 0.06), M, 0, -0.045, z);
  const rail = (len, z, y = 0.055) => { add(rb(0.034, 0.012, len), M, 0, y, z); for (let k = 0; k < len / 0.02 - 1; k++) add(rb(0.036, 0.006, 0.006), M, 0, y + 0.008, z - len / 2 + 0.015 + k * 0.02); };
  switch (id) {
    case 'funke': // kompakte MP
      add(rb(0.062, 0.088, 0.28), F, 0, 0, 0);
      rail(0.2, -0.02);
      add(cy(0.024, 0.13), M, 0, 0.005, -0.2);
      add(cy(0.017, 0.06), P, 0, 0.005, -0.29);
      add(rb(0.032, 0.16, 0.048), P, 0, -0.1, -0.05, 0.12);
      add(rb(0.03, 0.036, 0.06), P, 0, 0.085, -0.02);                         // Rotpunktvisier
      add(rb(0.012, 0.05, 0.16), M, 0, -0.005, 0.21);                         // eingeklappter Schaft
      grip(); guard();
      break;
    case 'puls': // Salvengewehr
      add(rb(0.066, 0.094, 0.34), F, 0, 0, 0);
      add(rb(0.062, 0.074, 0.24), F, 0, 0.002, -0.28);
      for (let k = 0; k < 4; k++) add(rb(0.064, 0.016, 0.03), P, 0, 0.0, -0.2 - k * 0.05);
      add(cy(0.012, 0.13), M, 0, 0.005, -0.46);
      add(rb(0.03, 0.03, 0.05), M, 0, 0.005, -0.54);                         // Mündungsbremse
      add(rb(0.034, 0.17, 0.058), P, 0, -0.11, -0.05, 0.28);
      add(rb(0.05, 0.085, 0.22), F, 0, -0.015, 0.27);                        // Schaft
      add(rb(0.052, 0.03, 0.12), P, 0, 0.035, 0.27);
      rail(0.24, -0.06);
      add(cy(0.022, 0.13), P, 0, 0.1, -0.05);                                 // Zielfernrohr
      add(rb(0.02, 0.035, 0.02), M, 0, 0.075, -0.09); add(rb(0.02, 0.035, 0.02), M, 0, 0.075, 0.0);
      grip(0.09); guard(0.04);
      break;
    case 'hagel': // Schrotflinte
      add(rb(0.07, 0.1, 0.26), P, 0, 0, 0);
      add(cy(0.021, 0.38), M, 0, 0.025, -0.31);
      add(cy(0.017, 0.3), M, 0, -0.022, -0.27);
      add(rb(0.062, 0.062, 0.13), F, 0, -0.022, -0.27);                       // Vorderschaft
      for (let k = 0; k < 4; k++) add(rb(0.064, 0.008, 0.012), P, 0, 0.012, -0.22 - k * 0.025);
      add(rb(0.052, 0.095, 0.24), F, 0, -0.025, 0.24);
      add(rb(0.018, 0.022, 0.03), M, 0, 0.055, -0.47);                        // Korn
      grip(0.08); guard(0.03);
      break;
    case 'lanze': { // Railgun
      add(rb(0.07, 0.096, 0.42), M, 0, 0, 0);
      for (const sx of [-0.026, 0.026]) add(rb(0.016, 0.026, 0.46), M, sx, 0.0, -0.42);
      const copper = wmat('copper', () => envMat(new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.9, roughness: 0.3 }), 1));
      for (let k = 0; k < 5; k++) add(partGeo('coil', () => new THREE.TorusGeometry(0.045, 0.008, 6, 18)), copper, 0, 0, -0.26 - k * 0.07);
      add(rb(0.054, 0.08, 0.24), F, 0, -0.02, 0.32);
      add(cy(0.027, 0.24), P, 0, 0.11, -0.04);
      add(cy(0.032, 0.03), M, 0, 0.11, -0.17); add(cy(0.03, 0.03), M, 0, 0.11, 0.08);
      add(rb(0.02, 0.04, 0.02), M, 0, 0.075, -0.1); add(rb(0.02, 0.04, 0.02), M, 0, 0.075, 0.03);
      grip(0.12); guard(0.07);
      break;
    }
    case 'dorn': // Präzisionspistole
      add(rb(0.034, 0.046, 0.2), M, 0, 0.022, -0.04);
      add(rb(0.032, 0.03, 0.18), P, 0, -0.012, -0.035);
      add(rb(0.032, 0.1, 0.05), P, 0, -0.07, 0.04, -0.25);
      add(rb(0.008, 0.014, 0.05), M, 0, -0.04, -0.02);
      add(rb(0.01, 0.012, 0.012), M, 0, 0.05, -0.13);
      break;
    case 'moerser': // Granatwerfer mit Trommel
      add(rb(0.07, 0.09, 0.22), P, 0, 0, 0.02);
      add(cy(0.046, 0.3), F, 0, 0.01, -0.25);
      add(cy(0.036, 0.02), M, 0, 0.01, -0.41);
      add(partGeo('drum', () => new THREE.CylinderGeometry(0.058, 0.058, 0.12, 10).rotateX(Math.PI / 2)), M, 0, -0.035, -0.06);
      add(rb(0.05, 0.08, 0.2), F, 0, -0.02, 0.22);
      add(rb(0.012, 0.06, 0.012), M, 0, 0.07, -0.12);                         // Klappvisier
      grip(0.09); guard(0.04);
      break;
    default:
      add(rb(0.07, 0.09, 0.4), M, 0, 0, 0);
  }
  return g;
}

// ---------------------------------------------------------------- Figuren: Soldat in realistischer Ausrüstung (eigener Entwurf)
/** Kampfanzug, Plattenträger, Gefechtshelm mit Nachtsichthalterung, Sturmhaube und Schutzbrille.
 *  Teamzugehörigkeit: farbige Armbinde und ein kleines Blinklicht am Helm. Gliedmaßen an Gelenken für die Animation. */
/** Randlicht (Fresnel): Kanten der Figur leuchten in einer Farbe – macht Gegner vor jedem Hintergrund sichtbar */
export function addRim(mat, color, strength = 1) {
  const rc = new THREE.Color(color);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.rimCol = { value: rc.multiplyScalar(strength) };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 rimCol;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  float rimF = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 2.6);\n  totalEmissiveRadiance += rimCol * rimF;');
  };
  mat.customProgramCacheKey = () => 'rim';
  return mat;
}
export function makeCharacter(teamCol, accent, rim = null) {
  const g = new THREE.Group();
  const std = (color, rough, metal = 0, env = 0.3) => { const m0 = envMat(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, transparent: true }), env); return rim ? addRim(m0, rim, 0.9) : m0; };
  const uniform = std(0x59604c, 0.92), pants = std(0x4e5444, 0.92), carrier = std(0x4d5141, 0.85), pouch = std(0x454838, 0.88);
  const helmet = std(0x50553f, 0.6, 0.05, 0.5), dark = std(0x1d1e1f, 0.8), boot = std(0x2c2621, 0.75), glove = std(0x232323, 0.8);
  const lens = std(0x0b0c0d, 0.08, 0.9, 1.5);
  const band = new THREE.MeshStandardMaterial({ color: teamCol, emissive: teamCol, emissiveIntensity: 0.25, roughness: 0.6, transparent: true });
  const strobe = new THREE.MeshBasicMaterial({ color: accent, transparent: true, toneMapped: false });
  const cap = (r, l) => partGeo(`cap${r}_${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 10));
  const rb = (w, h, d, r = 0.3) => partGeo(`h${w}_${h}_${d}_${r}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * r));
  const add = (parent, geo, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; parent.add(m); return m; };
  const legs = [], knees = [], arms = [];
  const torso = new THREE.Group(); torso.position.y = 0.98; g.add(torso);
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0.11 * s, 0.95, 0); g.add(hip);
    add(hip, cap(0.088, 0.3), pants, 0, -0.22, 0);                               // Oberschenkel
    add(hip, rb(0.05, 0.15, 0.13), pouch, 0.095 * s, -0.2, 0.01);               // Beintasche
    const knee = new THREE.Group(); knee.position.set(0, -0.45, 0); hip.add(knee);
    add(knee, rb(0.13, 0.13, 0.07, 0.45), dark, 0, 0.0, -0.075);                // Knieschoner
    add(knee, cap(0.075, 0.3), pants, 0, -0.2, 0);                              // Unterschenkel
    add(knee, rb(0.13, 0.12, 0.27, 0.35), boot, 0, -0.42, -0.04);               // Stiefel
    legs.push(hip); knees.push(knee);
  }
  add(torso, rb(0.36, 0.2, 0.22, 0.45), pants, 0, 0.02, 0);                     // Becken
  add(torso, rb(0.39, 0.06, 0.25), dark, 0, 0.1, 0);                            // Gürtel
  add(torso, cap(0.17, 0.2), uniform, 0, 0.33, 0);                              // Oberkörper
  const chest = add(torso, rb(0.4, 0.34, 0.1, 0.25), carrier, 0, 0.36, -0.12);  // Plattenträger vorn
  add(torso, rb(0.38, 0.33, 0.08, 0.25), carrier, 0, 0.36, 0.13);              // Rückenplatte
  for (const s of [-1, 1]) add(torso, rb(0.06, 0.2, 0.24, 0.3), carrier, 0.19 * s, 0.31, 0); // Seitenteile
  for (let k = -1; k <= 1; k++) add(torso, rb(0.1, 0.12, 0.07, 0.25), pouch, k * 0.11, 0.26, -0.19); // Magazintaschen
  add(torso, rb(0.08, 0.1, 0.05), pouch, -0.12, 0.42, -0.18);                   // Funkgerät
  add(torso, partGeo('ant2', () => new THREE.CylinderGeometry(0.005, 0.005, 0.32, 4)), dark, -0.15, 0.62, 0.15);
  add(torso, rb(0.3, 0.32, 0.14, 0.35), pouch, 0, 0.36, 0.23);                  // Rucksack
  const head = new THREE.Group(); head.position.set(0, 0.58, 0); torso.add(head);
  add(head, cap(0.06, 0.06), dark, 0, 0.0, 0);                                   // Hals
  add(head, partGeo('headball', () => new THREE.SphereGeometry(0.115, 16, 12)), dark, 0, 0.12, 0); // Kopf mit Sturmhaube
  add(head, rb(0.2, 0.05, 0.05, 0.45), lens, 0, 0.13, -0.098);                  // Schutzbrille
  const hm = add(head, partGeo('helm', () => new THREE.SphereGeometry(0.142, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55)), helmet, 0, 0.13, 0.01); // Gefechtshelm
  hm.scale.set(1, 0.95, 1.07);
  add(head, rb(0.06, 0.035, 0.04), dark, 0, 0.215, -0.13);                     // Nachtsichthalterung
  for (const s of [-1, 1]) add(head, rb(0.012, 0.03, 0.15), dark, 0.135 * s, 0.15, 0.01); // Helmschienen
  add(head, rb(0.018, 0.018, 0.018), strobe, 0, 0.28, 0.06);                     // Blinklicht (Teamerkennung)
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.24 * s, 0.47, 0); torso.add(sh);
    add(sh, cap(0.07, 0.2), uniform, 0, -0.14, 0);                               // Oberarm
    add(sh, partGeo('armband', () => new THREE.CylinderGeometry(0.078, 0.078, 0.06, 12, 1, true)), band, 0, -0.09, 0); // Armbinde
    add(sh, cap(0.062, 0.2), uniform, 0, -0.38, -0.05);                          // Unterarm
    add(sh, rb(0.08, 0.1, 0.09, 0.4), glove, 0, -0.54, -0.07);                   // Handschuh
    arms.push(sh);
  }
  const gun = new THREE.Group();
  gun.position.set(0.14, 0.24, -0.3);
  torso.add(gun);
  arms[0].rotation.x = -1.15; arms[1].rotation.x = -1.3; arms[0].rotation.z = -0.3; arms[1].rotation.z = 0.5;
  const rig = { group: g, legs, knees, arms, torso, head, chest, gun, mats: [uniform, pants, carrier, pouch, helmet, dark, boot, glove, lens, band, strobe], phase: Math.random() * 6, kick: 0, lean: 0, weaponId: null };
  rig.setWeapon = (id) => {
    if (rig.weaponId === id) return;
    rig.weaponId = id;
    gun.clear();
    if (id) gun.add(makeWeapon(id, accent));
  };
  rig.setWeapon('puls');
  return rig;
}
/** Lauf-, Sprint- und Sprunghaltung aus Tempo und Bodenkontakt, dazu Rückstoß beim Schießen */
export function animateCharacter(rig, speed, airborne, dt) {
  const k = Math.min(1, speed / 9);
  rig.phase += dt * (4 + speed * 0.85);
  const s = Math.sin(rig.phase);
  const lerp = (o, key, target, rate = 12) => { o[key] += (target - o[key]) * Math.min(1, dt * rate); };
  if (airborne) {
    lerp(rig.legs[0].rotation, 'x', -0.9); lerp(rig.legs[1].rotation, 'x', 0.4);
    lerp(rig.knees[0].rotation, 'x', 1.2); lerp(rig.knees[1].rotation, 'x', 0.5);
  } else {
    rig.legs[0].rotation.x = s * 0.75 * k; rig.legs[1].rotation.x = -s * 0.75 * k;
    rig.knees[0].rotation.x = Math.max(0, -Math.cos(rig.phase)) * 1.1 * k;
    rig.knees[1].rotation.x = Math.max(0, Math.cos(rig.phase)) * 1.1 * k;
  }
  lerp(rig, 'lean', -0.18 * k, 6);
  rig.torso.rotation.x = rig.lean;
  rig.torso.position.y = 0.98 + Math.abs(Math.cos(rig.phase)) * 0.04 * k - (airborne ? 0 : 0.03 * k);
  rig.torso.rotation.y = Math.sin(rig.phase) * 0.06 * k;
  rig.head.rotation.x = -rig.lean * 0.8;
  rig.kick = Math.max(0, rig.kick - dt * 8);
  rig.gun.position.z = -0.3 + rig.kick * 0.07;
  rig.arms[0].rotation.x = -1.15 - rig.kick * 0.2; rig.arms[1].rotation.x = -1.3 - rig.kick * 0.2;
}

// ---------------------------------------------------------------- Effekte
const SPRITE_TEX = {};
function spriteTex(kind) {
  if (SPRITE_TEX[kind]) return SPRITE_TEX[kind];
  const [c, g] = canvas(64, 64);
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (kind === 'flash') { r.addColorStop(0, 'rgba(255,255,240,1)'); r.addColorStop(0.3, 'rgba(255,200,90,0.9)'); r.addColorStop(1, 'rgba(255,120,0,0)'); }
  else { r.addColorStop(0, 'rgba(200,200,205,0.7)'); r.addColorStop(0.6, 'rgba(150,150,160,0.35)'); r.addColorStop(1, 'rgba(120,120,130,0)'); }
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (SPRITE_TEX[kind] = t);
}
/** Kleine Partikel-Verwaltung: Mündungsfeuer, Rauch, Staub, Zerfallssplitter */
export function createEffects(scene) {
  const list = [];
  const light = new THREE.PointLight(0xffc070, 0, 14, 2);
  scene.add(light);
  let lightT = 0;
  const fx = {
    flash(pos, scale = 1, withLight = true) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex('flash'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
      s.position.copy(pos); s.scale.setScalar(0.7 * scale); s.material.rotation = Math.random() * 6;
      scene.add(s); list.push({ o: s, life: 0.05, max: 0.05, grow: 2 });
      if (withLight) { light.position.copy(pos); light.intensity = 25 * scale; lightT = 0.06; }
    },
    quality: 1,
    smoke(pos, n = 6, size = 2, color = 0xb8b8c0, rise = 1.5) {
      if (fx.quality === 0) { if (Math.random() < 0.5) return; n = Math.ceil(n / 3); }
      for (let i = 0; i < n; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex('smoke'), color, depthWrite: false, transparent: true, opacity: 0.7 }));
        s.position.set(pos.x + (Math.random() - 0.5) * size * 0.6, pos.y + (Math.random() - 0.5) * size * 0.4, pos.z + (Math.random() - 0.5) * size * 0.6);
        s.scale.setScalar(size * (0.5 + Math.random() * 0.5));
        scene.add(s);
        list.push({ o: s, life: 1.2 + Math.random(), max: 2.2, grow: size * 0.8, vy: rise * (0.5 + Math.random()), fade: true });
      }
    },
    shards(pos, color, n = 1) {
      if (fx.quality === 0) { if (Math.random() < 0.6) return; n = 1; }
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(partGeo('shard', () => new THREE.BoxGeometry(0.25, 0.25, 0.25)), new THREE.MeshBasicMaterial({ color, transparent: true, toneMapped: false }));
        m.position.set(pos.x, pos.y, pos.z);
        m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        scene.add(m);
        list.push({ o: m, life: 1.5 + Math.random(), max: 2.5, vy: 2 + Math.random() * 3, spin: true, fade: true });
      }
    },
    /** Patronenhülse, die aus dem Auswurffenster fliegt */
    casing(pos, vel) {
      if (fx.quality === 0) return;
      const m = new THREE.Mesh(partGeo('casing', () => new THREE.CylinderGeometry(0.006, 0.006, 0.028, 6).rotateZ(Math.PI / 2)), wmat('brass', () => new THREE.MeshStandardMaterial({ color: 0xc9a54a, metalness: 0.9, roughness: 0.3 })));
      m.position.copy(pos);
      scene.add(m);
      list.push({ o: m, life: 0.9, max: 0.9, v: vel.clone(), tumble: true, shared: true });
    },
    update(dt) {
      lightT -= dt;
      light.intensity = lightT > 0 ? light.intensity : 0;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= dt;
        if (p.vy) p.o.position.y += p.vy * dt;
        if (p.v) { p.v.y -= 9.8 * dt; p.o.position.addScaledVector(p.v, dt); }
        if (p.tumble) { p.o.rotation.x += dt * 18; p.o.rotation.z += dt * 11; }
        if (p.grow) p.o.scale.multiplyScalar(1 + p.grow * dt * 0.3);
        if (p.spin) { p.o.rotation.x += dt * 2; p.o.rotation.y += dt * 3; }
        if (p.fade) p.o.material.opacity = Math.max(0, Math.min(1, p.life / p.max * 1.4)) * (p.o.isSprite ? 0.7 : 1);
        if (p.life <= 0) { scene.remove(p.o); if (!p.shared) p.o.material.dispose(); list.splice(i, 1); }
      }
    },
    clear() { for (const p of list) { scene.remove(p.o); if (!p.shared) p.o.material.dispose(); } list.length = 0; },
  };
  return fx;
}

#!/usr/bin/env node
// Lädt die Foto-Texturen von Poly Haven (CC0) in höherer Auflösung nach: 2k und/oder 4k.
// Aufruf:  npm run assets -- 4k      (oder: 2k, oder: 2k 4k)
// Ziel:    public/textures/<id>/<auflösung>/{diff,nor,rough}.jpg   (nicht im Git, siehe .gitignore)
// Jede Datei wird mit der MD5-Prüfsumme von Poly Haven verglichen. Vorhandene, korrekte Dateien werden übersprungen.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IDS = ['asphalt_02', 'concrete_pavers_02', 'white_plaster_rough_02', 'concrete_panels', 'worn_corrugated_iron', 'gravel_concrete', 'rough_concrete'];
const MAPS = { diff: 'Diffuse', nor: 'nor_gl', rough: 'Rough' };
const res = process.argv.slice(2).filter((a) => /^(1k|2k|4k)$/.test(a));
if (!res.length) { console.error('Bitte Auflösung angeben: npm run assets -- 2k   oder   npm run assets -- 4k'); process.exit(1); }

/** Holt eine URL. Zuerst mit fetch; hinter einem Firmen-Proxy notfalls mit curl. */
async function get(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'zerfallzone-assets/1.0' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return Buffer.from(await r.arrayBuffer());
  } catch (e) {
    try { return execFileSync('curl', ['-sfL', '--max-time', '300', url], { maxBuffer: 512 * 1024 * 1024 }); }
    catch { throw new Error(`Download fehlgeschlagen: ${url} (${e.message})`); }
  }
}
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');

let total = 0, skipped = 0;
for (const id of IDS) {
  const files = JSON.parse((await get(`https://api.polyhaven.com/files/${id}`)).toString());
  for (const r of res) {
    const dir = path.join(ROOT, 'public', 'textures', id, r);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, key] of Object.entries(MAPS)) {
      const info = files[key]?.[r]?.jpg;
      if (!info) { console.warn(`  ${id} ${r} ${name}: bei Poly Haven nicht vorhanden`); continue; }
      const file = path.join(dir, name + '.jpg');
      if (fs.existsSync(file) && md5(fs.readFileSync(file)) === info.md5) { skipped++; continue; }
      const data = await get(info.url);
      if (md5(data) !== info.md5) throw new Error(`Prüfsumme falsch: ${id} ${r} ${name}`);
      fs.writeFileSync(file, data);
      total += data.length;
      console.log(`  ok  ${id}/${r}/${name}.jpg  ${(data.length / 1e6).toFixed(1)} MB`);
    }
  }
}
console.log(`Fertig: ${(total / 1e6).toFixed(1)} MB geladen, ${skipped} Dateien waren schon aktuell. Lizenz: CC0 (Poly Haven), Urheber in public/ASSETS-LICENSES.md`);

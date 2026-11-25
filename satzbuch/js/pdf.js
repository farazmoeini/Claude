// Text aus einem PDF holen (pdf.js). Zeilen werden aus der Position der Textstücke
// rekonstruiert; Tabellen werden über die Spaltenpositionen zurückgebaut (Zellen durch Tabs getrennt).
export const PDFJS_VERSION = "4.10.38";
export const PDFJS_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.mjs`;
export const PDFJS_WORKER_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

let pdfjs = null;
async function lade() {
  if (!pdfjs) {
    pdfjs = await import(PDFJS_URL);
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  }
  return pdfjs;
}

function zeileAlsText(teile) {
  let out = "", ende = null;
  for (const t of [...teile].sort((a, b) => a.x - b.x)) {
    if (ende !== null) {
      const luecke = t.x - ende;
      out += luecke > Math.max(12, (t.h || 10) * 1.5) ? "\t" : luecke > 1 ? " " : "";
    }
    out += t.str;
    ende = t.x + (t.w || 0);
  }
  return out.trim();
}

const RE_KOPF = /^(übung|uebung|übungen)$/i;

/**
 * Textstücke ({str, x, y, w, h}) einer Seite zu Zeilen zusammensetzen.
 * Tabellen (Kopfzeile beginnt mit „Übung“) werden anhand der Spaltenpositionen
 * zurückgebaut: umbrochene Zellen werden wieder zusammengefügt, jede Tabellenzeile
 * wird zu einer Zeile mit Tabs zwischen den Zellen.
 * `zustand` trägt eine offene Tabelle über Seitenwechsel.
 */
export function stueckeZuZeilen(stuecke, zustand = {}) {
  const zeilen = [];
  const sortiert = stuecke.filter((s) => s.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  for (const s of sortiert) {
    const toleranz = Math.max(2, (s.h || 10) * 0.5);
    let z = zeilen.find((z) => Math.abs(z.y - s.y) <= toleranz);
    if (!z) zeilen.push((z = { y: s.y, h: 0, teile: [] }));
    z.teile.push(s);
    z.h = Math.max(z.h, s.h || 10);
  }
  zeilen.sort((a, b) => b.y - a.y);

  const out = [];
  let block = null; // Zeilen einer Tabellenzeile (inkl. umbrochener Zellen)
  const flush = () => {
    if (!block) return;
    const sp = zustand.spalten;
    const zellen = sp.map(() => []);
    for (const z of block) for (const t of z.teile) {
      let i = sp.length - 1;
      while (i > 0 && t.x < sp[i] - 4) i--;
      zellen[i].push({ ...t, zy: z.y });
    }
    const texte = zellen.map((c) => c.sort((a, b) => b.zy - a.zy || a.x - b.x).map((t) => t.str.trim()).join(" ").replace(/\s+/g, " ").trim());
    while (texte.length > 1 && !texte[texte.length - 1]) texte.pop();
    out.push(texte.length > 1 ? texte.join("\t") : texte[0] ?? "");
    block = null;
  };

  for (const z of zeilen) {
    const teile = [...z.teile].sort((a, b) => a.x - b.x);
    if (teile.length >= 3 && RE_KOPF.test(teile[0].str.trim())) {
      flush();
      zustand.spalten = teile.map((t) => t.x);
      zustand.h = z.h;
      out.push(teile.map((t) => t.str.trim()).join("\t"));
      zustand.letztesY = z.y;
      continue;
    }
    if (zustand.spalten && z.h > zustand.h * 1.3) { flush(); zustand.spalten = null; }
    if (!zustand.spalten) { out.push(zeileAlsText(teile)); continue; }
    const abstand = block ? block[block.length - 1].y - z.y : Infinity;
    if (block && abstand < zustand.h * 1.5) block.push(z);
    else { flush(); block = [z]; }
  }
  flush();
  return out;
}

export async function pdfZuText(file) {
  const lib = await lade();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const alle = [];
  const zustand = {};
  for (let i = 1; i <= doc.numPages; i++) {
    const seite = await doc.getPage(i);
    const inhalt = await seite.getTextContent();
    const stuecke = inhalt.items.map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height }));
    alle.push(...stueckeZuZeilen(stuecke, zustand), "");
  }
  return alle.join("\n");
}

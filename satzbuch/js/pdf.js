// Text aus einem PDF holen (pdf.js). Zeilen werden aus der Position der Textstücke
// rekonstruiert; große Lücken innerhalb einer Zeile werden zu Tabs (Tabellenspalten).
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

/** Textstücke ({str, x, y, w, h}) einer Seite zu Zeilen zusammensetzen. */
export function stueckeZuZeilen(stuecke) {
  const zeilen = [];
  const sortiert = stuecke.filter((s) => s.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  for (const s of sortiert) {
    const toleranz = Math.max(2, (s.h || 10) * 0.5);
    let z = zeilen.find((z) => Math.abs(z.y - s.y) <= toleranz);
    if (!z) zeilen.push((z = { y: s.y, teile: [] }));
    z.teile.push(s);
  }
  return zeilen
    .sort((a, b) => b.y - a.y)
    .map((z) => {
      z.teile.sort((a, b) => a.x - b.x);
      let out = "", ende = null;
      for (const t of z.teile) {
        if (ende !== null) {
          const luecke = t.x - ende;
          out += luecke > Math.max(12, (t.h || 10) * 1.5) ? "\t" : luecke > 1 ? " " : "";
        }
        out += t.str;
        ende = t.x + (t.w || 0);
      }
      return out.trim();
    });
}

export async function pdfZuText(file) {
  const lib = await lade();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const alle = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const seite = await doc.getPage(i);
    const inhalt = await seite.getTextContent();
    const stuecke = inhalt.items.map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height }));
    alle.push(...stueckeZuZeilen(stuecke), "");
  }
  return alle.join("\n");
}

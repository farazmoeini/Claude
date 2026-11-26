// Dateien in Text umwandeln, den der Plan-Parser versteht (Tabellenzeilen mit Tabs).
// Word (.docx) und Excel (.xlsx) sind ZIP-Archive mit XML; entpackt wird mit der
// eingebauten DecompressionStream-API, ohne Bibliothek.

/** Art der Datei anhand von Endung und MIME-Typ, oder null wenn nicht unterstützt. */
export function dateiArt(datei) {
  const name = String(datei?.name ?? "").toLowerCase();
  const typ = String(datei?.type ?? "").toLowerCase();
  const endung = name.includes(".") ? name.split(".").pop() : "";
  if (endung === "pdf" || typ === "application/pdf") return "pdf";
  if (endung === "docx" || typ.includes("wordprocessingml")) return "docx";
  if (endung === "xlsx" || typ.includes("spreadsheetml")) return "xlsx";
  if (endung === "csv" || endung === "tsv" || typ === "text/csv" || typ === "text/tab-separated-values") return "csv";
  if (endung === "json" || typ === "application/json") return "json";
  if (["txt", "md", "text"].includes(endung) || typ === "text/plain" || typ === "text/markdown") return "text";
  if (typ.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic"].includes(endung)) return "bild";
  return null;
}

// ---------- ZIP ----------
async function zipOeffnen(buffer) {
  const dv = new DataView(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Die Datei ist beschädigt oder kein Word-/Excel-Dokument.");
  const anzahl = dv.getUint16(eocd + 10, true);
  let pos = dv.getUint32(eocd + 16, true);
  const eintraege = new Map();
  for (let k = 0; k < anzahl && dv.getUint32(pos, true) === 0x02014b50; k++) {
    const methode = dv.getUint16(pos + 10, true);
    const groesse = dv.getUint32(pos + 20, true);
    const nameLen = dv.getUint16(pos + 28, true), extraLen = dv.getUint16(pos + 30, true), kommLen = dv.getUint16(pos + 32, true);
    const lokal = dv.getUint32(pos + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buffer, pos + 46, nameLen));
    eintraege.set(name, { methode, groesse, lokal });
    pos += 46 + nameLen + extraLen + kommLen;
  }
  return {
    namen: [...eintraege.keys()],
    async text(name) {
      const e = eintraege.get(name);
      if (!e) return null;
      const start = e.lokal + 30 + dv.getUint16(e.lokal + 26, true) + dv.getUint16(e.lokal + 28, true);
      const roh = new Uint8Array(buffer, start, e.groesse);
      let bytes = roh;
      if (e.methode === 8) {
        const strom = new Blob([roh]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        bytes = new Uint8Array(await new Response(strom).arrayBuffer());
      } else if (e.methode !== 0) throw new Error("Dieses Dokument ist mit einem unbekannten Verfahren gepackt.");
      return new TextDecoder().decode(bytes);
    },
  };
}

const entities = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");
const sauber = (s) => s.replace(/[\t\s]+/g, " ").trim();

// ---------- Word ----------
function absatzText(xml) {
  return entities(
    xml.replace(/<w:tab\/>/g, "\t").replace(/<w:br\/>/g, " ")
      .replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<[^>]+>/g, (_, t) => t ?? "")
  );
}

export async function docxZuText(buffer) {
  const zip = await zipOeffnen(buffer);
  const xml = await zip.text("word/document.xml");
  if (!xml) throw new Error("In diesem Word-Dokument wurde kein Text gefunden.");
  const zeilen = [];
  const koerper = xml.replace(/^[\s\S]*?<w:body>/, "").replace(/<\/w:body>[\s\S]*$/, "");
  for (const teil of koerper.split(/(<w:tbl>[\s\S]*?<\/w:tbl>)/)) {
    if (teil.startsWith("<w:tbl>")) {
      for (const zeile of teil.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []) {
        const zellen = (zeile.match(/<w:tc[ >][\s\S]*?<\/w:tc>/g) ?? []).map((tc) =>
          sauber((tc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map(absatzText).join(" "))
        );
        if (zellen.some(Boolean)) zeilen.push(zellen.join("\t"));
      }
    } else {
      for (const p of teil.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) ?? []) {
        const t = absatzText(p).split("\t").map(sauber).filter(Boolean).join("\t");
        if (t) zeilen.push(t);
      }
    }
  }
  return zeilen.join("\n");
}

// ---------- Excel ----------
function spalteIndex(ref) {
  const buchstaben = String(ref).match(/^[A-Z]+/)?.[0] ?? "A";
  return [...buchstaben].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1;
}
const zahlText = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n * 1000) / 1000).replace(".", ",") : v;
};

export async function xlsxZuText(buffer) {
  const zip = await zipOeffnen(buffer);
  const sst = await zip.text("xl/sharedStrings.xml");
  const strings = sst ? (sst.match(/<si>[\s\S]*?<\/si>/g) ?? []).map((si) => entities((si.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join(""))) : [];
  const wb = (await zip.text("xl/workbook.xml")) ?? "";
  const blattNamen = [...wb.matchAll(/<sheet\s[^>]*name="([^"]*)"/g)].map((m) => entities(m[1]));
  const blaetter = zip.namen
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));
  const zeilen = [];
  for (const [i, blatt] of blaetter.entries()) {
    const xml = await zip.text(blatt);
    if (blaetter.length > 1 && blattNamen[i]) zeilen.push(`${blattNamen[i]}:`);
    for (const row of xml.match(/<row[ >][\s\S]*?<\/row>/g) ?? []) {
      const zellen = [];
      for (const c of row.match(/<c\s[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
        const ref = c.match(/\sr="([A-Z]+\d+)"/)?.[1];
        const typ = c.match(/\st="([^"]+)"/)?.[1];
        const v = c.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let wert = "";
        if (typ === "s" && v != null) wert = strings[Number(v)] ?? "";
        else if (typ === "inlineStr") wert = entities((c.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/) ?? [])[1] ?? "");
        else if (typ === "str" || typ === "b") wert = entities(v ?? "");
        else if (v != null) wert = zahlText(v);
        zellen[ref ? spalteIndex(ref) : zellen.length] = sauber(wert);
      }
      const z = Array.from(zellen, (x) => x ?? "");
      while (z.length && !z[z.length - 1]) z.pop();
      if (z.length) zeilen.push(z.join("\t"));
    }
  }
  return zeilen.join("\n");
}

// ---------- CSV ----------
export function csvZuText(text) {
  const zeilen = String(text ?? "").replace(/^﻿/, "").split(/\r?\n/);
  const probe = zeilen.find((z) => /[;,\t]/.test(z)) ?? "";
  const trenner = probe.includes("\t") ? "\t" : (probe.match(/;/g)?.length ?? 0) >= (probe.match(/,/g)?.length ?? 0) ? ";" : ",";
  return zeilen.map((z) => {
    if (!z.includes(trenner)) return z;
    const zellen = [];
    let akt = "", inAnf = false;
    for (let i = 0; i < z.length; i++) {
      const c = z[i];
      if (c === '"') { if (inAnf && z[i + 1] === '"') { akt += '"'; i++; } else inAnf = !inAnf; }
      else if (c === trenner && !inAnf) { zellen.push(akt.trim()); akt = ""; }
      else akt += c;
    }
    zellen.push(akt.trim());
    return zellen.join("\t");
  }).join("\n");
}

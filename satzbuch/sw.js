// Offline-Cache. App-Dateien: aus dem Cache, im Hintergrund aktualisieren.
// pdf.js (cdnjs): einmal laden, dann aus dem Cache. Pläne: Netz zuerst.
const VERSION = "satzbuch-v2";
const APP = [
  "./", "index.html", "style.css", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png",
  "js/ui.js", "js/store.js", "js/parser.js", "js/stats.js", "js/util.js", "js/pdf.js", "js/claude.js",
  "plans/index.json",
];
const PDFJS = [
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(APP);
    await Promise.all(PDFJS.map((u) => c.add(new Request(u, { mode: "cors" })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "cdnjs.cloudflare.com") {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => {
      if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  if (url.pathname.includes("/plans/")) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const k = res.clone(); caches.open(VERSION).then((c) => c.put(req.url, k)); }
      return res;
    }).catch(() => caches.match(req.url)));
    return;
  }
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const treffer = await cache.match(req, { ignoreSearch: true }) || (req.mode === "navigate" ? await cache.match("index.html") : null);
    const netz = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    return treffer || (await netz) || new Response("Offline", { status: 503 });
  })());
});

// Offline-Cache. App-Dateien und Pläne: Netz zuerst (immer neueste Version), ohne Netz aus dem Cache.
// pdf.js (cdnjs): einmal laden, dann aus dem Cache.
const VERSION = "satzbuch-v13";
const STATUS = "overload-status"; // merkt sich, für welches Pausenende schon benachrichtigt wurde
const APP = [
  "./", "index.html", "style.css", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png",
  "js/ui.js", "js/store.js", "js/parser.js", "js/stats.js", "js/util.js", "js/pdf.js", "js/claude.js",
  "plans/index.json",
];
const PDFJS = [
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs",
];
const NETZ_TIMEOUT_MS = 4000;

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // cache: "reload" umgeht den HTTP-Cache des Browsers, sonst landen alte Dateien im neuen Cache.
    await c.addAll(APP.map((u) => new Request(u, { cache: "reload" })));
    await Promise.all(PDFJS.map((u) => c.add(new Request(u, { mode: "cors" })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k !== STATUS) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function netzZuerst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await Promise.race([
      fetch(req, { cache: "no-cache" }),
      new Promise((_, nein) => setTimeout(() => nein(new Error("Zeitüberschreitung")), NETZ_TIMEOUT_MS)),
    ]);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true }))
      || (req.mode === "navigate" ? await cache.match("index.html") : null)
      || new Response("Offline", { status: 503 });
  }
}

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
  e.respondWith(netzZuerst(req));
});

// ---------- Pausenende als Benachrichtigung, wenn die App nicht sichtbar ist ----------
// Die App meldet jeden neuen/geänderten Timer. Der Dienst wartet bis zum Ende (Chrome erlaubt
// bis zu 5 Min.) und benachrichtigt nur, wenn gerade kein App-Fenster sichtbar ist.
let aktuellerTimer = null;

self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.typ !== "timer") return;
  aktuellerTimer = d.timer || null;
  if (!aktuellerTimer) return;
  const meiner = aktuellerTimer;
  const warten = Math.max(0, meiner.endetUm - Date.now());
  if (warten > 290_000) return; // länger als Chrome den Dienst wachhält
  e.waitUntil(new Promise((r) => setTimeout(r, warten)).then(async () => {
    if (aktuellerTimer !== meiner) return; // inzwischen geändert, gestoppt oder neuer Satz
    const fenster = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (fenster.some((c) => c.visibilityState === "visible")) return; // App piept selbst
    await self.registration.showNotification("Pause vorbei", {
      body: meiner.text || "Nächster Satz!",
      tag: "pause",
      renotify: true,
      silent: false,
      vibrate: [500, 150, 500, 150, 900],
      icon: "icon-192.png",
      badge: "icon-192.png",
    });
    const c = await caches.open(STATUS);
    await c.put("gemeldet", new Response(String(meiner.endetUm)));
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const fenster = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const app = fenster.find((c) => new URL(c.url).pathname.startsWith(new URL(self.registration.scope).pathname));
    if (app) return app.focus();
    return self.clients.openWindow("./");
  })());
});

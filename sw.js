/* Service worker – offline režim pro generátor příspěvků.
   Strategie: nejdřív síť (ať máš vždy aktuální verzi), při výpadku sáhne do cache. */
const CACHE = "brumovice-generator-v11";
const ASSETS = [
  "./",
  "./index.html",
  "./nacist-hrace.html",
  "./render.js",
  "./logo-data.js",
  "./opponents-data.js",
  "./cover-data.js",
  "./schedule-data.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        // ulož čerstvou kopii do cache (jen stejný původ)
        if (res && res.status === 200 && new URL(req.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
  );
});

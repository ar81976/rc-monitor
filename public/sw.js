// Keeps the app's own files on the device so it opens instantly, even on a weak signal.
// News and prices always come fresh from the network.
const CACHE = "rc-monitor-v4";
const SHELL = [
  "/", "/app.css", "/app.js", "/channels.js", "/manifest.webmanifest",
  "/img/crest-white.png", "/icons/icon-192.png", "/icons/apple-touch-icon.png",
  "/fonts/figtree-latin-400-normal.woff2", "/fonts/figtree-latin-600-normal.woff2",
  "/fonts/figtree-latin-800-normal.woff2", "/fonts/pinyon-script-latin-400-normal.woff2",
  "/fonts/cormorant-garamond-latin-700-normal.woff2",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // Network first, so updates show straight away; fall back to the saved copy when offline.
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request).then(m => m || caches.match("/")))
  );
});

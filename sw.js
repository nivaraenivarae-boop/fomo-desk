/* App shell cache only. Data files are always fetched fresh. No web push (plan B). */
const SHELL = "desk-shell-v2";
const FILES = ["./", "index.html", "app.css", "app.js", "chart.js", "manifest.json", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", e => e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.pathname.includes("/d/")) return;               // live data: network only
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(SHELL).then(c => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request)));
});

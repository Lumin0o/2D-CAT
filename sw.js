// Service worker : met en cache tous les fichiers de l'app (aucune ressource externe).
const CACHE = 'esquisse2d-v0.2.8';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/main.js',
  './js/app.js',
  './js/version.js',
  './js/core/geom.js',
  './js/core/model.js',
  './js/core/query.js',
  './js/core/history.js',
  './js/core/solver.js',
  './js/core/units.js',
  './js/core/calc.js',
  './js/render/viewport.js',
  './js/render/renderer.js',
  './js/render/annotations.js',
  './js/store/db.js',
  './js/store/settings.js',
  './js/ui/icons.js',
  './js/ui/pressable.js',
  './js/ui/popover.js',
  './js/ui/toast.js',
  './js/ui/gestures.js',
  './js/ui/toolbar.js',
  './js/ui/infobar.js',
  './js/ui/panels.js',
  './js/ui/settingsPanel.js',
  './js/ui/keypad.js',
  './js/ui/relations.js',
  './js/ui/tools/base.js',
  './js/ui/tools/registry.js',
  './js/ui/tools/line.js',
  './js/ui/tools/rect.js',
  './js/ui/tools/circle.js',
  './js/ui/tools/arc.js',
  './js/ui/tools/point.js',
  './js/ui/tools/dimension.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
];

// Réseau instable (tunnel) : chaque fichier est réessayé avant d'abandonner l'installation.
async function fetchRetry(url, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (res.ok) return res;
      throw new Error(`${url} : ${res.status}`);
    } catch (err) {
      if (i >= tries - 1) throw err;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
}
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const responses = await Promise.all(ASSETS.map((u) => fetchRetry(u)));
    const c = await caches.open(CACHE);
    await Promise.all(ASSETS.map((u, i) => c.put(u, responses[i])));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
    })
  );
});

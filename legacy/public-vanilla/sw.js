// Network first so a new deploy shows up on the next open; the cache is only the offline fallback.
// Firestore keeps its own offline data.
const CACHE = 'yeojeong-v6';
const SHELL = ['./', './index.html', './styles.css', './app.js', './config.js', './manifest.webmanifest', './icons/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const ok = url.origin === location.origin || url.host === 'www.gstatic.com' || url.host.startsWith('fonts.');
  if (!ok || url.pathname.startsWith('/__/')) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    try {
      const r = await fetch(e.request, url.origin === location.origin ? { cache: 'no-cache' } : undefined);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    } catch {
      return (await c.match(e.request)) || (await c.match('./index.html')) || Response.error();
    }
  }));
});

// E&C Courier service worker
// - Pages are NETWORK-FIRST: every launch while online loads the newest index.html,
//   so pushed updates show up without clearing cookies or reinstalling.
//   The cached copy is only used when offline.
// - Other same-origin files (icons, manifest) are stale-while-revalidate.
// - skipWaiting + clients.claim: a new version of this file takes over immediately.
// No version bump is needed for normal index.html edits.
const CACHE = 'ec-calc-v1';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' }))))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase etc. go straight to the network
  if (req.cache === 'no-store' || url.searchParams.has('v-check')) return; // update checks
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(event, req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
    if (res.redirected) return Response.redirect(res.url, 302);
    if (res.ok) cache.put(req.url, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req.url, { ignoreSearch: true })) ||
      (await cache.match('./')) ||
      (await cache.match('./index.html')) ||
      Response.error();
  }
}

async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return (await network) || Response.error();
}

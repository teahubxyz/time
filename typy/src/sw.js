// The service worker, written for each deploy. Its cache is named for the
// revision, so a new deploy installs fresh files and clears the last one's.
// Everything goes network-first: the page's modules are not versioned, so
// serving them cache-first would pair a fresh page with the last deploy's code.
// The cache is for offline, and every successful fetch keeps it current.
export function serviceWorker(version, shell) {
  return `// typy service worker, revision ${version}
const CACHE = ${JSON.stringify('typy-' + version)};
const SHELL = ${JSON.stringify(shell)};
const OFFLINE = JSON.stringify({error: 'You’re offline. This part needs the network; everything else in typy still works.', code: 'offline'});

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE)
    .then(cache => cache.addAll(SHELL.map(url => new Request(url, {cache: 'reload'}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('typy-') && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  // The API is never cached. Offline, it answers the way the server does when it
  // can't help, so the page shows a sentence instead of a stack trace.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(() => new Response(OFFLINE, {status: 503, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}})));
    return;
  }
  if (request.method !== 'GET' || url.pathname === '/sw.js') return;
  event.respondWith(networkFirst(event, request, url));
});

async function networkFirst(event, request, url) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    // Pages other than the home page carry their own link-preview tags; offline,
    // every page opens from the home page's shell and the app routes it.
    const key = request.mode === 'navigate' ? (url.pathname === '/' ? '/' : null) : request;
    if (response.ok && key) event.waitUntil(cache.put(key, response.clone()));
    return response;
  } catch (error) {
    const cached = request.mode === 'navigate' ? await cache.match('/') : await cache.match(request, {ignoreSearch: true});
    if (cached) return cached;
    throw error;
  }
}
`;
}

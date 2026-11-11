// What has been loaded stays loaded (Alaa, 11 Nov 2026: "every second the user spend on the site should serve for
// loading the paintings .. and cash it so the user doesnt have to load it again"). This worker keeps the site's own
// pictures in the browser. Pictures (assets/): the kept copy answers at once and is refreshed behind it, so a changed
// picture shows on the visit after. The page, its scripts and styles: the network first, so a new version of the site
// shows at once; the kept copy when there is no network, when the server answers with an error, or when it has not
// answered within 5 s. Only this site's own files, only complete answers. It never takes over a page that is already
// open: it starts with the next visit. The address ayn-2024.github.io is shared with other projects: every name here
// starts with "johnnysemaan-" and nothing else is ever touched.
const PREFIX = 'johnnysemaan-', PICTURES = PREFIX + 'pictures-v1', PAGES = PREFIX + 'pages-v1';
const MOST_PICTURES = 240, SLOW = 5000;
const isPicture = url => /\/assets\/.+\.(webp|jpe?g|png|svg|avif)$/i.test(url.pathname);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== PICTURES && name !== PAGES).map(name => caches.delete(name)))));
});

const good = response => response && response.ok && response.type === 'basic' && !response.redirected;
async function keep(cacheName, request, response) {
  if (!good(response)) return;
  try { const cache = await caches.open(cacheName); await cache.put(request, response); } catch (error) { /* a full disk: the site still works from the network */ }
}
async function picture(event) {
  const cache = await caches.open(PICTURES), kept = await cache.match(event.request, { ignoreVary: true });
  const fresh = fetch(event.request).then(response => { keep(PICTURES, event.request, response.clone()); return response; });
  if (kept) { event.waitUntil(fresh.catch(() => {})); return kept; }
  return fresh;
}
async function page(event) {
  const request = event.request, plain = !new URL(request.url).search;   // review addresses (?square=, ?fill=) are not kept
  const kept = await caches.match(request, { ignoreSearch: request.mode === 'navigate' });
  const fresh = fetch(request).then(response => { if (plain) keep(PAGES, request, response.clone()); return response; });
  if (!kept) return fresh;
  event.waitUntil(fresh.catch(() => {}));
  const slow = new Promise(resolve => setTimeout(() => resolve(null), SLOW));
  try {
    const response = await Promise.race([fresh, slow]);
    return response && response.status < 500 ? response : kept;   // no answer in time, or the server's own error page: the kept copy
  } catch (error) { return kept; }
}
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('range')) return;
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;   // this site's folder only
  event.respondWith(isPicture(url) ? picture(event) : page(event));
});

// The page hands over the pictures it has loaded on a first visit (this worker was not yet in charge then): they are
// taken from the browser's own cache, where they just arrived, and kept here. The oldest go when there are too many.
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type !== 'keep' || !Array.isArray(data.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(PICTURES);
    for (const address of data.urls.slice(0, 80)) {
      try {
        const url = new URL(address);
        if (url.origin !== self.location.origin || !isPicture(url) || await cache.match(address)) continue;
        const response = await fetch(address);
        if (good(response)) await cache.put(address, response);
      } catch (error) { /* one picture missing does not stop the others */ }
    }
    const kept = await cache.keys();
    for (const old of kept.slice(0, Math.max(0, kept.length - MOST_PICTURES))) await cache.delete(old);
  })());
});

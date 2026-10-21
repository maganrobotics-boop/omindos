'use strict';

// Website-only cache. Do not share this prefix with Learning or another app.
const CACHE_PREFIX = 'originmind-website-pwa-';
const CACHE_NAME = CACHE_PREFIX + '20261021-v1';
const STATIC_PATHS = new Set([
  '/pwa/offline-zh.html',
  '/pwa/offline-en.html',
  '/pwa/icon-192.png',
  '/pwa/icon-512.png',
  '/pwa/icon-maskable-512.png',
  '/pwa/apple-touch-icon.png'
]);
const PAGE_PATHS = new Set([
  '/', '/about/', '/careers/', '/contact/', '/developers/',
  '/field-work/', '/field-work/mining/', '/field-work/warehouse/',
  '/integration/', '/join/', '/lab/', '/lab/join/', '/lab/alumni/', '/lab/ros2/',
  '/mobility/', '/omindos/', '/privacy/', '/robots/',
  '/robots/articulated/', '/robots/dual-arm/', '/robots/mobile-dual-arm/',
  '/robots/open-frame/', '/robots/quadruped/', '/robots/tracked/',
  '/robots/wheel-legged/', '/robots/wheeled/'
]);
for (const path of [...PAGE_PATHS]) PAGE_PATHS.add('/en' + path);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => Promise.all(
    [...STATIC_PATHS].map(async path => {
      const response = await fetch(new Request(path, { credentials: 'omit', cache: 'reload' }));
      if (!response.ok || response.type === 'opaque') throw new Error('Offline asset unavailable');
      // A host may redirect *.html to a clean URL. Store a fresh Response so a
      // redirected response is never returned for a navigation in manual mode.
      const offlineResponse = new Response(await response.arrayBuffer(), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
      await cache.put(path, offlineResponse);
    })
  )));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))
  )));
  // No skipWaiting or forced reload: existing tabs and active forms stay intact.
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Only fixed offline assets are stored, without cookies or dynamic query keys.
  if (STATIC_PATHS.has(url.pathname) && !url.search) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(url.pathname);
      return cached || fetch(request);
    }));
    return;
  }

  // Never intercept API, account, login, course, honor-board or Cloud requests.
  // Public documents remain network-only; no personalized HTML is ever stored.
  const publicQuery = !url.search || (url.searchParams.size === 1 && url.searchParams.get('source') === 'pwa');
  if (request.mode !== 'navigate' || !PAGE_PATHS.has(url.pathname) || !publicQuery) return;
  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(CACHE_NAME);
    const offlinePath = url.pathname.startsWith('/en/') ? '/pwa/offline-en.html' : '/pwa/offline-zh.html';
    return (await cache.match(offlinePath)) || Response.error();
  }));
});

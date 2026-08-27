const CACHE_NAME = "webrtc-games-v3";

const APP_SHELL = [
    "index.html",
    "manifest.json",
    "favicon.svg",
    "common/theme.css",
    "common/peer-network.js",
    "common/network-bridge.js",
    "games/caro/index.html",
    "games/battleship/index.html",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-maskable-512.png",
];

self.addEventListener("install", event => {

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});


self.addEventListener("activate", event => {

    event.waitUntil(
        caches.keys()
            .then(names => Promise.all(
                names
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            ))
            .then(() => self.clients.claim())
    );
});


// Cache-first for our own files so the shell + games open instantly and
// work offline. Anything cross-origin (PeerJS CDN, signaling traffic) is
// left to the network untouched - a stale copy of that can't do its job.
//
// ignoreSearch: true so a game page requested with ?mode=solo&... (solo
// vs AI) still resolves to its plain cached entry - solo mode doesn't
// need a separate cache entry per difficulty.
self.addEventListener("fetch", event => {

    const request = event.request;

    if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        caches.match(request, { ignoreSearch: true }).then(cached => {

            if (cached) {
                return cached;
            }

            return fetch(request).then(response => {

                const copy = response.clone();

                caches.open(CACHE_NAME)
                    .then(cache => cache.put(request, copy));

                return response;
            });
        })
    );
});

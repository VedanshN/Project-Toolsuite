const CACHE_NAME = 'toolsuite-v1-core';
const DYNAMIC_CACHE = 'toolsuite-v1-dynamic';

// 1. App Shell: These files are required for the app to start
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json'
];

// Install Event: Cache the App Shell immediately
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Pre-caching App Shell');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting(); // Activate immediately, don't wait for restart
});

// Activate Event: Cleanup old caches (The "Invalidation" Strategy)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME && key !== DYNAMIC_CACHE) {
                    console.log('[Service Worker] Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    return self.clients.claim();
});

// Fetch Event: The "Stale-While-Revalidate" Strategy
self.addEventListener('fetch', (event) => {
    // We only want to handle GET requests
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // 1. Strategy: Network First for Tools (to ensure latest logic)
            // 2. Strategy: Stale-While-Revalidate for UI assets
            
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                // Check if valid response
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }

                // Clone response to put in cache
                const responseToCache = networkResponse.clone();
                caches.open(DYNAMIC_CACHE).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            }).catch(() => {
                // Network failed? Do nothing, let the code fall through to cache check
            });

            // If we have a cached response, return it immediately (fast!), 
            // but the fetchPromise runs in background to update it for next time.
            return cachedResponse || fetchPromise;
        })
    );
});
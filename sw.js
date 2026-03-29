const CACHE_NAME = 'weekly-planner-v6';
const ASSETS = [
    'index.html',
    'style.css',
    'app.js',
    'firebase-db.js',
    'manifest.json'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            cache.addAll(ASSETS.map(url => new Request(url, { cache: 'no-cache' })))
        )
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    // Firebase / 외부 요청은 캐시 안 함
    if (!e.request.url.startsWith(self.location.origin)) return;
    e.respondWith(
        fetch(e.request, { cache: 'no-cache' })
            .then((response) => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
                return response;
            })
            .catch(() => caches.match(e.request))
    );
});

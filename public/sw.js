const CACHE_NAME = 'chitieu-v2.0.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/heatmap.css',
  './css/dashboard.css',
  './js/app.js',
  './js/utils.js',
  './js/firebase.js',
  './js/modules/constants.js',
  './js/modules/date_utils.js',
  './js/modules/forecast_service.js',
  './js/modules/state.js',
  './js/modules/storage.js',
  './js/modules/transaction_service.js',
  './js/modules/ui_events.js',
  './js/modules/ui_render.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});

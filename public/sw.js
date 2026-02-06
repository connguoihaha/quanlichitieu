const CACHE_NAME = 'chitieu-v2.0.5';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/heatmap.css',
  './css/dashboard.css',
  './css/skeleton.css',
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
  console.log('[SW] Installing new version:', CACHE_NAME);
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching assets');
      return cache.addAll(ASSETS);
    }).then(() => {
      console.log('[SW] Assets cached, ready to activate');
      // Don't auto-skip waiting, let the user control when to update
      // self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (e) => {
  console.log('[SW] Activating new version:', CACHE_NAME);
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Old caches cleared');
      return self.clients.claim();
    })
  );
});

// Listen for skip waiting message from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message, activating now');
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});

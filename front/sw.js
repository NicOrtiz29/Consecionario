// BBruno Automotores - Service Worker (PWA)
const CACHE_NAME = 'bbruno-automotores-v6';
const STATIC_ASSETS = [
  '/index.html',
  '/admin.html',
  '/vehicle-detail.html',
  '/css/style.css',
  '/js/app.js',
  '/js/admin.js',
  '/manifest.json',
  '/icons/logo.svg'
];

// Install event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Cacheando assets estáticos');
      return cache.addAll(STATIC_ASSETS.filter(url => !url.startsWith('http')));
    }).catch(err => console.log('[SW] Error en instalación:', err))
  );
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Eliminando cache antiguo:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - Network first, fallback to cache
self.addEventListener('fetch', event => {
  // Ignorar requests a la API de tablas (siempre online)
  if (event.request.url.includes('/tables/')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cachear la respuesta si es válida
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Fallback offline page
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

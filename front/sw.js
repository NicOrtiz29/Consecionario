// BBruno Automotores - Service Worker (PWA)
const CACHE_NAME = 'bbruno-automotores-v7';
const STATIC_ASSETS = [
  '/index.html',
  '/admin.html',
  '/vehicle-detail.html',
  '/css/style.css',
  '/js/app.js',
  '/js/admin.js',
  '/manifest.json',
  '/icons/logo.png'
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
  const url = new URL(event.request.url);

  // 1. Ignorar APIs y recursos externos (Instagram, Google Fonts, etc.)
  // Dejamos que el navegador los maneje directamente para evitar problemas de CORS/SW
  if (url.pathname.includes('/tables/') || !url.origin.includes(self.location.hostname)) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cachear solo recursos estáticos propios válidos y solo peticiones GET
        if (event.request.method === 'GET' && response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) return cachedResponse;
          
          // Si es una navegación fallida, mostrar la página principal
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          
          // En última instancia, si no hay nada, devolvemos un error de red normal
          // en lugar de dejar la promesa vacía.
          return new Response('Network error', {
            status: 408,
            headers: { 'Content-Type': 'text/plain' }
          });
        });
      })
  );
});

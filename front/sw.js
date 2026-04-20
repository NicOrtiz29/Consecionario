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

// Fetch event - Estrategia: Network First para código, Cache First para imágenes
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. Manejo especial de Imágenes de Supabase (OPTIMIZACIÓN DE EGRESOS)
  // Usamos Cache First para que las fotos solo se descarguen una vez del servidor
  if (url.origin.includes('supabase.co') && url.pathname.includes('/storage/v1/')) {
    event.respondWith(
      caches.open('bbruno-images').then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          if (cachedResponse) return cachedResponse;
          
          return fetch(event.request).then(networkResponse => {
            if (networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // 2. Ignorar APIs y recursos externos (Instagram, Google Fonts, etc.)
  if (url.pathname.includes('/api/') || url.pathname.includes('/.netlify/') || !url.origin.includes(self.location.hostname)) {
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
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Network error', {
            status: 408,
            headers: { 'Content-Type': 'text/plain' }
          });
        });
      })
  );
});

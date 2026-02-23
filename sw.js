const CACHE_NAME = 'school-companion-v2.0';

const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  // IMMAGINI PRINCIPALI
  '/icons/logo.png',
  '/icons/sun-moon.png',
  '/icons/icon-voti.png',
  '/icons/icon-statistiche.png',
  '/icons/icon-pagelle.png',
  '/icons/icon-todo.png',
  '/icons/icon-verifiche.png',
  '/icons/icon-settings.png',
  '/icons/icon-profilo.png',
  '/icons/icon-backup.png',
  '/icons/icon-back.png',
  // ICONE APP
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// ========================
// INSTALLA SERVICE WORKER
// ========================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('✅ Cache creata');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.error('❌ Errore cache:', err);
      })
  );
  self.skipWaiting();
});

// ========================
// ATTIVA SERVICE WORKER
// ========================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Cache vecchia eliminata:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// ========================
// FETCH - CACHE FIRST (PER IMMAGINI)
// ========================
self.addEventListener('fetch', (event) => {
  // Per le immagini: cache first
  if (event.request.url.includes('.png') || 
      event.request.url.includes('.jpg') ||
      event.request.url.includes('.jpeg') ||
      event.request.url.includes('/icons/')) {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          return response || fetch(event.request)
            .then((res) => {
              // Non cachare risposte non-ok
              if (!res || res.status !== 200 || res.type === 'error') {
                return res;
              }
              
              const resClone = res.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, resClone);
                });
              
              return res;
            })
            .catch(() => {
              // Fallback offline
              return caches.match(event.request);
            });
        })
    );
    return;
  }

  // Per il resto: network first
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Non cachare risposte non-ok
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        const resClone = response.clone();
        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, resClone);
          });

        return response;
      })
      .catch(() => {
        // Se network fallisce, usa cache
        return caches.match(event.request)
          .then((response) => {
            return response || new Response('Offline - risorsa non disponibile', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
          });
      })
  );
});
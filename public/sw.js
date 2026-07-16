/**
 * Service Worker: hace la PWA instalable y capaz de abrir/operar sin
 * conexión. Cachea el app shell al instalar y, en tiempo de ejecución,
 * cachea la librería Tesseract.js y sus modelos (CDN) la primera vez
 * que se descargan con internet, para que el OCR siga funcionando offline.
 */
const VERSION = 'v20';
const APP_SHELL_CACHE = `parqueadero-shell-${VERSION}`;
const RUNTIME_CACHE = `parqueadero-runtime-${VERSION}`;

const APP_SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/db.js',
  './js/calculo.js',
  './js/ocr.js',
  './js/qr.js',
  './js/app.js',
  './js/sync.js',
  './js/auth.js',
  './img/icon-192.png',
  './img/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) =>
      cache.addAll(APP_SHELL_FILES).catch((err) => {
        // No bloquear la instalación si algún archivo opcional aún no existe.
        console.warn('SW: no se pudo cachear todo el app shell', err);
      })
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres
          .filter((n) => n !== APP_SHELL_CACHE && n !== RUNTIME_CACHE)
          .map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

function esMismoOrigen(url) {
  return url.origin === self.location.origin;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (esMismoOrigen(url)) {
    // App shell propio: cache-first, con actualización en segundo plano.
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const clone = response.clone();
              caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Recursos externos (Tesseract.js, sus workers, wasm y modelos de
  // idioma): cache-first una vez descargados con internet, para que el
  // OCR funcione offline después del primer uso.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && (response.ok || response.type === 'opaque')) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});

// Service worker de La Fourno.
// Shell (HTML/JS/CSS/iconos): cache-first con actualización en
// background. APIs de Open-Meteo: SIEMPRE red directa — el caché de
// datos vive en localStorage con su propia expiración y el UI muestra
// la hora del último dato; cachear aquí duplicaría esa lógica y
// escondería datos viejos.

const CACHE = 'lafourno-shell-v1'
const SHELL = ['/', '/manifest.webmanifest', '/icono.svg', '/icono-192.png', '/icono-512.png', '/icono-180.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)

  // APIs de datos: red directa, nada de caché aquí.
  if (url.hostname.endsWith('open-meteo.com')) return

  // Fuentes de Google: red con fallback silencioso.
  if (url.hostname.includes('fonts.g')) return

  if (e.request.method !== 'GET') return

  // Navegaciones: red primero (para agarrar deploys nuevos), caché de respaldo.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copia = res.clone()
          caches.open(CACHE).then((c) => c.put('/', copia))
          return res
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  // Assets: cache-first, y lo que llega por red se guarda.
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res.ok && url.origin === location.origin) {
            const copia = res.clone()
            caches.open(CACHE).then((c) => c.put(e.request, copia))
          }
          return res
        }),
    ),
  )
})

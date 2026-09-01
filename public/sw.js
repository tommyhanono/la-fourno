// Service worker de La Fourno.
// Shell (HTML/JS/CSS/iconos): cache-first con actualización en
// background. APIs de Open-Meteo: SIEMPRE red directa — el caché de
// datos vive en localStorage con su propia expiración y el UI muestra
// la hora del último dato; cachear aquí duplicaría esa lógica y
// escondería datos viejos.

const CACHE = 'lafourno-shell-v2'
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icono.svg',
  '/icono-192.png',
  '/icono-512.png',
  '/icono-180.png',
  '/fonts/archivo-latin.woff2',
  '/fonts/archivo-black-latin.woff2',
]

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
            caches.open(CACHE).then(async (c) => {
              await c.put(e.request, copia)
              await purgarViejos(c, url)
            })
          }
          return res
        }),
    ),
  )
})

/**
 * Borra las versiones VIEJAS de un asset con hash.
 *
 * Vite emite `assets/index-<hash>.js`, y el nombre del caché es fijo, así
 * que sin esto cada deploy dejaba su bundle muerto adentro para siempre:
 * después de cincuenta deploys son cincuenta bundles de ~250 KB ocupando
 * el teléfono sin que nadie los use nunca más.
 *
 * Solo corre cuando ya se guardó con éxito la versión nueva —o sea que
 * hay red y el reemplazo está en el caché—, así que no puede dejar a la
 * app sin su asset. `activate` no servía para esto: solo se dispara
 * cuando cambia el propio sw.js, y este archivo casi nunca cambia.
 */
async function purgarViejos(cache, url) {
  const m = url.pathname.match(/^(\/assets\/[^/]+?)-[A-Za-z0-9_-]+(\.[a-z]+)$/)
  if (!m) return
  const [, base, ext] = m
  const patron = new RegExp(`^${base}-[A-Za-z0-9_-]+${ext.replace('.', '\\.')}$`)
  for (const req of await cache.keys()) {
    const p = new URL(req.url).pathname
    if (p !== url.pathname && patron.test(p)) await cache.delete(req)
  }
}

// Contraste WCAG AA medido en TODA la app, no solo en la home.
// Lighthouse audita una URL; esto recorre las vistas y mide cada texto
// contra el fondo que realmente tiene detrás.
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:4339'
const RUTAS = ['/', '/#/punto/contadora', '/#/punto/las-sirenas', '/#/ajustes']

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const fallos = []

for (const ruta of RUTAS) {
  await page.goto(BASE + ruta)
  await page.waitForTimeout(3000)
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)))
  await page.waitForTimeout(300)

  const malos = await page.evaluate(() => {
    const lum = (c) => {
      const [r, g, b] = c
      const f = (v) => {
        v /= 255
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    // Los tokens están en oklch(): un regex de números los leería mal.
    // El canvas resuelve cualquier notación de color a sRGB.
    const cv = document.createElement('canvas')
    cv.width = cv.height = 1
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    const parse = (s) => {
      if (!s) return null
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = s
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data
      return [d[0], d[1], d[2]]
    }
    // fondo efectivo: sube por los ancestros hasta uno opaco
    const fondo = (el) => {
      let n = el
      while (n && n !== document.documentElement) {
        const bg = getComputedStyle(n).backgroundColor
        const a = bg.match(/rgba?\([^)]*?,\s*([\d.]+)\)/)
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && (!a || Number(a[1]) > 0.9)) return parse(bg)
        n = n.parentElement
      }
      return [255, 255, 255]
    }
    const out = []
    for (const el of document.querySelectorAll('body *')) {
      const txt = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join('')
      if (!txt) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.9) continue
      // Lo que está oculto para el lector de pantalla no es texto que
      // alguien tenga que leer: son los guiones del esqueleto de carga,
      // decorativos y tenues a propósito. Medirles el contraste hacía
      // que el auditor fallara o no según cuánto tardara la red.
      if (el.closest('[aria-hidden="true"], [aria-hidden=""]')) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const fg = parse(cs.color)
      const bg = fondo(el)
      if (!fg || !bg) continue
      const l1 = lum(fg)
      const l2 = lum(bg)
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
      const px = parseFloat(cs.fontSize)
      const peso = Number(cs.fontWeight) || 400
      // WCAG: "texto grande" = 24px, o 18.66px en negrita
      const grande = px >= 24 || (px >= 18.66 && peso >= 700)
      const min = grande ? 3 : 4.5
      if (ratio < min) {
        out.push({
          txt: txt.slice(0, 30),
          clase: String(el.className || el.tagName).slice(0, 28),
          ratio: Math.round(ratio * 100) / 100,
          min,
          px: Math.round(px),
        })
      }
    }
    return out
  })
  for (const m of malos) fallos.push({ ruta, ...m })
}

console.log(
  fallos.length
    ? JSON.stringify(fallos, null, 1)
    : 'contraste AA: todo pasa en las 4 vistas (con desgloses abiertos)',
)
await browser.close()

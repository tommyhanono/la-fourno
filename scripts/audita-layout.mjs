// Auditoría de layout: caza solapamientos reales, desbordes y textos
// que se salen de su caja. Mide, no supone.
// Casos duros: pantalla angosta, texto agrandado (accesibilidad),
// desgloses abiertos y landscape.
import { webkit } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:4330'
const RUTAS = ['/', '/#/punto/contadora', '/#/punto/las-sirenas', '/#/ajustes']

const ESCENARIOS = [
  { nombre: '320 angosto', vp: { width: 320, height: 844 }, zoom: 1, abrir: false },
  { nombre: '375 base', vp: { width: 375, height: 667 }, zoom: 1, abrir: false },
  { nombre: '390 desgloses abiertos', vp: { width: 390, height: 844 }, zoom: 1, abrir: true },
  { nombre: '390 texto 130%', vp: { width: 390, height: 844 }, zoom: 1.3, abrir: false },
  { nombre: '390 texto 200%', vp: { width: 390, height: 844 }, zoom: 2, abrir: false },
  { nombre: 'landscape 844x390', vp: { width: 844, height: 390 }, zoom: 1, abrir: false },
]

const browser = await webkit.launch()
const problemas = []

for (const esc of ESCENARIOS) {
  const page = await browser.newPage({ viewport: esc.vp })
  for (const ruta of RUTAS) {
    await page.goto(BASE + ruta)
    if (esc.zoom !== 1) {
      await page.addStyleTag({ content: `html { font-size: ${16 * esc.zoom}px; }` })
    }
    await page.waitForTimeout(2500)
    if (esc.abrir) {
      await page.evaluate(() =>
        document.querySelectorAll('details').forEach((d) => (d.open = true)),
      )
      await page.waitForTimeout(300)
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(400)

    const r = await page.evaluate(() => {
      const out = { overlaps: [], overflowX: null, desbordes: [], avisoAlto: 0, mainPad: null }
      const aviso = document.querySelector('.aviso-seguridad')
      if (aviso) {
        const a = aviso.getBoundingClientRect()
        out.avisoAlto = Math.round(a.height)
        const main = document.querySelector('main')
        out.mainPad = main ? getComputedStyle(main).paddingBottom : null
        const cands = document.querySelectorAll(
          'main .tarjeta, main .semana-fila, main .fila-punto, main h2, main summary, main .badge-score, main .desglose-lista li',
        )
        for (const el of cands) {
          const b = el.getBoundingClientRect()
          if (b.height === 0) continue
          const solape = Math.min(b.bottom, a.bottom) - Math.max(b.top, a.top)
          if (solape > 2 && b.left < a.right && b.right > a.left) {
            out.overlaps.push({
              sel: String(el.className || el.tagName).slice(0, 30),
              texto: (el.textContent || '').trim().slice(0, 40),
              px: Math.round(solape),
            })
          }
        }
      }
      const de = document.documentElement
      if (de.scrollWidth > de.clientWidth) {
        out.overflowX = { scroll: de.scrollWidth, client: de.clientWidth }
      }
      for (const el of document.querySelectorAll('main *')) {
        if (el.children.length) continue
        if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
          const cs = getComputedStyle(el)
          if (cs.overflowX === 'visible' && cs.whiteSpace !== 'nowrap') {
            out.desbordes.push({
              sel: String(el.className || el.tagName).slice(0, 30),
              texto: (el.textContent || '').trim().slice(0, 35),
              sobra: el.scrollWidth - el.clientWidth,
            })
          }
        }
      }
      return out
    })

    if (r.overlaps.length || r.overflowX || r.desbordes.length) {
      problemas.push({
        escenario: esc.nombre,
        ruta,
        avisoAlto: r.avisoAlto,
        mainPad: r.mainPad,
        overlaps: r.overlaps.slice(0, 4),
        overflowX: r.overflowX,
        desbordes: r.desbordes.slice(0, 4),
      })
    }
  }
  await page.close()
}

console.log(problemas.length ? JSON.stringify(problemas, null, 2) : 'sin problemas de layout')
await browser.close()

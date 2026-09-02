// ¿Cómo se porta la app a 40 km de la costa, con una barra de señal?
//
// Nunca se había medido. Se prueban cuatro escenarios contra el preview
// local, metiendo demora artificial en cada request (funciona en
// cualquier navegador, a diferencia del throttling de CDP que es solo
// Chromium):
//
//   1. Red normal, arranque en frío.
//   2. Red lenta (2 s por request), arranque en frío.
//   3. Red lenta con caché: ¿aparece algo antes de que llegue la red?
//   4. Una request colgada 19 s, con el timeout en 20: ¿la app espera
//      por las tres o muestra lo que sí llegó?
//
// Uso: preview en :4330 y `node scripts/medir-red-lenta.mjs`

import { webkit } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:4330'
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

async function medir(nombre, { demoraMs = 0, colgar = null, conCache = false }) {
  const b = await webkit.launch()
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()

  // Distinguir CUÁL se cuelga importa: el clima es esencial (sin él no
  // hay app y esperar 20 s es lo correcto), el mar y el multimodelo no.
  const cual = (url) =>
    url.includes('marine-api') ? 'mar' : url.includes('models=') ? 'modelos' : 'clima'
  await p.route('**open-meteo.com/**', async (route) => {
    const q = cual(route.request().url())
    if (colgar === q) await dormir(19_000)
    else if (demoraMs) await dormir(demoraMs)
    await route.continue()
  })

  if (conCache) {
    // Primera visita para llenar el caché, sin demora.
    await p.goto(BASE, { waitUntil: 'networkidle' }).catch(() => {})
    await p.waitForSelector('.badge-score strong', { timeout: 30_000 }).catch(() => {})
    await dormir(1500)
  }

  const t0 = Date.now()
  await p.goto(BASE, { waitUntil: 'domcontentloaded' })
  // "Primer texto útil": el título, que ya es contenido real.
  await p.waitForSelector('.titulo-hero', { timeout: 40_000 }).catch(() => {})
  const tTexto = Date.now() - t0
  // "Primer dato": un puntaje con dígitos.
  let tDato = null
  try {
    await p.waitForSelector('.badge-score strong', { timeout: 40_000 })
    await p.waitForFunction(
      () => /\d/.test(document.querySelector('.badge-score strong')?.textContent ?? ''),
      { timeout: 40_000 },
    )
    tDato = Date.now() - t0
  } catch {
    tDato = null
  }

  const estado = await p.evaluate(() => ({
    veredicto: !!document.querySelector('.veredicto'),
    dias: document.querySelectorAll('.dia').length,
    aviso: /No sustituy/i.test(document.body.innerText),
  }))
  await b.close()
  return { nombre, tTexto, tDato, ...estado }
}

const ESCENARIOS = [
  ['red normal, en frío', {}],
  ['red lenta (2 s/request), en frío', { demoraMs: 2000 }],
  ['red lenta CON caché', { demoraMs: 2000, conCache: true }],
  ['se cuelga el CLIMA (esencial)', { colgar: 'clima' }],
  ['se cuelga el MAR (degradable)', { colgar: 'mar' }],
  ['se cuelga el MULTIMODELO (extra)', { colgar: 'modelos' }],
]

console.log('LA APP EN RED LENTA\n')
console.log('escenario                          texto útil   primer dato   veredicto  días')
console.log('---------------------------------  ----------   -----------   ---------  ----')
for (const [nombre, opts] of ESCENARIOS) {
  const r = await medir(nombre, opts)
  console.log(
    `${r.nombre.padEnd(33)}  ${String(r.tTexto + ' ms').padStart(9)}   ` +
      `${String(r.tDato == null ? 'no llegó' : r.tDato + ' ms').padStart(11)}   ` +
      `${(r.veredicto ? 'sí' : 'NO').padStart(9)}  ${String(r.dias).padStart(4)}`,
  )
}
console.log('\n"texto útil" = el título ya pintado (shell). "primer dato" = un puntaje con dígitos.')

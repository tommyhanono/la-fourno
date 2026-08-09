// Capturas rápidas de las vistas para revisión visual durante el build.
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:4318'
const OUT = process.env.OUT ?? '/tmp/lf-shots'
const rutas = [
  ['home', '/'],
  ['contadora', '/#/punto/contadora'],
  ['las-sirenas', '/#/punto/las-sirenas'],
  ['ajustes', '/#/ajustes'],
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
for (const [nombre, ruta] of rutas) {
  await page.goto(BASE + ruta)
  await page.waitForTimeout(3500)
  await page.screenshot({ path: `${OUT}/${nombre}.png`, fullPage: true })
  console.log('shot', nombre)
}
await browser.close()

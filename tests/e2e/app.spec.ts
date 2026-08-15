// E2E de La Fourno. Las APIs de Open-Meteo se interceptan con datos
// sintéticos deterministas (tests/fixtures/genera.ts) para que la
// corrida no dependa del clima real. La red cortada se prueba aparte.

import { test, expect, type Page } from '@playwright/test'
import { PUNTOS } from '../../src/config/puntos'
import {
  usarDiaBase,
  forecastSintetico,
  marineSintetico,
  datosSinteticos,
} from '../fixtures/genera'

// Día base = hoy en Panamá, para que los bloques del fixture existan.
function hoyPanama(): string {
  return new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10)
}

async function mockApis(page: Page) {
  usarDiaBase(hoyPanama())
  await page.route('**/api.open-meteo.com/**', (route) =>
    route.fulfill({ json: forecastSintetico() }),
  )
  await page.route('**/marine-api.open-meteo.com/**', (route) =>
    route.fulfill({ json: marineSintetico() }),
  )
}

async function cortarRed(page: Page) {
  await page.route('**/api.open-meteo.com/**', (route) => route.abort())
  await page.route('**/marine-api.open-meteo.com/**', (route) => route.abort())
}

test.describe('La Fourno', () => {
  test('abre y muestra las 3 mejores ventanas de la semana', async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
    await expect(page.getByText('¿Cuándo salgo esta semana?')).toBeVisible()
    await expect(page.locator('.ventana')).toHaveCount(3, { timeout: 15_000 })
    // cada ventana dice día, horas y score
    const primera = page.locator('.ventana').first()
    await expect(primera.locator('.ventana-horas')).toContainText('–')
    await expect(primera.locator('.badge-score strong')).toHaveText(/^\d+$/)
  })

  test('el desglose del score se abre y muestra números con signo', async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
    await expect(page.locator('.ventana').first()).toBeVisible({ timeout: 15_000 })
    await page.locator('.ventana').first().locator('summary').click()
    const items = page.locator('.ventana').first().locator('.desglose-lista li')
    await expect(items.first()).toBeVisible()
    expect(await items.count()).toBeGreaterThanOrEqual(3)
    await expect(items.first().locator('.pts')).toHaveText(/^[+−]\d/)
    // el viento aparece con su medición
    await expect(
      page.locator('.ventana').first().locator('.desglose-lista'),
    ).toContainText(/viento \d+ kt/)
  })

  test('día por día: la semana entera, día completo con score, mejor destino y desglose', async ({
    page,
  }) => {
    await mockApis(page)
    await page.goto('/')
    const seccion = page.locator('.seccion-dias')
    await expect(seccion).toBeVisible({ timeout: 15_000 })
    await expect(seccion.getByText('Día por día')).toBeVisible()
    // semana completa: al menos 7 días listados (8 si la jornada de hoy sigue viva)
    const filas = seccion.locator('.dia')
    expect(await filas.count()).toBeGreaterThanOrEqual(7)
    for (let i = 0; i < (await filas.count()); i++) {
      const fila = filas.nth(i)
      // cada día trae su score y su destino (o el empate declarado)…
      await expect(fila.locator('.badge-score strong')).toHaveText(/^\d+$/)
      await expect(fila.locator('.dia-destino')).toContainText(
        /Mejor destino|Parejo en todos los puntos · sugerido/,
      )
      // …las horas de sol CON minutos (truncarlas mentía sobre el ocaso)
      await expect(fila.locator('.dia-extra')).toContainText(
        /sol \d+:\d\d [ap]m – \d+:\d\d [ap]m/,
      )
      // …los cuatro datos del día, etiquetados
      await expect(fila.locator('.dia-datos dt')).toHaveCount(4)
      // …y NO bloques de horas: el día se muestra completo
      expect(await fila.locator('.dia-datos').textContent()).not.toMatch(/[ap]m/)
    }
    // exactamente un día marcado como el mejor de la semana
    expect(await seccion.locator('.dia-sello').count()).toBeLessThanOrEqual(1)
    // el destino es un link que abre su punto
    const destino = filas.first().locator('.dia-destino a')
    await expect(destino).toHaveAttribute('href', /#\/punto\//)
    // el desglose del día se abre con números
    const ultima = filas.last()
    await ultima.locator('summary').click()
    await expect(ultima.locator('.desglose-lista .pts').first()).toHaveText(/^[+−]\d/)
  })

  test('el aviso fijo no tapa contenido, ni con el texto agrandado', async ({ page }) => {
    await mockApis(page)
    for (const zoom of [1, 2]) {
      for (const ruta of ['/', '/#/punto/contadora', '/#/punto/las-sirenas', '/#/ajustes']) {
        await page.goto(ruta)
        if (zoom > 1) {
          await page.addStyleTag({ content: `html { font-size: ${16 * zoom}px; }` })
        }
        await expect(page.locator('.aviso-seguridad')).toBeVisible({ timeout: 15_000 })
        await page.waitForTimeout(700)
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        await page.waitForTimeout(300)
        const tapados = await page.evaluate(() => {
          const a = document.querySelector('.aviso-seguridad')!.getBoundingClientRect()
          const malos: string[] = []
          for (const el of document.querySelectorAll(
            'main .tarjeta, main .dia, main .fila-punto, main h2, main summary',
          )) {
            const b = el.getBoundingClientRect()
            if (b.height === 0) continue
            const solape = Math.min(b.bottom, a.bottom) - Math.max(b.top, a.top)
            if (solape > 2 && b.left < a.right && b.right > a.left) {
              malos.push((el.textContent || '').trim().slice(0, 30))
            }
          }
          return malos
        })
        expect(tapados, `${ruta} a ${zoom * 100} %`).toEqual([])
      }
    }
  })

  test('la curva de marea no encima sus etiquetas con el eje', async ({ page }) => {
    await mockApis(page)
    await page.goto('/#/punto/contadora')
    await expect(page.locator('.curva-marea svg')).toBeVisible({ timeout: 15_000 })
    const choques = await page.evaluate(() => {
      const svg = document.querySelector('.curva-marea svg')!
      const textos = [...svg.querySelectorAll('text')].map((t) => ({
        t: t.textContent || '',
        r: t.getBoundingClientRect(),
        eje: t.classList.contains('cm-eje'),
      }))
      const svgR = svg.getBoundingClientRect()
      const malos: string[] = []
      for (let i = 0; i < textos.length; i++) {
        // ninguna etiqueta se sale del gráfico
        if (textos[i].r.left < svgR.left - 1 || textos[i].r.right > svgR.right + 1) {
          malos.push(`fuera: ${textos[i].t}`)
        }
        for (let j = i + 1; j < textos.length; j++) {
          const a = textos[i].r
          const b = textos[j].r
          const solapa =
            a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1
          if (solapa) malos.push(`${textos[i].t} × ${textos[j].t}`)
        }
      }
      return malos
    })
    expect(choques).toEqual([])
  })

  test('navega a cada uno de los 9 puntos', async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
    await expect(page.locator('.fila-punto')).toHaveCount(9, { timeout: 15_000 })
    for (const p of PUNTOS) {
      await page.goto(`/#/punto/${p.id}`)
      await expect(page.locator('h1')).toContainText(p.nombre.slice(0, 12))
      await expect(page.getByText('Ahora').first()).toBeVisible()
      if (p.tipo === 'nav') {
        await expect(page.getByText('Ola', { exact: true })).toBeVisible()
        await expect(page.getByText('Marea del día')).toBeVisible()
      } else {
        // vista playa: UV sí, datos de navegación no
        await expect(page.getByText('UV', { exact: true })).toBeVisible()
        await expect(page.getByText('¿Qué día de playa?')).toBeVisible()
        await expect(page.getByText('Ola', { exact: true })).toHaveCount(0)
      }
      // marea siempre marcada como estimada
      await expect(page.getByText(/estimad/i).first()).toBeVisible()
    }
  })

  test('el aviso de seguridad está en todas las vistas y no hay forma de quitarlo', async ({
    page,
  }) => {
    await mockApis(page)
    for (const ruta of ['/', `/#/punto/contadora`, '/#/ajustes']) {
      await page.goto(ruta)
      const aviso = page.locator('.aviso-seguridad')
      await expect(aviso).toBeVisible()
      await expect(aviso).toContainText('No sustituye los avisos oficiales')
    }
    // en ajustes no existe ningún control que lo apague
    await page.goto('/#/ajustes')
    await expect(page.getByText('no se puede quitar')).toBeVisible()
  })

  test('cambia unidades y la preferencia sobrevive al reload', async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
    await expect(page.locator('.fila-punto').first()).toContainText('kt', {
      timeout: 15_000,
    })

    await page.goto('/#/ajustes')
    await page.getByRole('radio', { name: 'km/h' }).click()
    await page.getByRole('radio', { name: 'metros (m)' }).click()
    await expect(page.getByRole('radio', { name: 'km/h' })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    await page.goto('/')
    await expect(page.locator('.fila-punto').first()).toContainText('km/h')

    // reload duro: la preferencia persiste (localStorage)
    await page.reload()
    await expect(page.locator('.fila-punto').first()).toContainText('km/h', {
      timeout: 15_000,
    })
    await page.goto('/#/punto/contadora')
    await expect(page.getByText(/ola/i).first()).toBeVisible()
    await expect(page.locator('.ahora-grid')).toContainText('m')
  })

  test('red cortada sin caché: lo dice claro, nada roto', async ({ page }) => {
    await cortarRed(page)
    await page.goto('/')
    await expect(
      page.getByText('Sin conexión y sin datos guardados', { exact: false }),
    ).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('No hay datos todavía.', { exact: false })).toBeVisible()
    // el aviso de seguridad sigue ahí
    await expect(page.locator('.aviso-seguridad')).toBeVisible()
  })

  test('red cortada con caché viejo: muestra lo último y avisa', async ({ page }) => {
    usarDiaBase(hoyPanama())
    const datos = datosSinteticos()
    // caché de hace 2 horas: vencido → intenta refrescar → falla → avisa
    datos.fetchedAt = new Date(Date.now() - 2 * 3600_000).toISOString()
    await page.addInitScript((d) => {
      localStorage.setItem('lafourno:datos:v2', d)
    }, JSON.stringify(datos))
    await cortarRed(page)
    await page.goto('/')
    // muestra las ventanas del caché
    await expect(page.locator('.ventana')).toHaveCount(3, { timeout: 20_000 })
    // y dice que es dato viejo sin conexión
    await expect(page.getByText('sin conexión: mostrando lo último que llegó')).toBeVisible()
    await expect(page.getByText(/hace 2 h/)).toBeVisible()
  })

  test('si solo falla la API marina, lo dice y muestra el clima', async ({ page }) => {
    usarDiaBase(hoyPanama())
    await page.route('**/api.open-meteo.com/**', (route) =>
      route.fulfill({ json: forecastSintetico() }),
    )
    await page.route('**/marine-api.open-meteo.com/**', (route) => route.abort())
    await page.goto('/')
    await expect(page.getByText(/falló mar y marea/)).toBeVisible({ timeout: 20_000 })
    // las ventanas igual salen (score parcial sin ola/marea)
    await expect(page.locator('.ventana')).toHaveCount(3)
  })

  test('a 375 px no hay scroll horizontal en ninguna vista', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } })
    const page = await ctx.newPage()
    await mockApis(page)
    for (const ruta of ['/', '/#/punto/contadora', '/#/punto/las-sirenas', '/#/ajustes']) {
      await page.goto(ruta)
      await page.waitForTimeout(800)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `overflow en ${ruta}`).toBeLessThanOrEqual(0)
    }
    await ctx.close()
  })

  test('PWA: manifest y service worker publicados', async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
    const manifest = await page.evaluate(async () => {
      const res = await fetch('/manifest.webmanifest')
      return res.json()
    })
    expect(manifest.name).toContain('La Fourno')
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2)
    const sw = await page.evaluate(async () => (await fetch('/sw.js')).status)
    expect(sw).toBe(200)
  })
})

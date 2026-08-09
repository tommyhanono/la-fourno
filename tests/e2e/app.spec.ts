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

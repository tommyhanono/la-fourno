// E2E de La Fourno. Las APIs de Open-Meteo se interceptan con datos
// sintéticos deterministas (tests/fixtures/genera.ts) para que la
// corrida no dependa del clima real. La red cortada se prueba aparte.

import { test, expect, type Page } from '@playwright/test'
import { PUNTOS } from '../../src/config/puntos'
import {
  usarDiaBase,
  forecastSintetico,
  marineSintetico,
  modelosSinteticos,
  datosSinteticos,
} from '../fixtures/genera'

// Día base = hoy en Panamá, para que los bloques del fixture existan.
function hoyPanama(): string {
  return new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10)
}

/**
 * Corta Supabase en TODOS los tests.
 *
 * Los E2E corren con el .env de verdad, así que sin esto un click en la
 * fila de verdad de campo escribe en la tabla de producción. Ya pasó una
 * vez: quedó un registro inventado del 31-ago en fourno_registros, en la
 * tabla cuyo propósito entero es ser verdad. Se borró, y esto es para
 * que no vuelva.
 */
async function cortarSupabase(page: Page) {
  await page.route('**supabase.co/**', (route) => route.abort())
}

async function mockApis(page: Page) {
  usarDiaBase(hoyPanama())
  await cortarSupabase(page)
  // Ojo: el pronóstico y el multimodelo salen del MISMO host. Se
  // distinguen por `models=` en la query. Si se responde forecast a las
  // dos, el multimodelo llega con la forma equivocada y el desacuerdo
  // queda mudo sin que ningún test se entere.
  await page.route('**/api.open-meteo.com/**', (route) =>
    route.fulfill({
      json: route.request().url().includes('models=')
        ? modelosSinteticos()
        : forecastSintetico(),
    }),
  )
  await page.route('**/marine-api.open-meteo.com/**', (route) =>
    route.fulfill({ json: marineSintetico() }),
  )
}

async function cortarRed(page: Page) {
  await cortarSupabase(page)
  await page.route('**/api.open-meteo.com/**', (route) => route.abort())
  await page.route('**/marine-api.open-meteo.com/**', (route) => route.abort())
}

test.describe('La Fourno', () => {
  test('abre con UN veredicto: el mejor día, su destino y sus condiciones', async ({
    page,
  }) => {
    await mockApis(page)
    await page.goto('/')
    await expect(page.getByText('¿Cuándo salgo esta semana?')).toBeVisible()
    const v = page.locator('.veredicto')
    await expect(v).toHaveCount(1, { timeout: 15_000 })
    await expect(v.locator('.veredicto-dia')).not.toBeEmpty()
    await expect(v.locator('.badge-score strong')).toHaveText(/^\d+$/)
    await expect(v.locator('.veredicto-destino a')).toHaveAttribute(
      'href',
      /#\/punto\//,
    )
    // el veredicto habla de la jornada entera, nunca de un bloque de horas
    await expect(v.locator('.veredicto-cond')).toContainText(/Viento/)
    expect(await v.locator('.veredicto-cond').textContent()).not.toMatch(/[ap]m/)
  })

  test('la pantalla no contesta dos veces: el veredicto y el sello son el mismo día', async ({
    page,
  }) => {
    await mockApis(page)
    await page.goto('/')
    const v = page.locator('.veredicto')
    await expect(v).toBeVisible({ timeout: 15_000 })
    const diaVeredicto = (await v.locator('.veredicto-dia').textContent())?.trim()
    const marcado = page.locator('.dia.mejor-dia')
    await expect(marcado).toHaveCount(1)
    const diaMarcado = (await marcado.locator('.dia-nombre').textContent())?.trim()
    expect(diaMarcado).toBe(diaVeredicto)
    // y el mismo número, no dos puntajes distintos para el mismo día
    const scoreVeredicto = await v.locator('.badge-score strong').textContent()
    const scoreMarcado = await marcado.locator('.badge-score strong').textContent()
    expect(scoreMarcado).toBe(scoreVeredicto)
  })

  test('el desglose del score se abre y muestra números con signo', async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
    await expect(page.locator('.veredicto')).toBeVisible({ timeout: 15_000 })
    await page.locator('.veredicto').locator('summary').click()
    const items = page.locator('.veredicto').locator('.desglose-lista li')
    await expect(items.first()).toBeVisible()
    expect(await items.count()).toBeGreaterThanOrEqual(3)
    await expect(items.first().locator('.pts')).toHaveText(/^[+−]\d/)
    // el viento aparece con su medición
    await expect(
      page.locator('.veredicto').locator('.desglose-lista'),
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
        /Mejor destino:|Parejo en todos los puntos, sugerido:|Números del corredor a:/,
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
    // exactamente un día marcado como el mejor de la semana. El fixture
    // siempre deja algún día salible, así que "cero sellos" es un fallo,
    // no un caso válido.
    expect(await seccion.locator('.dia-sello').count()).toBe(1)
    // un día con bandera de seguridad NO sugiere hora de salida:
    // "está mejor temprano" debajo de "no recomendado" se lee como permiso
    const peligrosos = seccion.locator('.dia:has(.dia-peligro)')
    for (let i = 0; i < (await peligrosos.count()); i++) {
      await expect(peligrosos.nth(i).locator('.dia-forma')).toHaveCount(0)
    }
    // el destino es un link que abre su punto
    const destino = filas.first().locator('.dia-destino a')
    await expect(destino).toHaveAttribute('href', /#\/punto\//)
    // el desglose del día se abre con números
    const ultima = filas.last()
    await ultima.locator('summary').click()
    await expect(ultima.locator('.desglose-lista .pts').first()).toHaveText(/^[+−]\d/)
  })

  test('avisa cuándo los modelos no coinciden, y solo en esos días', async ({
    page,
  }) => {
    await mockApis(page)
    await page.goto('/')
    const seccion = page.locator('.seccion-dias')
    await expect(seccion).toBeVisible({ timeout: 15_000 })
    // Esperar DATOS, no el esqueleto: las filas existen vacías desde el
    // primer render y contar antes da cero sin que nada esté roto.
    await expect(seccion.locator('.badge-score strong').first()).toHaveText(/^\d+$/)

    // El fixture hace que ICON vea el día 1 al 45 % del viento: ese día
    // tiene que salir marcado. Si no sale ninguno, el multimodelo no
    // está llegando (o la ruta lo respondió con la forma equivocada).
    const dudosos = seccion.locator('.dia-dudoso[data-motivo="desacuerdo"]')
    await expect(dudosos.first()).toHaveText('Los modelos todavía no coinciden en este día.')
    expect(await dudosos.count()).toBeGreaterThanOrEqual(1)

    // Y NO puede salir en todos: un aviso que aparece siempre deja de
    // querer decir algo. Ese era el criterio para elegir el umbral.
    const total = await seccion.locator('.dia').count()
    expect(await dudosos.count()).toBeLessThan(total)

    // En un día dudoso no se afirma la forma del día. Si los modelos no
    // coinciden ni en cómo viene el día entero, decir "está mejor
    // temprano" es afinar sobre algo que todavía se mueve.
    const dias = seccion.locator('.dia:has(.dia-dudoso)')  // cualquiera de las dos salvedades
    for (let i = 0; i < (await dias.count()); i++) {
      await expect(dias.nth(i).locator('.dia-forma')).toHaveCount(0)
    }
    // Y el veredicto no puede afirmar lo que su propia tarjeta calla.
    if (await page.locator('.veredicto-dudoso').count()) {
      await expect(page.locator('.veredicto-forma')).toHaveCount(0)
    }
  })

  test('sin el multimodelo la app sigue dando el pronóstico completo', async ({
    page,
  }) => {
    // La tercera request es un extra. Si falla, se pierde el aviso de
    // desacuerdo y NADA más: el veredicto y la semana siguen enteros.
    usarDiaBase(hoyPanama())
    await cortarSupabase(page)
    await page.route('**/api.open-meteo.com/**', (route) =>
      route.request().url().includes('models=')
        ? route.abort()
        : route.fulfill({ json: forecastSintetico() }),
    )
    await page.route('**/marine-api.open-meteo.com/**', (route) =>
      route.fulfill({ json: marineSintetico() }),
    )
    await page.goto('/')
    const seccion = page.locator('.seccion-dias')
    await expect(seccion).toBeVisible({ timeout: 15_000 })
    await expect(seccion.locator('.badge-score strong').first()).toHaveText(/^\d+$/)
    expect(await seccion.locator('.dia').count()).toBeGreaterThanOrEqual(7)
    // Sin multimodelo no puede haber avisos de DESACUERDO entre modelos.
    // Los de HORIZONTE sí siguen: no dependen de esa request, salen de
    // qué tan lejos está el día.
    expect(await seccion.locator('.dia-dudoso[data-motivo="desacuerdo"]').count()).toBe(0)
    // y sin inventar una falla al usuario: el multimodelo no es "el clima"
    await expect(page.getByText(/No se pudo actualizar/)).toHaveCount(0)
  })

  test('la fila de verdad de campo: dos toques y se va, sin insistir', async ({
    page,
  }) => {
    await mockApis(page)
    await page.goto('/')
    // Esperar DATOS, no el esqueleto: la fila depende de que la semana
    // esté armada, y las tarjetas existen vacías desde el primer render.
    await expect(page.locator('.badge-score strong').first()).toHaveText(/^\d+$/, {
      timeout: 15_000,
    })

    // En un navegador limpio siempre hay días sin contestar atrás.
    // toHaveCount reintenta: la fila se monta un render después.
    const fila = page.locator('.verdad')
    await expect(fila).toHaveCount(1)
    await expect(fila.locator('.verdad-pregunta')).toContainText('¿Saliste el')

    // Estado 2 sin cambiar de vista: no hay pantalla nueva.
    const urlAntes = page.url()
    await fila.getByRole('button', { name: 'Sí' }).click()
    expect(page.url()).toBe(urlAntes)
    await expect(fila.locator('.verdad-pregunta')).toContainText('¿Cómo estuvo')
    for (const b of ['Peor', 'Igual', 'Mejor']) {
      await expect(fila.getByRole('button', { name: b })).toBeVisible()
    }

    // Al contestar, la fila se va — o pasa al día anterior, pero nunca
    // vuelve a preguntar por el mismo día.
    await fila.getByRole('button', { name: 'Igual' }).click()
    const quedan = await page.locator('.verdad').count()
    if (quedan > 0) {
      await expect(page.locator('.verdad .verdad-pregunta')).toContainText('¿Saliste el')
    }

    // Y no bloquea nada: el veredicto sigue ahí.
    await expect(page.locator('.veredicto')).toHaveCount(1)
  })

  test('la fila no insiste: contestado el día, no vuelve a salir tras recargar', async ({
    page,
  }) => {
    await mockApis(page)
    await page.goto('/')
    // Esperar DATOS, no el esqueleto: la fila depende de que la semana
    // esté armada, y las tarjetas existen vacías desde el primer render.
    await expect(page.locator('.badge-score strong').first()).toHaveText(/^\d+$/, {
      timeout: 15_000,
    })
    await expect(page.locator('.verdad')).toHaveCount(1)
    const primerDia = await page.locator('.verdad-pregunta').textContent()
    await page.locator('.verdad').getByRole('button', { name: 'No salí' }).click()
    await page.reload()
    await expect(page.locator('.seccion-dias')).toBeVisible({ timeout: 15_000 })
    const quedan = await page.locator('.verdad').count()
    if (quedan > 0) {
      expect(await page.locator('.verdad-pregunta').textContent()).not.toBe(primerDia)
    }
  })

  test('los botones de la fila cumplen el piso: 44px y foco visible', async ({
    page,
  }) => {
    await mockApis(page)
    await page.goto('/')
    // Esperar DATOS, no el esqueleto: la fila depende de que la semana
    // esté armada, y las tarjetas existen vacías desde el primer render.
    await expect(page.locator('.badge-score strong').first()).toHaveText(/^\d+$/, {
      timeout: 15_000,
    })
    // Esperar la FILA, no los badges: se monta en un efecto, o sea un
    // render después, y contar antes daba cero de vez en cuando. Este
    // expect reintenta solo; count() no.
    await expect(page.locator('.verdad')).toHaveCount(1)
    const botones = page.locator('.verdad .btn-verdad')
    const n = await botones.count()
    expect(n).toBeGreaterThan(0)
    for (let i = 0; i < n; i++) {
      const caja = await botones.nth(i).boundingBox()
      expect(caja!.height).toBeGreaterThanOrEqual(44)
    }
    await botones.first().focus()
    const outline = await botones.first().evaluate(
      (el) => getComputedStyle(el).outlineStyle,
    )
    expect(outline).not.toBe('none')
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

  // Las tres declaraciones de honestidad viven en el UI, no solo en los
  // documentos: si alguien las borra al reacomodar una pantalla, nadie se
  // entera. Este test es el que se entera. (La de la ola se perdió una vez
  // exactamente así: el CSS quedó y el JSX no llegó nunca.)
  test('las declaraciones de incertidumbre siguen en pantalla', async ({ page }) => {
    await mockApis(page)
    await page.goto('/#/punto/contadora')
    const ola = page.locator('.nota-ola')
    await expect(ola).toBeVisible({ timeout: 15_000 })
    // Que exista no basta: tiene que traer el número medido y su fecha.
    await expect(ola).toContainText('0.30 m')
    await expect(ola).toContainText('1-sep-2026')
    // Y la marea sigue siendo "estimada", que es decisión de producto.
    await expect(page.getByText(/Marea \(estimada\)/i).first()).toBeVisible()
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
    // muestra el veredicto del caché
    await expect(page.locator('.veredicto')).toHaveCount(1, { timeout: 20_000 })
    // y dice que es dato viejo sin conexión
    await expect(page.getByText('sin conexión: mostrando lo último que llegó')).toBeVisible()
    await expect(page.getByText(/hace 2 h/)).toBeVisible()
  })

  test('caché de AYER sin señal: banner grande, no letra chica', async ({ page }) => {
    // La prueba de degradación honesta. A 40 km de la costa no hay
    // señal; la app tiene que seguir sirviendo, pero no puede presentar
    // un score de ayer con cara de fresco.
    usarDiaBase(hoyPanama())
    const datos = datosSinteticos()
    datos.fetchedAt = new Date(Date.now() - 26 * 3600_000).toISOString()
    await page.addInitScript((d) => {
      localStorage.setItem('lafourno:datos:v2', d)
    }, JSON.stringify(datos))
    await cortarRed(page)
    await page.goto('/')

    // Sigue siendo útil: el veredicto está.
    await expect(page.locator('.veredicto')).toHaveCount(1, { timeout: 20_000 })

    // Pero lo dice FUERTE, no en la línea chica: banner con role=alert.
    const banner = page.locator('.banner-viejo')
    await expect(banner).toHaveCount(1)
    await expect(banner).toContainText(/tiene \d+ h/)
    await expect(banner).toHaveAttribute('role', 'alert')

    // Y se ve de verdad: no está escondido ni es más chico que la línea.
    const caja = await banner.boundingBox()
    expect(caja!.height).toBeGreaterThan(30)
    const tam = await banner.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    const chica = await page
      .locator('.estado-dato')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(tam).toBeGreaterThan(chica)

    // La edad sigue visible en todas las vistas con pronóstico.
    await page.goto('/#/punto/contadora')
    await expect(page.locator('.estado-dato')).toContainText(/Datos de hace/)
    await expect(page.locator('.banner-viejo')).toHaveCount(1)
  })

  test('con dato fresco NO hay banner: el aviso tiene que significar algo', async ({
    page,
  }) => {
    await mockApis(page)
    await page.goto('/')
    await expect(page.locator('.badge-score strong').first()).toHaveText(/^\d+$/, {
      timeout: 15_000,
    })
    expect(await page.locator('.banner-viejo').count()).toBe(0)
  })

  test('si solo falla la API marina, lo dice y muestra el clima', async ({ page }) => {
    usarDiaBase(hoyPanama())
    await page.route('**/api.open-meteo.com/**', (route) =>
      route.fulfill({ json: forecastSintetico() }),
    )
    await page.route('**/marine-api.open-meteo.com/**', (route) => route.abort())
    await page.goto('/')
    await expect(page.getByText(/falló mar y marea/)).toBeVisible({ timeout: 20_000 })
    // el veredicto igual sale (score parcial sin ola/marea)
    await expect(page.locator('.veredicto')).toHaveCount(1)
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

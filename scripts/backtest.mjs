// BACKTEST — cuánto se equivoca el pronóstico, y cuántos puntos de
// score vale ese error.
//
// Reemplaza la heurística por medición. Antes la app penalizaba los días
// lejanos con una constante elegida a criterio; ahora la banda de
// incertidumbre sale de comparar, sobre 90 días reales, lo que el
// modelo predecía a N días contra lo que después resultó.
//
// QUÉ ES "LO QUE RESULTÓ" — y hasta dónde vale
//   · Atmósfera (viento, ráfaga, nubes): ERA5 vía archive-api. Es un
//     reanálisis que asimila observaciones —incluido viento de
//     scatterómetro sobre mar—, no una boya. En el Golfo de Panamá no
//     hay boya gratis; esto es lo mejor disponible.
//   · Mar (altura y período): el análisis del propio modelo de oleaje.
//     Eso SÍ es modelo contra modelo y hay que leerlo como tal. El MAE
//     que sale acá (0.02-0.12 m) SUBESTIMA la incertidumbre real por
//     un factor de ~15: los cuatro modelos globales discrepan 0.30 m de
//     media entre sí. No hay boya ni altimetría abierta en el Pacífico
//     panameño con qué dirimirlo — verificado, no supuesto.
//
// El error en puntos NO se propaga analíticamente: se calcula el score
// con los valores pronosticados y con los que resultaron, y se mide la
// diferencia. Es lo mismo que le pasa al usuario.
//
// Uso:
//   npm run backtest              # ventana por defecto
//   npm run backtest -- 60        # últimos 60 días
//
// Deja el artefacto versionado en src/config/backtest.json para
// poder comparar entre rondas.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const TMP = process.env.CLAUDE_JOB_DIR
  ? join(process.env.CLAUDE_JOB_DIR, 'tmp')
  : '.cache-medicion'
if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true })

/** Las cuatro ubicaciones clave. Coinciden con src/config/puntos.ts. */
export const UBICACIONES = [
  { id: 'marina-ocean-reef', nombre: 'Ocean Reef / Amador', lat: 8.9652, lon: -79.5047, tipo: 'nav' },
  { id: 'contadora', nombre: 'Contadora', lat: 8.6269, lon: -79.037, tipo: 'nav' },
  { id: 'las-sirenas', nombre: 'Santa Clara — Las Sirenas', lat: 8.3795, lon: -80.11, tipo: 'playa' },
  { id: 'coronado', nombre: 'Coronado', lat: 8.512, lon: -79.888, tipo: 'playa' },
]

export const LEADS = [1, 2, 3, 4, 5, 6, 7]
const HORA_DESDE = 9
const HORA_HASTA = 16

// ---------------------------------------------------------------
// Curvas del score. DUPLICADAS de src/config/calibracion.ts a
// propósito: el script tiene que correr sin build. El test
// `backtest-curvas.test.ts` falla si dejan de coincidir.
// ---------------------------------------------------------------
export const CURVAS = {
  viento: [[0, 1.0], [5, 1.0], [8, 0.9], [12, 0.65], [15, 0.4], [18, 0.18], [22, 0.05], [25, 0]],
  // Índice de sol (radiación / máximo teórico). Es el insumo principal
  // del término de sol desde el 1-sep-2026; la curva por nubosidad
  // quedó de respaldo y NO se usa acá, porque el backtest tiene que
  // medir el score que la app calcula de verdad.
  sol: [[0.15, 0.2], [0.4, 0.25], [0.55, 0.32], [0.65, 0.75], [0.7, 1.0]],
  ola: [[0, 1.0], [0.5, 1.0], [0.9, 0.7], [1.3, 0.35], [1.8, 0.1], [2.5, 0]],
}
export const PESOS = { viento: 45, sol: 30, ola: 15, marea: 10 }
/** Términos de marea, copiados de calibracion.ts (ver test de deriva). */
export const MAREA = {
  bajaExtremaFrac: 0.15,
  bajaExtremaPenal: 6,
  vaciandoPenal: 3,
  llenandoBono: 2,
}
export const RACHA = { deltaKt: 7, penal: 8 }
export const PESO_PICO = 0.5

export function interp(curva, x) {
  if (x <= curva[0][0]) return curva[0][1]
  for (let i = 1; i < curva.length; i++) {
    const [x1, y1] = curva[i]
    if (x === x1) return y1
    if (x < x1) {
      const [x0, y0] = curva[i - 1]
      return y0 + (y1 - y0) * ((x - x0) / (x1 - x0))
    }
  }
  return curva[curva.length - 1][1]
}

/**
 * Puntos del término de marea, con la misma lógica de cajones que
 * `scoreBloque`. La marea entra al score COMPLETO porque el umbral de
 * la probabilidad se ata a las etiquetas que la app ya usa
 * (Excelente ≥75 de 100), y sin marea el máximo sería 90 y el umbral
 * dejaría de significar lo mismo.
 *
 * Se trata como CONOCIDA, y no es un supuesto: medido el 1-sep-2026,
 * el error del pronóstico de nivel del mar es de 0.6 cm a 1 día y
 * 1.5 cm a 7, sobre un rango de marea de 4.5 m. Despreciable frente al
 * error de viento y nubes, que es lo que esto mide.
 */
export function puntosMarea(rel, tendencia) {
  if (rel == null) return 0
  if (rel < MAREA.bajaExtremaFrac) return PESOS.marea * 0.3 - MAREA.bajaExtremaPenal
  if (tendencia === 'vaciando') return PESOS.marea * 0.6 - MAREA.vaciandoPenal
  return PESOS.marea * 0.8 + (tendencia === 'llenando' ? MAREA.llenandoBono : 0)
}

/**
 * Score parcial: viento + racha + sol + ola. Deja fuera la marea y los
 * castigos de seguridad, que son rayas duras y no se prestan a "error
 * medio". Cubre 90 de los 100 puntos.
 */
export function scoreParcial({ viento, racha, nubes, ola }) {
  // `nubes` acá es el ÍNDICE DE SOL (0..1), no el porcentaje de nubes.
  // Se mantiene el nombre del campo por compatibilidad con los tests
  // de deriva; lo que importa es que la curva y el insumo coincidan.
  let s = 0
  if (viento != null) {
    s += PESOS.viento * interp(CURVAS.viento, viento)
    if (racha != null && racha - viento > RACHA.deltaKt) s -= RACHA.penal
  }
  if (nubes != null) s += PESOS.sol * interp(CURVAS.sol, nubes)
  if (ola != null) s += PESOS.ola * interp(CURVAS.ola, ola)
  return s
}

// ---------------------------------------------------------------

const TZ = 'America%2FPanama'
const lats = UBICACIONES.map((u) => u.lat).join(',')
const lons = UBICACIONES.map((u) => u.lon).join(',')

async function traer(nombre, url) {
  const cache = join(TMP, `bt-${nombre}.json`)
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${nombre}: HTTP ${res.status}`)
  const j = await res.json()
  if (j.error) throw new Error(`${nombre}: ${j.reason}`)
  writeFileSync(cache, JSON.stringify(j))
  return j
}

const asArray = (x) => (Array.isArray(x) ? x : [x])
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const enJornada = (t) => {
  const h = +t.slice(11, 13)
  return h >= HORA_DESDE && h <= HORA_HASTA
}

const varsPrev = (base) => LEADS.map((n) => `${base}_previous_day${n}`).join(',')

async function main() {
  const dias = Number(process.argv[2] ?? 90)
  console.log(`BACKTEST · ${dias} días · ${UBICACIONES.length} ubicaciones · horas ${HORA_DESDE}-${HORA_HASTA}\n`)

  // --- atmósfera: pronósticos viejos + verdad ERA5 ---
  const atm = asArray(
    await traer(
      `atm-${dias}`,
      `https://previous-runs-api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
        `&hourly=wind_speed_10m,wind_gusts_10m,shortwave_radiation,terrestrial_radiation,` +
        `${varsPrev('wind_speed_10m')},${varsPrev('wind_gusts_10m')},` +
        `${varsPrev('shortwave_radiation')},${varsPrev('terrestrial_radiation')}` +
        `&past_days=${dias}&forecast_days=1&timezone=${TZ}&wind_speed_unit=kn&cell_selection=sea`,
    ),
  )
  // --- mar: pronósticos viejos + análisis del propio modelo ---
  const mar = asArray(
    await traer(
      `mar-${dias}`,
      `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}` +
        `&hourly=wave_height,wave_period,sea_level_height_msl,` +
        `${varsPrev('wave_height')},${varsPrev('wave_period')}` +
        `&past_days=${dias}&forecast_days=1&timezone=${TZ}`,
    ),
  )

  const VARIABLES = [
    { clave: 'wind_speed_10m', nombre: 'viento', unidad: 'kt', fuente: atm, verdad: 'ERA5' },
    { clave: 'wind_gusts_10m', nombre: 'ráfaga', unidad: 'kt', fuente: atm, verdad: 'ERA5' },
    { clave: 'shortwave_radiation', nombre: 'radiación', unidad: 'W/m²', fuente: atm, verdad: 'ERA5' },
    { clave: 'wave_height', nombre: 'ola', unidad: 'm', fuente: mar, verdad: 'modelo' },
    { clave: 'wave_period', nombre: 'período', unidad: 's', fuente: mar, verdad: 'modelo' },
  ]

  const porVariable = {}
  for (const v of VARIABLES) {
    porVariable[v.nombre] = {}
    for (const n of LEADS) {
      const errs = []
      const sesgos = []
      for (const p of v.fuente) {
        const h = p.hourly
        const real = h[v.clave]
        const pred = h[`${v.clave}_previous_day${n}`]
        if (!real || !pred) continue
        for (let i = 0; i < h.time.length; i++) {
          if (!enJornada(h.time[i])) continue
          const a = real[i]
          const b = pred[i]
          if (a == null || b == null) continue
          errs.push(Math.abs(b - a))
          sesgos.push(b - a)
        }
      }
      porVariable[v.nombre][n] = {
        mae: media(errs),
        sesgo: media(sesgos),
        n: errs.length,
        unidad: v.unidad,
        verdad: v.verdad,
      }
    }
  }

  // --- error EN PUNTOS DE SCORE, calculado día a día ---
  // No se propaga el MAE analíticamente: se arma el score con lo
  // pronosticado y con lo que resultó, y se mide la diferencia. Es lo
  // que de verdad le pasa al usuario.
  const porHorizonte = {}
  const paresPorHorizonte = {}
  for (const n of LEADS) {
    const difs = []
    const pares = []
    for (let k = 0; k < UBICACIONES.length; k++) {
      const a = atm[k]
      const m = mar[k]
      if (!a || !m) continue
      // agrupar por día, igual que la app
      const dias = new Map()
      for (let i = 0; i < a.hourly.time.length; i++) {
        const t = a.hourly.time[i]
        if (!enJornada(t)) continue
        const d = t.slice(0, 10)
        if (!dias.has(d)) dias.set(d, [])
        dias.get(d).push(i)
      }
      const iMar = new Map(m.hourly.time.map((t, i) => [t, i]))

      /**
       * Nivel de marea relativo al rango del día (0 = bajamar, 1 =
       * pleamar) a la hora de LLEGADA, igual que hace la app: sale a
       * las 9 y llega dos horas después.
       */
      const mareaDelDia = (idxsDia) => {
        const iLlegada = idxsDia[2] ?? idxsDia[0]
        const jj = iMar.get(a.hourly.time[iLlegada])
        if (jj == null) return { rel: null, tendencia: null }
        const niv = m.hourly.sea_level_height_msl
        const v = niv?.[jj]
        if (v == null) return { rel: null, tendencia: null }
        const desde = Math.max(0, jj - 12)
        const hasta = Math.min(niv.length - 1, jj + 12)
        const rango = niv.slice(desde, hasta + 1).filter((x) => x != null)
        if (rango.length < 4) return { rel: null, tendencia: null }
        const mn = Math.min(...rango)
        const mx = Math.max(...rango)
        const rel = mx - mn < 0.3 ? 0.5 : (v - mn) / (mx - mn)
        const sig = niv[Math.min(niv.length - 1, jj + 1)]
        const tendencia = sig == null ? null : sig >= v ? 'llenando' : 'vaciando'
        return { rel, tendencia }
      }

      for (const [, idxs] of dias) {
        const junta = (arr, idx, modo) => {
          const vs = idx.map((i) => arr?.[i]).filter((x) => x != null)
          if (!vs.length) return null
          if (modo === 'media') return media(vs)
          const mx = Math.max(...vs)
          return media(vs) * (1 - PESO_PICO) + mx * PESO_PICO
        }
        const idxMar = idxs
          .map((i) => iMar.get(a.hourly.time[i]))
          .filter((x) => x != null)
        // Índice de sol: suma de lo recibido sobre suma del máximo
        // teórico, igual que hace la app. El máximo teórico es
        // astronómico, así que no tiene error de pronóstico y se toma
        // siempre el real.
        const indice = (suf) => {
          const rec = idxs.map((i) => a.hourly[`shortwave_radiation${suf}`]?.[i]).filter((x) => x != null)
          const teo = idxs.map((i) => a.hourly.terrestrial_radiation?.[i]).filter((x) => x != null)
          if (!rec.length || !teo.length) return null
          const den = teo.reduce((x, y) => x + y, 0)
          return den > 0 ? rec.reduce((x, y) => x + y, 0) / den : null
        }
        const lado = (suf) => ({
          viento: junta(a.hourly[`wind_speed_10m${suf}`], idxs),
          racha: junta(a.hourly[`wind_gusts_10m${suf}`], idxs),
          nubes: indice(suf),
          ola: junta(m.hourly[`wave_height${suf}`], idxMar),
        })
        const real = lado('')
        const pred = lado(`_previous_day${n}`)
        if (real.viento == null || pred.viento == null) continue
        // La marea entra igual en los dos lados: su error de pronóstico
        // es de centímetros (medido), así que se trata como conocida.
        const mar_ = mareaDelDia(idxs)
        const pmar = puntosMarea(mar_.rel, mar_.tendencia)
        const sReal = scoreParcial(real) + pmar
        const sPred = scoreParcial(pred) + pmar
        difs.push(Math.abs(sPred - sReal))
        // El PAR crudo, no solo el error absoluto: es lo que permite
        // construir una probabilidad calibrada después. Con |error| solo
        // se pierde el signo, y sin signo no se puede decir "cuánta
        // chance hay de que el día real sea mejor que esto".
        pares.push({ pred: Math.round(sPred * 10) / 10, real: Math.round(sReal * 10) / 10 })
      }
    }
    difs.sort((x, y) => x - y)
    porHorizonte[n] = {
      maePts: media(difs),
      p90Pts: difs[Math.floor(0.9 * (difs.length - 1))] ?? null,
      dias: difs.length,
    }
    paresPorHorizonte[n] = pares
  }

  // --- salida ---
  console.log('ERROR POR VARIABLE (MAE / sesgo), por días de anticipación\n')
  const cab = LEADS.map((n) => `  -${n}d`).join('')
  console.log('variable        ' + cab + '   verdad')
  console.log('-'.repeat(20 + LEADS.length * 6) + '---------')
  for (const v of VARIABLES) {
    const fila = LEADS.map((n) => {
      const r = porVariable[v.nombre][n]
      return r.mae == null ? '   —  ' : ` ${r.mae.toFixed(2).padStart(5)}`
    }).join('')
    console.log(`${(v.nombre + ` (${v.unidad})`).padEnd(16)}${fila}   ${v.verdad}`)
  }
  console.log('\nsesgo (positivo = el modelo pronostica de más)\n')
  for (const v of VARIABLES) {
    const fila = LEADS.map((n) => {
      const r = porVariable[v.nombre][n]
      return r.sesgo == null ? '   —  ' : ` ${(r.sesgo >= 0 ? '+' : '') + r.sesgo.toFixed(2)}`.padStart(6)
    }).join('')
    console.log(`${(v.nombre + ` (${v.unidad})`).padEnd(16)}${fila}`)
  }

  console.log('\n\nERROR EN PUNTOS DEL SCORE (de 90 medibles)\n')
  console.log('lead |  MAE  |  p90  | días')
  console.log('-----|-------|-------|------')
  for (const n of LEADS) {
    const r = porHorizonte[n]
    console.log(
      ` -${n}d | ${r.maePts.toFixed(1).padStart(5)} | ${(r.p90Pts ?? 0).toFixed(1).padStart(5)} | ${String(r.dias).padStart(4)}`,
    )
  }

  // Percentiles del error con signo, por horizonte. Se siguen
  // guardando porque son la banda ±N que la app ya muestra.
  const errorPercentiles = {}
  for (const n of LEADS) {
    const e = paresPorHorizonte[n].map((x) => x.real - x.pred).sort((a, b) => a - b)
    errorPercentiles[n] = Array.from({ length: 101 }, (_, k) => {
      const v = e[Math.min(e.length - 1, Math.round((k / 100) * (e.length - 1)))]
      return Math.round(v * 100) / 100
    })
  }

  // CURVA DE CALIBRACIÓN: P(el día resulte Excelente | puntaje, horizonte).
  //
  // No se puede usar la distribución de error MARGINAL para esto, y no
  // es un detalle. Se probó y el diagrama de confiabilidad la tumbó: en
  // el tramo alto decía 89 % y pasaba el 45 % a 4 días. La razón es que
  // el error NO es independiente del pronóstico — los puntajes altos
  // regresan a la media, así que aplicarles el error promedio los deja
  // sobreconfiados.
  //
  // Acá se cuenta directo: de los días históricos con un puntaje
  // parecido a este, ¿cuántos terminaron Excelente? Condicionado al
  // puntaje, que es lo que faltaba.
  const UMBRAL = 75
  const VENTANA = 6 // ± puntos de puntaje que cuentan como "parecido"
  const MIN_VECINOS = 25
  const GRILLA = Array.from({ length: 36 }, (_, i) => 30 + i * 2) // 30..100
  const probPorScore = {}
  for (const n of LEADS) {
    const ps = paresPorHorizonte[n]
    probPorScore[n] = GRILLA.map((s) => {
      let v = VENTANA
      let cerca = ps.filter((x) => Math.abs(x.pred - s) <= v)
      // Si no hay vecinos suficientes se ensancha en vez de inventar.
      while (cerca.length < MIN_VECINOS && v < 40) {
        v += 4
        cerca = ps.filter((x) => Math.abs(x.pred - s) <= v)
      }
      if (cerca.length === 0) return null
      return Math.round((1000 * cerca.filter((x) => x.real >= UMBRAL).length) / cerca.length) / 1000
    })
  }
  const realesL1 = paresPorHorizonte[LEADS[0]].map((x) => x.real)
  const tasaBase =
    Math.round((1000 * realesL1.filter((x) => x >= 75).length) / realesL1.length) / 10

  const artefacto = {
    _que: 'Error del pronóstico por horizonte, medido contra lo que después resultó. Lo genera `npm run backtest`. La app lee bandaPts para mostrar la incertidumbre real en vez de una constante inventada.',
    _verdad: {
      atmosfera: 'ERA5 (archive-api). Reanálisis que asimila observaciones; no es una boya.',
      mar: 'Análisis del propio modelo de oleaje: MODELO CONTRA MODELO. Mide consistencia, NO exactitud. El MAE de 0.02-0.12 m que sale abajo subestima muchísimo la incertidumbre real: medido el 1-sep-2026, los cuatro modelos globales de oleaje (gwam, ecmwf_wam, ncep_gfswave025/016) discrepan 0.30 m de media entre sí (p90 0.52, máximo 1.06) sobre olas que promedian medio metro. Y el que usa la app (best_match) sigue a gwam, que lee ~2x más alto que los otros tres. Verificado que NO hay con qué dirimirlo: cero boyas con oleaje en el Pacífico panameño (NDBC solo tiene 3 en la región, todas en el Caribe y sin dato) y ninguna altimetría satelital de altura de ola abierta en ERDDAP.',
    },
    _generado: new Date().toISOString().slice(0, 10),
    _ventanaDias: dias,
    ubicaciones: UBICACIONES.map((u) => u.id),
    porVariable,
    bandaPts: porHorizonte,
    /**
     * La distribución del error CON SIGNO (real − pronosticado) a cada
     * horizonte, como 101 percentiles. Es la materia prima de la
     * probabilidad calibrada: para un pronóstico dado dice qué tan
     * probable es que el día real termine por encima de un umbral.
     *
     * Van percentiles y no los 364 pares crudos porque este archivo lo
     * IMPORTA LA APP: los pares pesan 119 KB de bundle para no aportar
     * nada que los percentiles no digan. Los crudos quedan aparte, en
     * tests/fixtures/backtest-pares.json, solo para validar.
     */
    errorPercentiles,
    /** El umbral de "buen día", elegido con los datos. Ver informe. */
    umbralExcelente: UMBRAL,
    tasaBaseExcelente: tasaBase,
    /**
     * P(Excelente | puntaje, horizonte), contada sobre los días
     * históricos con puntaje parecido. Condicionada al puntaje, que es
     * lo que la versión marginal no hacía y la dejaba sobreconfiada.
     */
    probGrillaScore: GRILLA,
    probPorScore,
  }
  writeFileSync('src/config/backtest.json', JSON.stringify(artefacto, null, 1))
  writeFileSync(
    'tests/fixtures/backtest-pares.json',
    JSON.stringify({
      _que: 'Los pares (score pronosticado, score real) crudos de cada día y horizonte. NO los importa la app —pesan demasiado para el bundle— y existen para validar la calibración de la probabilidad: sin ellos no se puede dibujar el diagrama de confiabilidad.',
      _generado: new Date().toISOString().slice(0, 10),
      paresPorHorizonte,
    }),
  )
  console.log('\nartefacto app:  src/config/backtest.json')
  console.log('pares crudos:   tests/fixtures/backtest-pares.json')
  console.log(`umbral "Excelente" ≥75 · tasa base ${tasaBase} % de los días`)
}

// Solo corre si se invoca directo, no al importarlo desde un test.
if (process.argv[1] && process.argv[1].endsWith('backtest.mjs')) {
  main().catch((e) => {
    console.error('falló:', e.message)
    process.exit(1)
  })
}

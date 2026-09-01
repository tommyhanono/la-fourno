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
//     Eso SÍ es modelo contra modelo y hay que leerlo como tal: mide
//     consistencia, no exactitud contra el mar real. Va marcado en la
//     tabla.
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
  sol: [[0, 1.0], [25, 1.0], [50, 0.75], [75, 0.45], [100, 0.2]],
  ola: [[0, 1.0], [0.5, 1.0], [0.9, 0.7], [1.3, 0.35], [1.8, 0.1], [2.5, 0]],
}
export const PESOS = { viento: 45, sol: 30, ola: 15, marea: 10 }
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
 * Score parcial: viento + racha + sol + ola. Deja fuera la marea (10
 * pts), que no depende del pronóstico atmosférico sino de un modelo
 * astronómico, y los castigos de seguridad, que son rayas duras y no
 * se prestan a "error medio". Cubre 90 de los 100 puntos.
 */
export function scoreParcial({ viento, racha, nubes, ola }) {
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
        `&hourly=wind_speed_10m,wind_gusts_10m,cloud_cover,` +
        `${varsPrev('wind_speed_10m')},${varsPrev('wind_gusts_10m')},${varsPrev('cloud_cover')}` +
        `&past_days=${dias}&forecast_days=1&timezone=${TZ}&wind_speed_unit=kn&cell_selection=sea`,
    ),
  )
  // --- mar: pronósticos viejos + análisis del propio modelo ---
  const mar = asArray(
    await traer(
      `mar-${dias}`,
      `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}` +
        `&hourly=wave_height,wave_period,${varsPrev('wave_height')},${varsPrev('wave_period')}` +
        `&past_days=${dias}&forecast_days=1&timezone=${TZ}`,
    ),
  )

  const VARIABLES = [
    { clave: 'wind_speed_10m', nombre: 'viento', unidad: 'kt', fuente: atm, verdad: 'ERA5' },
    { clave: 'wind_gusts_10m', nombre: 'ráfaga', unidad: 'kt', fuente: atm, verdad: 'ERA5' },
    { clave: 'cloud_cover', nombre: 'nubosidad', unidad: '%', fuente: atm, verdad: 'ERA5' },
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
  for (const n of LEADS) {
    const difs = []
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
        const lado = (suf) => ({
          viento: junta(a.hourly[`wind_speed_10m${suf}`], idxs),
          racha: junta(a.hourly[`wind_gusts_10m${suf}`], idxs),
          nubes: junta(a.hourly[`cloud_cover${suf}`], idxs, 'media'),
          ola: junta(m.hourly[`wave_height${suf}`], idxMar),
        })
        const real = lado('')
        const pred = lado(`_previous_day${n}`)
        if (real.viento == null || pred.viento == null) continue
        difs.push(Math.abs(scoreParcial(pred) - scoreParcial(real)))
      }
    }
    difs.sort((x, y) => x - y)
    porHorizonte[n] = {
      maePts: media(difs),
      p90Pts: difs[Math.floor(0.9 * (difs.length - 1))] ?? null,
      dias: difs.length,
    }
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

  const artefacto = {
    _que: 'Error del pronóstico por horizonte, medido contra lo que después resultó. Lo genera `npm run backtest`. La app lee bandaPts para mostrar la incertidumbre real en vez de una constante inventada.',
    _verdad: {
      atmosfera: 'ERA5 (archive-api). Reanálisis que asimila observaciones; no es una boya.',
      mar: 'Análisis del propio modelo de oleaje: MODELO CONTRA MODELO. Mide consistencia, no exactitud contra el mar real. No hay boya gratis en el Golfo.',
    },
    _generado: new Date().toISOString().slice(0, 10),
    _ventanaDias: dias,
    ubicaciones: UBICACIONES.map((u) => u.id),
    porVariable,
    bandaPts: porHorizonte,
  }
  writeFileSync('src/config/backtest.json', JSON.stringify(artefacto, null, 1))
  console.log('\nartefacto: src/config/backtest.json')
}

// Solo corre si se invoca directo, no al importarlo desde un test.
if (process.argv[1] && process.argv[1].endsWith('backtest.mjs')) {
  main().catch((e) => {
    console.error('falló:', e.message)
    process.exit(1)
  })
}

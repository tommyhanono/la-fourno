// ¿El pronóstico de viento tiene SKILL, o solo es consistente consigo
// mismo? Compara el pronóstico a N días contra dos baselines tontos.
//
// Un modelo solo sirve si le gana a lo trivial:
//   · persistencia  — "mañana va a estar como hoy"
//   · climatología  — "mañana va a estar como el promedio de ese mes"
// Si el pronóstico a 7 días no le gana a la climatología, la vista de
// 7 días ES climatología disfrazada, y el copy no puede prometer más.
//
// VERDAD USADA: ERA5 (reanálisis) vía archive-api. No son observaciones
// de boya —en el Golfo de Panamá no hay uno gratis—, es un modelo que
// asimila observaciones (incluido viento de scatterómetro sobre mar).
// Verificado el 31-ago-2026: la columna `wind_speed_10m` que devuelve
// previous-runs-api para fechas pasadas es IDÉNTICA a ERA5 (MAE 0.00 kt
// sobre 1944 h), o sea que best_match en el pasado resuelve a ERA5.
//
// Uso:
//   node scripts/medir-skill.mjs                    # ventana por defecto
//   node scripts/medir-skill.mjs 2026-06-01 2026-08-20
//
// Requiere red. Cachea los JSON en tmp para no re-bajar.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const TMP = process.env.CLAUDE_JOB_DIR
  ? join(process.env.CLAUDE_JOB_DIR, 'tmp')
  : '.cache-medicion'
if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true })

// Corredor real: punto de salida y destino principal.
const PUNTOS = [
  { id: 'marina', lat: 8.9652, lon: -79.5047 },
  { id: 'contadora', lat: 8.6269, lon: -79.037 },
]
const LEADS = [1, 2, 3, 4, 5, 6, 7]
const HORA_DESDE = 9
const HORA_HASTA = 16
/** Años de los que sale la climatología. */
const ANIOS_CLIMA = [2019, 2020, 2021, 2022, 2023, 2024, 2025]

// Misma curva que src/config/calibracion.ts. Se duplica a propósito:
// el script mide, no importa la app, y así puede correr sin build.
const CURVA = [
  [0, 1.0], [5, 1.0], [8, 0.9], [12, 0.65],
  [15, 0.4], [18, 0.18], [22, 0.05], [25, 0],
]
const PESO_VIENTO = 45

function puntosViento(kt) {
  if (kt <= CURVA[0][0]) return PESO_VIENTO * CURVA[0][1]
  for (let i = 1; i < CURVA.length; i++) {
    const [x1, y1] = CURVA[i]
    if (kt === x1) return PESO_VIENTO * y1
    if (kt < x1) {
      const [x0, y0] = CURVA[i - 1]
      return PESO_VIENTO * (y0 + (y1 - y0) * ((kt - x0) / (x1 - x0)))
    }
  }
  return PESO_VIENTO * CURVA[CURVA.length - 1][1]
}

async function traer(nombre, url) {
  const cache = join(TMP, `${nombre}.json`)
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${nombre}: HTTP ${res.status}`)
  const j = await res.json()
  if (j.error) throw new Error(`${nombre}: ${j.reason}`)
  writeFileSync(cache, JSON.stringify(j))
  return j
}

const TZ = 'America%2FPanama'
const COMUN = `&timezone=${TZ}&wind_speed_unit=kn&cell_selection=sea`

/**
 * Pronósticos viejos por horizonte. Acepta fechas explícitas, no solo
 * `past_days`: verificado el 1-sep-2026 que la API responde para
 * enero-marzo, o sea que la temporada SECA sí se puede medir.
 */
const urlPrevias = (p, desde, hasta) =>
  `https://previous-runs-api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}` +
  `&hourly=${LEADS.map((n) => `wind_speed_10m_previous_day${n}`).join(',')}` +
  `&start_date=${desde}&end_date=${hasta}${COMUN}`

const urlArchivo = (p, desde, hasta) =>
  `https://archive-api.open-meteo.com/v1/archive?latitude=${p.lat}&longitude=${p.lon}` +
  `&hourly=wind_speed_10m&start_date=${desde}&end_date=${hasta}${COMUN}`

const enJornada = (t) => {
  const h = +t.slice(11, 13)
  return h >= HORA_DESDE && h <= HORA_HASTA
}

/** Serie del corredor: el MÁXIMO entre puntos hora a hora, como el score. */
function serieCorredor(porPunto) {
  const out = new Map()
  for (const { times, valores } of porPunto) {
    for (let i = 0; i < times.length; i++) {
      const v = valores[i]
      if (v == null || Number.isNaN(v)) continue
      const previo = out.get(times[i])
      out.set(times[i], previo == null ? v : Math.max(previo, v))
    }
  }
  return out
}

const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length

async function main() {
  const desde = process.argv[2] ?? '2026-06-01'
  const hasta = process.argv[3] ?? '2026-08-20'

  console.log(`Ventana de verificación: ${desde} → ${hasta}`)
  console.log(`Corredor: ${PUNTOS.map((p) => p.id).join(' + ')}, horas ${HORA_DESDE}-${HORA_HASTA}\n`)

  // --- Verdad: ERA5 ---
  const verdadPorPunto = []
  for (const p of PUNTOS) {
    const j = await traer(`era5-${p.id}-${desde}-${hasta}`, urlArchivo(p, desde, hasta))
    verdadPorPunto.push({ times: j.hourly.time, valores: j.hourly.wind_speed_10m })
  }
  const verdad = serieCorredor(verdadPorPunto)

  // --- Pronósticos a N días ---
  const previas = []
  for (const p of PUNTOS) {
    previas.push(
      await traer(`prev-${p.id}-${desde}-${hasta}`, urlPrevias(p, desde, hasta)),
    )
  }
  const pronostico = {}
  for (const n of LEADS) {
    pronostico[n] = serieCorredor(
      previas.map((j) => ({
        times: j.hourly.time,
        valores: j.hourly[`wind_speed_10m_previous_day${n}`],
      })),
    )
  }

  // --- Climatología: media por (mes, hora) de varios años ---
  const acum = new Map()
  for (const anio of ANIOS_CLIMA) {
    for (const p of PUNTOS) {
      const d0 = `${anio}-${desde.slice(5)}`
      const d1 = `${anio}-${hasta.slice(5)}`
      let j
      try {
        j = await traer(`clima-${p.id}-${anio}-${desde.slice(5)}`, urlArchivo(p, d0, d1))
      } catch (e) {
        console.log(`  (clima ${anio} ${p.id}: ${e.message})`)
        continue
      }
      // El corredor climatológico se arma por punto y luego se maximiza,
      // igual que el resto: primero junto por hora.
      const s = serieCorredor([
        { times: j.hourly.time, valores: j.hourly.wind_speed_10m },
      ])
      for (const [t, v] of s) {
        const clave = `${t.slice(5, 7)}-${t.slice(11, 13)}` // mes-hora
        if (!acum.has(clave)) acum.set(clave, [])
        acum.get(clave).push(v)
      }
    }
  }
  const clima = new Map()
  for (const [k, vs] of acum) clima.set(k, media(vs))

  // --- Comparación ---
  const filas = []
  for (const n of LEADS) {
    const err = { modelo: [], persistencia: [], clima: [] }
    const errPts = { modelo: [], persistencia: [], clima: [] }
    for (const [t, real] of verdad) {
      if (!enJornada(t)) continue
      const pron = pronostico[n].get(t)
      // Persistencia: la verdad de N días antes, misma hora.
      const antes = new Date(new Date(`${t}:00-05:00`).getTime() - n * 86400_000)
      const tAntes =
        antes.toISOString().slice(0, 10) === undefined ? null : fechaPanama(antes)
      const pers = tAntes ? verdad.get(tAntes) : null
      const cl = clima.get(`${t.slice(5, 7)}-${t.slice(11, 13)}`)
      if (pron == null || pers == null || cl == null) continue
      err.modelo.push(Math.abs(pron - real))
      err.persistencia.push(Math.abs(pers - real))
      err.clima.push(Math.abs(cl - real))
      const pr = puntosViento(real)
      errPts.modelo.push(Math.abs(puntosViento(pron) - pr))
      errPts.persistencia.push(Math.abs(puntosViento(pers) - pr))
      errPts.clima.push(Math.abs(puntosViento(cl) - pr))
    }
    if (err.modelo.length === 0) {
      filas.push({ n, vacio: true })
      continue
    }
    // Comparación PAREADA contra climatología, hora por hora. La
    // diferencia de promedios no dice si el resultado aguanta: con
    // n~600 y errores parecidos, hace falta el error estándar de la
    // diferencia para saber si el cruce en el día 6-7 es real o ruido.
    const dif = err.modelo.map((v, i) => v - err.clima[i])
    const mDif = media(dif)
    const sd = Math.sqrt(media(dif.map((d) => (d - mDif) ** 2)))
    const ee = sd / Math.sqrt(dif.length)

    filas.push({
      n,
      nObs: err.modelo.length,
      modelo: media(err.modelo),
      persistencia: media(err.persistencia),
      clima: media(err.clima),
      modeloPts: media(errPts.modelo),
      climaPts: media(errPts.clima),
      difClima: mDif,
      ee,
      // |diferencia| > 2 errores estándar ≈ distinguible de cero
      concluyente: Math.abs(mDif) > 2 * ee,
    })
  }

  console.log('MAE en nudos (más bajo = mejor)\n')
  console.log('lead | n    | modelo | persist | climat | ¿gana a persist? | ¿gana a clima?')
  console.log('-----|------|--------|---------|--------|------------------|---------------')
  for (const f of filas) {
    if (f.vacio) {
      console.log(` -${f.n}d | sin datos comparables`)
      continue
    }
    const gp = f.modelo < f.persistencia ? 'sí' : 'NO'
    const gc = f.modelo < f.clima ? 'sí' : 'NO'
    console.log(
      ` -${f.n}d | ${String(f.nObs).padStart(4)} | ` +
        `${f.modelo.toFixed(2).padStart(6)} | ${f.persistencia.toFixed(2).padStart(7)} | ` +
        `${f.clima.toFixed(2).padStart(6)} | ${gp.padStart(16)} | ${gc.padStart(14)}`,
    )
  }

  console.log('\nMAE en puntos de viento del score (de 45)\n')
  console.log('lead | modelo | climat')
  console.log('-----|--------|-------')
  for (const f of filas) {
    if (f.vacio) continue
    console.log(
      ` -${f.n}d | ${f.modeloPts.toFixed(1).padStart(6)} | ${f.climaPts.toFixed(1).padStart(6)}`,
    )
  }

  console.log('\nModelo vs climatología, comparación pareada (negativo = el modelo gana)\n')
  console.log('lead | dif MAE | error est. | ¿concluyente a 2 EE?')
  console.log('-----|---------|------------|----------------------')
  for (const f of filas) {
    if (f.vacio) continue
    const signo = f.difClima >= 0 ? '+' : ''
    console.log(
      ` -${f.n}d | ${(signo + f.difClima.toFixed(3)).padStart(7)} | ` +
        `${('±' + f.ee.toFixed(3)).padStart(10)} | ` +
        (f.concluyente ? (f.difClima < 0 ? 'sí, gana el modelo' : 'sí, gana climatología') : 'no — empate estadístico'),
    )
  }

  const vivos = filas.filter((f) => !f.vacio)
  const ganaClima = vivos.filter((f) => f.modelo < f.clima).length
  const ganaPers = vivos.filter((f) => f.modelo < f.persistencia).length
  console.log(
    `\nVEREDICTO: el modelo le gana a persistencia en ${ganaPers}/${vivos.length} horizontes ` +
      `y a climatología en ${ganaClima}/${vivos.length}.`,
  )
  console.log(`Años de climatología: ${ANIOS_CLIMA.join(', ')}`)
}

/** ISO local de Panamá "YYYY-MM-DDTHH:00", que es como vienen los times. */
function fechaPanama(d) {
  const ms = d.getTime() - 5 * 3600_000
  return new Date(ms).toISOString().slice(0, 13) + ':00'
}

main().catch((e) => {
  console.error('falló:', e.message)
  process.exit(1)
})

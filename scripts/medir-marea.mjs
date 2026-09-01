// ¿La marea estimada llega a tiempo?
//
// Compara los extremos que la app detecta sobre la serie de CMEMS
// (Open-Meteo marine, `sea_level_height_msl`) contra las predicciones
// armónicas OFICIALES de NOAA, en varias estaciones del Pacífico.
//
// La pregunta que resuelve: el sesgo de −27 min que se ve en Balboa,
// ¿es un error de fase del MODELO (y entonces se corrige) o es que la
// celda de CMEMS cae 10 km al sur de la estación y la marea llega antes
// ahí (y entonces corregirlo sería inventar)?
//
// Si el mismo sesgo aparece en Puntarenas y en Galápagos —a cientos y
// miles de km, y Galápagos en océano abierto sin golfo que lo amplifique—
// es del modelo.
//
// Uso: node scripts/medir-marea.mjs

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const TMP = process.env.CLAUDE_JOB_DIR
  ? join(process.env.CLAUDE_JOB_DIR, 'tmp')
  : '.cache-medicion'
if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true })

const DESDE = '2026-06-01'
const HASTA = '2026-08-31'

const ESTACIONES = [
  { id: '9812501', nombre: 'Balboa (Panamá)', lat: 8.9667, lon: -79.5667 },
  { id: '9684403', nombre: 'Puntarenas (Costa Rica)', lat: 9.9733, lon: -84.8317 },
  { id: '9991474', nombre: 'La Libertad (Ecuador)', lat: -2.2017, lon: -80.91 },
  { id: '9992401', nombre: 'San Cristóbal (Galápagos)', lat: -0.9, lon: -89.6167 },
]

async function traer(nombre, url) {
  const cache = join(TMP, `${nombre}.json`)
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const j = await res.json()
  if (j.error) throw new Error(j.reason ?? 'error')
  writeFileSync(cache, JSON.stringify(j))
  return j
}

const urlNoaa = (id) =>
  `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions` +
  `&application=lafourno&begin_date=${DESDE.replaceAll('-', '')}&end_date=${HASTA.replaceAll('-', '')}` +
  `&datum=MSL&station=${id}&time_zone=gmt&units=metric&interval=hilo&format=json`

const urlCmems = (lat, lon) =>
  `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
  `&hourly=sea_level_height_msl&start_date=${DESDE}&end_date=${HASTA}&timezone=GMT`

/**
 * Mismos extremos que src/lib/tide.ts: máximos y mínimos locales de la
 * grilla horaria, afinados con el vértice de la parábola por los tres
 * puntos. Se duplica acá para que el script corra sin build; si cambia
 * el algoritmo de la app, hay que cambiarlo también acá.
 * (El test tests/unit/marea-validacion.test.ts sí usa el código real.)
 */
function extremos(times, niveles) {
  const out = []
  for (let i = 1; i < times.length - 1; i++) {
    const y0 = niveles[i - 1]
    const y1 = niveles[i]
    const y2 = niveles[i + 1]
    if (y0 == null || y1 == null || y2 == null) continue
    const esMax = y1 >= y0 && y1 >= y2 && (y1 > y0 || y1 > y2)
    const esMin = y1 <= y0 && y1 <= y2 && (y1 < y0 || y1 < y2)
    if (!esMax && !esMin) continue
    const den = y0 - 2 * y1 + y2
    let dx = Math.abs(den) > 1e-9 ? (0.5 * (y0 - y2)) / den : 0
    dx = Math.max(-1, Math.min(1, dx))
    const nivel = y1 - 0.25 * (y0 - y2) * dx
    out.push({
      ms: times[i] + dx * 3600_000,
      nivel,
      tipo: esMax ? 'pleamar' : 'bajamar',
    })
  }
  return out
}

const q = (xs, f) => [...xs].sort((a, b) => a - b)[Math.floor(f * (xs.length - 1))]
const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length

async function main() {
  console.log(`Desfase de la marea estimada contra NOAA · ${DESDE} → ${HASTA}`)
  console.log('(negativo = el modelo adelanta el extremo)\n')
  console.log('estación                   | n   | media  | mediana | p10    | p90    | |peor|')
  console.log('---------------------------|-----|--------|---------|--------|--------|-------')

  const resumen = []
  for (const e of ESTACIONES) {
    let noaa, cm
    try {
      noaa = await traer(`noaa-${e.id}`, urlNoaa(e.id))
      cm = await traer(`cmems-${e.id}`, urlCmems(e.lat, e.lon))
    } catch (err) {
      console.log(`${e.nombre.padEnd(26)} | no disponible: ${err.message}`)
      continue
    }
    const preds = noaa.predictions ?? []
    if (preds.length === 0) {
      console.log(`${e.nombre.padEnd(26)} | NOAA no devolvió predicciones`)
      continue
    }
    const times = cm.hourly.time.map((t) => new Date(`${t}:00Z`).getTime())
    const mios = extremos(times, cm.hourly.sea_level_height_msl)
    const dts = []
    for (const p of preds) {
      const t = new Date(`${p.t.replace(' ', 'T')}:00Z`).getTime()
      const tipo = p.type === 'H' ? 'pleamar' : 'bajamar'
      let mejor = null
      let b = Infinity
      for (const m of mios) {
        if (m.tipo !== tipo) continue
        const d = Math.abs(m.ms - t)
        if (d < b) { b = d; mejor = m }
      }
      if (!mejor || b > 3 * 3600_000) continue
      dts.push((mejor.ms - t) / 60_000)
    }
    if (dts.length < 20) {
      console.log(`${e.nombre.padEnd(26)} | solo ${dts.length} pares, se descarta`)
      continue
    }
    const abs = dts.map(Math.abs)
    resumen.push({ nombre: e.nombre, n: dts.length, media: media(dts) })
    console.log(
      `${e.nombre.padEnd(26)} | ${String(dts.length).padStart(3)} | ` +
        `${media(dts).toFixed(1).padStart(6)} | ${q(dts, 0.5).toFixed(1).padStart(7)} | ` +
        `${q(dts, 0.1).toFixed(1).padStart(6)} | ${q(dts, 0.9).toFixed(1).padStart(6)} | ` +
        `${Math.max(...abs).toFixed(0).padStart(5)}`,
    )
  }

  if (resumen.length > 1) {
    const medias = resumen.map((r) => r.media)
    console.log(
      `\nSesgo medio entre estaciones: ${media(medias).toFixed(1)} min ` +
        `(de ${Math.min(...medias).toFixed(1)} a ${Math.max(...medias).toFixed(1)})`,
    )
    console.log(
      'Si el sesgo se repite lejos de Panamá, es del modelo CMEMS y se puede\n' +
        'corregir. Si solo aparece en Balboa, es geografía y corregirlo sería inventar.',
    )
  }
}

main().catch((e) => {
  console.error('falló:', e.message)
  process.exit(1)
})

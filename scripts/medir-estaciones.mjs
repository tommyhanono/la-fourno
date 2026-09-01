// ¿La calibración sirve igual en seca que en lluviosa?
//
// Todo el score se ajustó mirando temporada lluviosa. Enero-marzo es
// cuando Tommy más sale y es otro régimen: nortes sostenidos en el Golfo
// contra calmas y chubascos. Si el reparto de días "buenos" se va a un
// extremo en una de las dos estaciones, la calibración es estacional y
// hay que decirlo (o estacionalizarla).
//
// No mide skill de pronóstico: la API de corridas anteriores solo llega
// ~92 días atrás, así que en seca no hay pronósticos viejos que
// verificar. Mide RÉGIMEN, con el archivo (ERA5).
//
// DOS LÍMITES DEL ARCHIVO, verificados el 1-sep-2026 y que hay que tener
// presentes al leer los números:
//   · ERA5 NO trae CAPE (0 de 2208 horas en la muestra).
//   · El weather_code derivado de ERA5 nunca da 95/96/99: solo llega a
//     lluvia (códigos 0-65). Cero tormentas en 460 días de lluviosa,
//     que es imposible en Panamá.
// O sea que acá no se pueden ejercitar los castigos de tormenta (−60) ni
// de CAPE (−20). La dispersión de la temporada lluviosa que sale abajo
// es un PISO: el score real, que sí ve tormentas en el pronóstico en
// vivo, separa más de lo que este script puede mostrar.
//
// Uso: node scripts/medir-estaciones.mjs

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const TMP = process.env.CLAUDE_JOB_DIR
  ? join(process.env.CLAUDE_JOB_DIR, 'tmp')
  : '.cache-medicion'
if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true })

const PUNTOS = [
  { id: 'marina', lat: 8.9652, lon: -79.5047 },
  { id: 'contadora', lat: 8.6269, lon: -79.037 },
]
const ANIOS = [2021, 2022, 2023, 2024, 2025]
const TEMPORADAS = [
  { id: 'seca', desde: '01-01', hasta: '03-31', nombre: 'SECA (ene-mar)' },
  { id: 'lluviosa', desde: '06-01', hasta: '08-31', nombre: 'LLUVIOSA (jun-ago)' },
]
const HORA_DESDE = 9
const HORA_HASTA = 16

const CURVA_VIENTO = [
  [0, 1.0], [5, 1.0], [8, 0.9], [12, 0.65],
  [15, 0.4], [18, 0.18], [22, 0.05], [25, 0],
]
const CURVA_SOL = [[0, 1.0], [25, 1.0], [50, 0.75], [75, 0.45], [100, 0.2]]
const PESO_VIENTO = 45
const PESO_SOL = 30

function interp(curva, x) {
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

const url = (p, d0, d1) =>
  `https://archive-api.open-meteo.com/v1/archive?latitude=${p.lat}&longitude=${p.lon}` +
  `&hourly=wind_speed_10m,wind_gusts_10m,cloud_cover,precipitation,weather_code,cape` +
  `&start_date=${d0}&end_date=${d1}` +
  `&timezone=America%2FPanama&wind_speed_unit=kn&cell_selection=sea`

// Penalizaciones atmosféricas del score real (calibracion.ts). No están
// la ola ni la marea: piden otra API y pesan 25 de 100. Lo que se
// compara acá es si el score SEPARA días, y eso lo deciden estas.
const SEG = {
  tormentaCodes: [95, 96, 99],
  tormentaPenal: 60,
  tormentaPeligroFrac: 0.35,
  capeAltoJkg: 2500,
  capeAltoPenal: 20,
  lluviaFuerteMmH: 4,
  lluviaFuertePenal: 25,
}
const RACHA_DELTA = 7
const RACHA_PENAL = 8

const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const pct = (xs, f) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(f * (s.length - 1))]
}

async function main() {
  console.log('RÉGIMEN POR TEMPORADA — corredor marina+Contadora, horas 9-16')
  console.log(`Años: ${ANIOS.join(', ')} · fuente: ERA5 vía archive-api\n`)

  const resumen = {}

  for (const t of TEMPORADAS) {
    // Por día: viento del corredor (máx entre puntos, luego típico de la
    // jornada) y nubosidad media. Igual que hace el score.
    const porDia = new Map()
    for (const anio of ANIOS) {
      for (const p of PUNTOS) {
        let j
        try {
          j = await traer(
            `est2-${p.id}-${anio}-${t.id}`,
            url(p, `${anio}-${t.desde}`, `${anio}-${t.hasta}`),
          )
        } catch (e) {
          console.log(`  (${anio} ${p.id} ${t.id}: ${e.message})`)
          continue
        }
        const h = j.hourly
        for (let i = 0; i < h.time.length; i++) {
          const hora = +h.time[i].slice(11, 13)
          if (hora < HORA_DESDE || hora > HORA_HASTA) continue
          const dia = h.time[i].slice(0, 10)
          if (!porDia.has(dia))
            porDia.set(dia, { v: [], g: [], n: [], ll: [], cape: [], codes: [] })
          const r = porDia.get(dia)
          if (h.wind_speed_10m[i] != null) r.v.push(h.wind_speed_10m[i])
          if (h.wind_gusts_10m[i] != null) r.g.push(h.wind_gusts_10m[i])
          if (h.cloud_cover[i] != null) r.n.push(h.cloud_cover[i])
          if (h.precipitation[i] != null) r.ll.push(h.precipitation[i])
          if (h.cape[i] != null) r.cape.push(h.cape[i])
          if (h.weather_code[i] != null) r.codes.push(h.weather_code[i])
        }
      }
    }

    const vientos = []
    const scores = [] // solo viento + sol
    const scoresFull = [] // con las penalizaciones atmosféricas
    let conLluvia = 0
    let conPeligro = 0
    for (const [, r] of porDia) {
      if (r.v.length === 0) continue
      // "típico ponderado al pico", pesoPico 0.5, igual que la app
      const vTip = media(r.v) * 0.5 + Math.max(...r.v) * 0.5
      vientos.push(vTip)
      const nub = r.n.length ? media(r.n) : 50
      const base =
        PESO_VIENTO * interp(CURVA_VIENTO, vTip) + PESO_SOL * interp(CURVA_SOL, nub)
      scores.push(base)

      // --- mismo orden de castigos que scoreBloque ---
      let full = base
      const racha = r.g.length ? Math.max(...r.g) : null
      if (racha != null && racha - vTip > RACHA_DELTA) full -= RACHA_PENAL

      const horasTormenta = r.codes.filter((c) => SEG.tormentaCodes.includes(c)).length
      const fracTormenta = r.codes.length ? horasTormenta / r.codes.length : 0
      let peligro = false
      if (horasTormenta > 0) {
        full -= SEG.tormentaPenal * fracTormenta
        if (fracTormenta >= SEG.tormentaPeligroFrac) peligro = true
      } else if (r.cape.length) {
        const capeTip = media(r.cape) * 0.5 + Math.max(...r.cape) * 0.5
        if (capeTip > SEG.capeAltoJkg) full -= SEG.capeAltoPenal
      }
      const lluviaTip = r.ll.length
        ? media(r.ll) * 0.5 + Math.max(...r.ll) * 0.5
        : 0
      if (lluviaTip >= SEG.lluviaFuerteMmH) full -= SEG.lluviaFuertePenal

      scoresFull.push(Math.max(0, full))
      if (peligro) conPeligro++
      if (r.ll.length && Math.max(...r.ll) >= 1) conLluvia++
    }

    resumen[t.id] = { vientos, scores, scoresFull, dias: porDia.size, conLluvia, conPeligro }

    console.log(`--- ${t.nombre} · ${porDia.size} días ---`)
    console.log(
      `  viento típico de jornada: media ${media(vientos).toFixed(1)} kt · ` +
        `p10 ${pct(vientos, 0.1).toFixed(1)} · p50 ${pct(vientos, 0.5).toFixed(1)} · ` +
        `p90 ${pct(vientos, 0.9).toFixed(1)} · máx ${Math.max(...vientos).toFixed(1)}`,
    )
    console.log(
      `  días con lluvia en la jornada (≥1 mm): ${conLluvia} ` +
        `(${((100 * conLluvia) / porDia.size).toFixed(0)} %)`,
    )
    const maxParcial = PESO_VIENTO + PESO_SOL
    console.log(
      `  score parcial viento+sol (de ${maxParcial}): media ${media(scores).toFixed(1)} · ` +
        `p10 ${pct(scores, 0.1).toFixed(1)} · p90 ${pct(scores, 0.9).toFixed(1)}`,
    )
    // Reparto: ¿la calibración separa días o los amontona?
    const cortes = [0.9, 0.75, 0.6, 0.45]
    const reparto = cortes.map((c) => {
      const umbral = c * maxParcial
      return `${(100 * scores.filter((s) => s >= umbral).length / scores.length).toFixed(0)}%`
    })
    console.log(
      `  días por encima de: 90% ${reparto[0]} · 75% ${reparto[1]} · ` +
        `60% ${reparto[2]} · 45% ${reparto[3]} del máximo`,
    )
    console.log(
      `  CON castigos atmosféricos: media ${media(scoresFull).toFixed(1)} · ` +
        `p10 ${pct(scoresFull, 0.1).toFixed(1)} · p90 ${pct(scoresFull, 0.9).toFixed(1)} · ` +
        `dispersión ${(pct(scoresFull, 0.9) - pct(scoresFull, 0.1)).toFixed(1)}`,
    )
    console.log(
      `  días con bandera de tormenta: ${conPeligro} ` +
        `(${((100 * conPeligro) / porDia.size).toFixed(0)} %)`,
    )
    console.log('')
  }

  // Comparación directa
  const s = resumen.seca
  const l = resumen.lluviosa
  if (s && l && s.vientos.length && l.vientos.length) {
    console.log('--- COMPARACIÓN ---')
    console.log(
      `viento medio: seca ${media(s.vientos).toFixed(1)} kt vs ` +
        `lluviosa ${media(l.vientos).toFixed(1)} kt ` +
        `(diferencia ${(media(s.vientos) - media(l.vientos)).toFixed(1)} kt)`,
    )
    console.log(
      `score parcial medio: seca ${media(s.scores).toFixed(1)} vs ` +
        `lluviosa ${media(l.scores).toFixed(1)} ` +
        `(diferencia ${(media(s.scores) - media(l.scores)).toFixed(1)} pts)`,
    )
    const disp = (xs) => pct(xs, 0.9) - pct(xs, 0.1)
    console.log(
      `dispersión solo viento+sol: seca ${disp(s.scores).toFixed(1)} vs ` +
        `lluviosa ${disp(l.scores).toFixed(1)}`,
    )
    console.log(
      `dispersión CON castigos:    seca ${disp(s.scoresFull).toFixed(1)} vs ` +
        `lluviosa ${disp(l.scoresFull).toFixed(1)}`,
    )
    console.log(
      '\nLa pregunta no es si las medias coinciden —no tienen por qué—, sino si',
    )
    console.log(
      'en ALGUNA temporada el score deja de separar días. Ahí es donde no sirve',
    )
    console.log('para elegir, que es lo único que la app tiene que hacer.')
  }
}

main().catch((e) => {
  console.error('falló:', e.message)
  process.exit(1)
})

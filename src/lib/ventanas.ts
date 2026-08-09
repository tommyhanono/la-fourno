// Arma los bloques de 2 h del corredor Ocean Reef → Las Perlas
// (Contadora como destino de referencia), los puntúa y saca las
// 3 mejores ventanas de la semana. Solo horas de luz.

import { PUNTOS, PUNTO_SALIDA, PUNTO_DESTINO } from '../config/puntos'
import { CALIBRACION } from '../config/calibracion'
import type { DatosApp, PuntoForecast, PuntoMarine } from './types'
import {
  scoreBloque,
  scorePlaya,
  type EntradaBloque,
  type ResultadoScore,
} from './score'
import { serieMarea, nivelRelativo, tendenciaEn, type SerieMarea } from './tide'
import { parsePanama, claveDia } from './time'

export interface Bloque {
  inicio: Date
  fin: Date
  score: ResultadoScore
  entrada: EntradaBloque
}

const idx = (id: string) => PUNTOS.findIndex((p) => p.id === id)

function maxNum(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => x != null && !Number.isNaN(x))
  return v.length ? Math.max(...v) : null
}
function minNum(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => x != null && !Number.isNaN(x))
  return v.length ? Math.min(...v) : null
}
function meanNum(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => x != null && !Number.isNaN(x))
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

/** Índices horarios [i, i+bloqueHoras) que caen dentro del bloque. */
function indicesBloque(times: string[], inicio: Date, horas: number): number[] {
  const t0 = inicio.getTime()
  const t1 = t0 + horas * 3600_000
  const out: number[] = []
  for (let i = 0; i < times.length; i++) {
    const t = parsePanama(times[i]).getTime()
    if (t >= t0 && t < t1) out.push(i)
  }
  return out
}

function entradaCorredor(
  inicio: Date,
  fs: PuntoForecast[],
  ms: (PuntoMarine | null)[],
  mareaDestino: SerieMarea | null,
): EntradaBloque {
  const horas = CALIBRACION.bloqueHoras
  // Peor caso entre salida y destino: el corredor se navega entero.
  const pares: { f: PuntoForecast; m: PuntoMarine | null }[] = [
    { f: fs[idx(PUNTO_SALIDA.id)], m: ms[idx(PUNTO_SALIDA.id)] },
    { f: fs[idx(PUNTO_DESTINO.id)], m: ms[idx(PUNTO_DESTINO.id)] },
  ]

  const vientos: (number | null)[] = []
  const rachas: (number | null)[] = []
  const nubes: (number | null)[] = []
  const probs: (number | null)[] = []
  const lluvias: (number | null)[] = []
  const olas: (number | null)[] = []
  const periodos: (number | null)[] = []
  const codes: number[] = []
  const capes: (number | null)[] = []

  for (const { f, m } of pares) {
    const ii = indicesBloque(f.hourly.time, inicio, horas)
    vientos.push(maxNum(ii.map((i) => f.hourly.wind_speed_10m[i])))
    rachas.push(maxNum(ii.map((i) => f.hourly.wind_gusts_10m[i])))
    nubes.push(meanNum(ii.map((i) => f.hourly.cloud_cover[i])))
    probs.push(maxNum(ii.map((i) => f.hourly.precipitation_probability[i])))
    lluvias.push(maxNum(ii.map((i) => f.hourly.precipitation[i])))
    capes.push(maxNum(ii.map((i) => f.hourly.cape[i])))
    for (const i of ii) {
      const w = f.hourly.weather_code[i]
      if (w != null) codes.push(w)
    }
    if (m) {
      const im = indicesBloque(m.hourly.time, inicio, horas)
      olas.push(maxNum(im.map((i) => m.hourly.wave_height[i])))
      periodos.push(minNum(im.map((i) => m.hourly.wave_period[i])))
    }
  }

  // Marea al momento de LLEGADA al destino (fin del bloque de salida).
  const llegada = new Date(inicio.getTime() + horas * 3600_000)
  return {
    vientoKt: maxNum(vientos),
    rachaKt: maxNum(rachas),
    nubosidadPct: meanNum(nubes),
    probLluviaPct: maxNum(probs),
    lluviaMmH: maxNum(lluvias),
    olaM: maxNum(olas),
    periodoS: minNum(periodos),
    weatherCodes: codes,
    capeJkg: maxNum(capes),
    mareaRel: mareaDestino ? nivelRelativo(mareaDestino, llegada) : null,
    mareaTendencia: mareaDestino ? tendenciaEn(mareaDestino, llegada) : null,
  }
}

/** Bloques de luz de los próximos 7 días para el corredor, puntuados. */
export function bloquesCorredor(datos: DatosApp): Bloque[] {
  const f0 = datos.forecast[idx(PUNTO_SALIDA.id)]
  if (!f0) return []
  const mDest = datos.marine[idx(PUNTO_DESTINO.id)]
  const marea = mDest
    ? serieMarea(mDest.hourly.time, mDest.hourly.sea_level_height_msl)
    : null

  const bloques: Bloque[] = []
  const ahora = new Date()

  for (let d = 0; d < f0.daily.time.length; d++) {
    const sunrise = parsePanama(f0.daily.sunrise[d])
    const sunset = parsePanama(f0.daily.sunset[d])
    // Bloques pares desde las 6 am; se aceptan si tocan luz de día.
    const base = parsePanama(`${f0.daily.time[d]}T00:00`)
    for (let h = 6; h <= 16; h += CALIBRACION.bloqueHoras) {
      const inicio = new Date(base.getTime() + h * 3600_000)
      const fin = new Date(inicio.getTime() + CALIBRACION.bloqueHoras * 3600_000)
      if (fin <= ahora) continue // bloque ya pasado
      if (inicio < new Date(sunrise.getTime() - 45 * 60_000)) continue
      if (fin > new Date(sunset.getTime() + 45 * 60_000)) continue
      const entrada = entradaCorredor(inicio, datos.forecast, datos.marine, marea)
      bloques.push({ inicio, fin, score: scoreBloque(entrada), entrada })
    }
  }
  return bloques
}

/** Las 3 mejores ventanas: máximo 2 por día y sin bloques pegados. */
export function mejoresVentanas(bloques: Bloque[], n = 3): Bloque[] {
  const orden = [...bloques].sort((a, b) => b.score.total - a.score.total)
  const elegidos: Bloque[] = []
  for (const b of orden) {
    if (elegidos.length >= n) break
    if (b.score.peligro) continue
    const mismoDia = elegidos.filter((e) => claveDia(e.inicio) === claveDia(b.inicio))
    if (mismoDia.length >= 2) continue
    // sin ventanas a menos de 4 h de otra ya elegida
    if (
      elegidos.some(
        (e) => Math.abs(e.inicio.getTime() - b.inicio.getTime()) < 4 * 3600_000,
      )
    )
      continue
    elegidos.push(b)
  }
  return elegidos.sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
}

export interface DiaResumen {
  dia: Date
  clave: string
  mejorBloque: Bloque | null
}

/** Mejor bloque por día — para la vista semanal. */
export function resumenSemanal(bloques: Bloque[]): DiaResumen[] {
  const porDia = new Map<string, Bloque[]>()
  for (const b of bloques) {
    const k = claveDia(b.inicio)
    if (!porDia.has(k)) porDia.set(k, [])
    porDia.get(k)!.push(b)
  }
  return [...porDia.entries()].map(([clave, bs]) => ({
    clave,
    dia: bs[0].inicio,
    mejorBloque: bs.reduce<Bloque | null>(
      (best, b) => (best == null || b.score.total > best.score.total ? b : best),
      null,
    ),
  }))
}

/** Score de día de playa por día para un punto tipo 'playa'. */
export interface DiaPlaya {
  dia: Date
  clave: string
  score: ResultadoScore
  uvMax: number | null
  tempMax: number | null
}

export function diasPlaya(datos: DatosApp, puntoId: string): DiaPlaya[] {
  const i = idx(puntoId)
  const f = datos.forecast[i]
  if (!f) return []
  const out: DiaPlaya[] = []
  for (let d = 0; d < f.daily.time.length; d++) {
    const base = parsePanama(`${f.daily.time[d]}T00:00`)
    // Horas de playa: 9 am – 4 pm
    const ii = indicesBloque(f.hourly.time, new Date(base.getTime() + 9 * 3600_000), 7)
    const codes = ii
      .map((k) => f.hourly.weather_code[k])
      .filter((x): x is number => x != null)
    out.push({
      dia: base,
      clave: f.daily.time[d],
      score: scorePlaya({
        nubosidadPct: meanNum(ii.map((k) => f.hourly.cloud_cover[k])),
        probLluviaPct: maxNum(ii.map((k) => f.hourly.precipitation_probability[k])),
        vientoKt: maxNum(ii.map((k) => f.hourly.wind_speed_10m[k])),
        weatherCodes: codes,
      }),
      uvMax: maxNum(ii.map((k) => f.hourly.uv_index[k])),
      tempMax: maxNum(ii.map((k) => f.hourly.temperature_2m[k])),
    })
  }
  return out
}

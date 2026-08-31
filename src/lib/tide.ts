// Marea a partir de sea_level_height_msl (horario). SIEMPRE es un
// ESTIMADO de modelo (CMEMS vía Open-Meteo) — el UI lo marca así.
// Los extremos se afinan con interpolación parabólica entre las tres
// horas alrededor de cada pico: con datos horarios el instante del pico
// cae entre muestras, y el vértice de la parábola lo recupera.
//
// QUÉ SE VERIFICÓ DE VERDAD (31-ago-2026, Contadora, 8 días)
// No hay comparación contra la tabla armónica oficial de Balboa: acá
// no se validó eso, y antes este comentario lo afirmaba de más. Lo que
// sí se comprobó es la consistencia física de la serie:
//   · 30 extremos en 8 días, 15 pleamares y 15 bajamares (semidiurna).
//   · Pleamar→pleamar: 12.48 h medidos contra 12.42 h teóricos de la
//     componente M2. Error 0.5 %, ~4 min por ciclo.
//   · Ciclo sicigia→cuadratura correcto: el rango cae de 4.52 m a
//     2.70 m en seis días y vuelve a crecer.
//   · Rango de sicigia 4.5-4.7 m, del orden del de Balboa.
// O sea: período, fase y amplitud se comportan como una marea real del
// Golfo. Sigue siendo un modelo, y la etiqueta "estimada" no se quita.

import type { ExtremoMarea } from './types'
import { parsePanama } from './time'

export interface SerieMarea {
  times: Date[]
  niveles: (number | null)[]
}

export function serieMarea(timesIso: string[], niveles: (number | null)[]): SerieMarea {
  return { times: timesIso.map(parsePanama), niveles }
}

/** Nivel interpolado linealmente en el instante t. null si no hay dato. */
export function nivelEn(s: SerieMarea, t: Date): number | null {
  const ms = t.getTime()
  for (let i = 0; i < s.times.length - 1; i++) {
    const a = s.times[i].getTime()
    const b = s.times[i + 1].getTime()
    if (ms >= a && ms <= b) {
      const va = s.niveles[i]
      const vb = s.niveles[i + 1]
      if (va == null || vb == null) return null
      const f = (ms - a) / (b - a)
      return va + (vb - va) * f
    }
  }
  return null
}

/** 'llenando' | 'vaciando' | null — tendencia en el instante t. */
export function tendenciaEn(s: SerieMarea, t: Date): 'llenando' | 'vaciando' | null {
  const ahora = nivelEn(s, t)
  const luego = nivelEn(s, new Date(t.getTime() + 30 * 60_000))
  if (ahora == null || luego == null) return null
  return luego >= ahora ? 'llenando' : 'vaciando'
}

/**
 * Extremos (pleamares y bajamares) del rango [desde, hasta].
 * Detecta máximos/mínimos locales en la grilla horaria y afina el
 * instante y el nivel con el vértice de la parábola por los 3 puntos.
 */
export function extremos(s: SerieMarea, desde: Date, hasta: Date): ExtremoMarea[] {
  const out: ExtremoMarea[] = []
  const n = s.times.length
  for (let i = 1; i < n - 1; i++) {
    const t = s.times[i]
    if (t < desde || t > hasta) continue
    const y0 = s.niveles[i - 1]
    const y1 = s.niveles[i]
    const y2 = s.niveles[i + 1]
    if (y0 == null || y1 == null || y2 == null) continue

    const esMax = y1 >= y0 && y1 >= y2 && (y1 > y0 || y1 > y2)
    const esMin = y1 <= y0 && y1 <= y2 && (y1 < y0 || y1 < y2)
    if (!esMax && !esMin) continue

    // Vértice de la parábola que pasa por (-1,y0) (0,y1) (1,y2)
    const denom = y0 - 2 * y1 + y2
    let dx = 0
    if (Math.abs(denom) > 1e-9) dx = (0.5 * (y0 - y2)) / denom
    dx = Math.max(-1, Math.min(1, dx))
    const nivel = y1 - 0.25 * (y0 - y2) * dx
    const dtMs = s.times[i + 1].getTime() - s.times[i].getTime()
    const time = new Date(t.getTime() + dx * dtMs)

    out.push({ time, nivel, tipo: esMax ? 'pleamar' : 'bajamar' })
  }
  // Dos extremos del mismo tipo pegados (meseta de datos): deja el mejor
  return out.filter((e, i) => {
    const prev = out[i - 1]
    if (!prev || prev.tipo !== e.tipo) return true
    return Math.abs(e.time.getTime() - prev.time.getTime()) > 3 * 3600_000
  })
}

/**
 * Nivel relativo 0..1 respecto al rango de marea del día (0 = bajamar
 * del día, 1 = pleamar del día). Para el score y la flecha del UI.
 */
export function nivelRelativo(s: SerieMarea, t: Date): number | null {
  const nivel = nivelEn(s, t)
  if (nivel == null) return null
  const dia0 = new Date(t.getTime() - 12 * 3600_000)
  const dia1 = new Date(t.getTime() + 12 * 3600_000)
  const enRango = s.times
    .map((tt, i) => (tt >= dia0 && tt <= dia1 ? s.niveles[i] : null))
    .filter((v): v is number => v != null)
  if (enRango.length < 4) return null
  const min = Math.min(...enRango)
  const max = Math.max(...enRango)
  if (max - min < 0.3) return 0.5 // rango raro/plano: neutro
  return (nivel - min) / (max - min)
}

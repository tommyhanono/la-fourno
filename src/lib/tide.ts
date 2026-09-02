// Marea a partir de sea_level_height_msl (horario). SIEMPRE es un
// ESTIMADO de modelo (CMEMS vía Open-Meteo) — el UI lo marca así.
// Los extremos se afinan con interpolación parabólica entre las tres
// horas alrededor de cada pico: con datos horarios el instante del pico
// cae entre muestras, y el vértice de la parábola lo recupera.
//
// QUÉ SE VERIFICÓ, Y HASTA DÓNDE
// Hay dos comprobaciones, y conviene no confundirlas.
//
// 1) Contraste externo (9-ago-2026): contra la tabla armónica de Balboa
//    de tide-forecast.com — fuente COMERCIAL, no oficial. Rango del
//    ciclo 3.23 m modelo vs 3.18 m tabla, y desfase de ~30 min en dos
//    extremos (bajamar 5:25 vs 6:01 am, pleamar 11:45 vs 12:17 pm).
//    Son DOS extremos de UN día: alcanza para descartar que el modelo
//    esté groseramente corrido, no para hablar de "error típico".
//
// 2) Consistencia física de la serie (31-ago-2026, Contadora, 8 días):
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
import { CALIBRACION } from '../config/calibracion'
import { CORRE_FUERTE_FRAC } from '../config/pasos'

export interface SerieMarea {
  times: Date[]
  niveles: (number | null)[]
}

/**
 * Arma la serie corrigiendo el adelanto del modelo.
 *
 * CMEMS entrega la marea adelantada ~27 min en Panamá (medido contra la
 * tabla oficial de NOAA, n=356; ver `calibracion.marea.desfaseModeloMin`).
 * La corrección se aplica UNA vez acá, sobre los tiempos, para que todo
 * lo que cuelga de la serie —nivel actual, tendencia, extremos, nivel
 * relativo— quede corrido igual. Si se corrigiera solo en `extremos`,
 * la curva del UI y las horas de pleamar se contradirían.
 */
export function serieMarea(timesIso: string[], niveles: (number | null)[]): SerieMarea {
  const desfaseMs = CALIBRACION.marea.desfaseModeloMin * 60_000
  return {
    times: timesIso.map((t) => new Date(parsePanama(t).getTime() + desfaseMs)),
    niveles,
  }
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

/**
 * Horas en que la marea corre MÁS FUERTE dentro de una franja.
 *
 * El flujo que atraviesa un canal es proporcional a qué tan rápido sube
 * o baja el nivel, no a qué tan alto está: corre más a media marea que
 * en pleamar. Esto devuelve los tramos donde esa velocidad de cambio
 * pasa de `CORRE_FUERTE_FRAC` del máximo del día.
 *
 * Sirve para lo único honesto que la app puede decir de los pasos entre
 * islas: CUÁNDO va a estar corriendo. La velocidad de la corriente ahí
 * no la sabe nadie —el modelo no resuelve los canales— así que no se
 * inventa. Ver src/config/pasos.ts.
 */
export function tramosDeCorriente(
  s: SerieMarea,
  desde: Date,
  hasta: Date,
): { desde: Date; hasta: Date }[] {
  // Velocidad de cambio por hora, en el día entero, para saber cuál es
  // el máximo con el que comparar.
  const tasas: { t: Date; v: number }[] = []
  for (let i = 1; i < s.times.length; i++) {
    const a = s.niveles[i - 1]
    const b = s.niveles[i]
    if (a == null || b == null) continue
    const horas = (s.times[i].getTime() - s.times[i - 1].getTime()) / 3600_000
    if (horas <= 0) continue
    tasas.push({ t: s.times[i], v: Math.abs(b - a) / horas })
  }
  if (tasas.length === 0) return []
  const enDia = tasas.filter(
    (x) =>
      x.t.getTime() >= desde.getTime() - 12 * 3600_000 &&
      x.t.getTime() <= hasta.getTime() + 12 * 3600_000,
  )
  if (enDia.length === 0) return []
  const maximo = Math.max(...enDia.map((x) => x.v))
  if (maximo <= 0) return []

  const fuertes = tasas.filter(
    (x) =>
      x.t >= desde &&
      x.t <= hasta &&
      x.v >= CORRE_FUERTE_FRAC * maximo,
  )
  // Agrupar horas contiguas.
  const out: { desde: Date; hasta: Date }[] = []
  let ini = 0
  for (let k = 1; k <= fuertes.length; k++) {
    const corta =
      k === fuertes.length ||
      fuertes[k].t.getTime() - fuertes[k - 1].t.getTime() > 3600_000
    if (!corta) continue
    const tramo = fuertes.slice(ini, k)
    if (tramo.length >= 2) {
      out.push({
        desde: new Date(tramo[0].t.getTime() - 3600_000),
        hasta: tramo[tramo.length - 1].t,
      })
    }
    ini = k
  }
  return out
}

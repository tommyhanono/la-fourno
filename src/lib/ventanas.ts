// Arma los bloques de 2 h del corredor Ocean Reef → Las Perlas
// (Contadora como destino de referencia), los puntúa y saca las
// 3 mejores ventanas de la semana. Solo horas de luz.

import { PUNTOS, PUNTO_SALIDA, PUNTO_DESTINO, type Punto } from '../config/puntos'
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
  horas: number,
  fs: PuntoForecast[],
  ms: (PuntoMarine | null)[],
  destino: Punto,
  mareaDestino: SerieMarea | null,
  llegada: Date,
): EntradaBloque {
  // Peor caso entre salida y destino: el corredor se navega entero.
  const pares: { f: PuntoForecast; m: PuntoMarine | null }[] = [
    { f: fs[idx(PUNTO_SALIDA.id)], m: ms[idx(PUNTO_SALIDA.id)] },
    { f: fs[idx(destino.id)], m: ms[idx(destino.id)] },
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
      // Marea al momento de LLEGADA al destino (fin del bloque de salida).
      const entrada = entradaCorredor(
        inicio,
        CALIBRACION.bloqueHoras,
        datos.forecast,
        datos.marine,
        PUNTO_DESTINO,
        marea,
        fin,
      )
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

export interface RangoDia {
  vientoMin: number | null
  vientoMax: number | null
  olaMin: number | null
  olaMax: number | null
}

export interface DiaJornada {
  dia: Date
  clave: string
  /** Condiciones de toda la jornada (salida → mejor destino). */
  entrada: EntradaBloque
  /** Rango medido del día (mín → máx), que es lo que se muestra. */
  rango: RangoDia
  /** Hora a la que empieza la tormenta dentro de la jornada, si la hay. */
  tormentaDesde: Date | null
  /** Score del día yendo al mejor destino. */
  score: ResultadoScore
  mejorDestino: Punto
  /** Todos los destinos del día, de mejor a peor. */
  destinos: { punto: Punto; score: ResultadoScore }[]
  /** true si todos los destinos quedaron prácticamente iguales. */
  parejo: boolean
  /** Amanece / se pone, del día. */
  sol: { sale: Date; sePone: Date } | null
}

/**
 * Diferencia de score por debajo de la cual los destinos se consideran
 * empatados: el pronóstico no distingue tan fino entre islas vecinas y
 * vender un "ganador" sería ruido.
 */
const UMBRAL_PAREJO = 3

/** Primera hora con tormenta dentro de la jornada, en la salida o el destino. */
function primeraTormenta(f: PuntoForecast, inicio: Date, horas: number): Date | null {
  const codes = CALIBRACION.seguridad.tormentaCodes as readonly number[]
  for (const i of indicesBloque(f.hourly.time, inicio, horas)) {
    const w = f.hourly.weather_code[i]
    if (w != null && codes.includes(w)) return parsePanama(f.hourly.time[i])
  }
  return null
}

/** Mezcla promedio y pico según jornada.pesoPico (0 = medio, 1 = pico). */
function tipico(prom: number | null, pico: number | null): number | null {
  const w = CALIBRACION.jornada.pesoPico
  if (prom == null) return pico
  if (pico == null) return prom
  return prom * (1 - w) + pico * w
}

/**
 * Condiciones de la jornada completa hacia un destino. A diferencia de
 * los bloques de 2 h (peor caso), aquí se resume el DÍA: viento y ola
 * son lo típico ponderado al pico, y la tormenta entra con la fracción
 * de horas que ocupa. Ver calibracion.jornada.
 */
function entradaJornada(
  inicio: Date,
  horas: number,
  fs: PuntoForecast[],
  ms: (PuntoMarine | null)[],
  destino: Punto,
  mareaDestino: SerieMarea | null,
  llegada: Date,
): { entrada: EntradaBloque; rango: RangoDia } {
  const pares: { f: PuntoForecast; m: PuntoMarine | null }[] = [
    { f: fs[idx(PUNTO_SALIDA.id)], m: ms[idx(PUNTO_SALIDA.id)] },
    { f: fs[idx(destino.id)], m: ms[idx(destino.id)] },
  ]

  const vProm: (number | null)[] = []
  const vPico: (number | null)[] = []
  const vPiso: (number | null)[] = []
  const oPiso: (number | null)[] = []
  const rachas: (number | null)[] = []
  const nubes: (number | null)[] = []
  const probs: (number | null)[] = []
  const lluvias: (number | null)[] = []
  const oProm: (number | null)[] = []
  const oPico: (number | null)[] = []
  const periodos: (number | null)[] = []
  const capes: (number | null)[] = []
  const codes: number[] = []
  let horasTormenta = 0
  let horasTotal = 0

  const esTormenta = (w: number | null | undefined) =>
    w != null && (CALIBRACION.seguridad.tormentaCodes as readonly number[]).includes(w)

  for (const { f, m } of pares) {
    const ii = indicesBloque(f.hourly.time, inicio, horas)
    vProm.push(meanNum(ii.map((i) => f.hourly.wind_speed_10m[i])))
    vPico.push(maxNum(ii.map((i) => f.hourly.wind_speed_10m[i])))
    vPiso.push(minNum(ii.map((i) => f.hourly.wind_speed_10m[i])))
    rachas.push(maxNum(ii.map((i) => f.hourly.wind_gusts_10m[i])))
    nubes.push(meanNum(ii.map((i) => f.hourly.cloud_cover[i])))
    probs.push(meanNum(ii.map((i) => f.hourly.precipitation_probability[i])))
    lluvias.push(
      tipico(
        meanNum(ii.map((i) => f.hourly.precipitation[i])),
        maxNum(ii.map((i) => f.hourly.precipitation[i])),
      ),
    )
    capes.push(
      tipico(
        meanNum(ii.map((i) => f.hourly.cape[i])),
        maxNum(ii.map((i) => f.hourly.cape[i])),
      ),
    )
    // Las horas de tormenta se cuentan una sola vez: el peor de los dos
    // extremos del corredor manda.
    let tormentaAqui = 0
    for (const i of ii) {
      const w = f.hourly.weather_code[i]
      if (w != null) codes.push(w)
      if (esTormenta(w)) tormentaAqui++
    }
    horasTormenta = Math.max(horasTormenta, tormentaAqui)
    horasTotal = Math.max(horasTotal, ii.length)
    if (m) {
      const im = indicesBloque(m.hourly.time, inicio, horas)
      oProm.push(meanNum(im.map((i) => m.hourly.wave_height[i])))
      oPico.push(maxNum(im.map((i) => m.hourly.wave_height[i])))
      oPiso.push(minNum(im.map((i) => m.hourly.wave_height[i])))
      periodos.push(minNum(im.map((i) => m.hourly.wave_period[i])))
    }
  }

  const vientoPico = maxNum(vPico)
  const olaPico = maxNum(oPico)
  return {
    // Rango REAL del día (mínimo → máximo). El score usa su propio
    // número ponderado, pero al capitán se le muestra el rango medido:
    // un promedio ponderado no es un dato que exista en el pronóstico.
    rango: {
      vientoMin: minNum(vPiso),
      vientoMax: vientoPico,
      olaMin: minNum(oPiso),
      olaMax: olaPico,
    },
    entrada: {
      vientoKt: tipico(maxNum(vProm), vientoPico),
      rachaKt: maxNum(rachas),
      nubosidadPct: meanNum(nubes),
      probLluviaPct: maxNum(probs),
      lluviaMmH: maxNum(lluvias),
      olaM: tipico(maxNum(oProm), olaPico),
      periodoS: minNum(periodos),
      weatherCodes: codes,
      tormentaFrac: horasTotal > 0 ? horasTormenta / horasTotal : 0,
      capeJkg: maxNum(capes),
      mareaRel: mareaDestino ? nivelRelativo(mareaDestino, llegada) : null,
      mareaTendencia: mareaDestino ? tendenciaEn(mareaDestino, llegada) : null,
    },
  }
}

/**
 * El día completo, día por día — sin bloques de horas. Cada día se
 * evalúa sobre la jornada típica (calibracion.jornada, 9 am – 4 pm)
 * contra CADA destino de navegación, y gana el de mejor score: ese es
 * "el mejor destino según el clima de ese día". Empates los decide el
 * orden de puntos.ts.
 */
export function jornadasSemana(datos: DatosApp): DiaJornada[] {
  const f0 = datos.forecast[idx(PUNTO_SALIDA.id)]
  if (!f0) return []
  const { desdeHora, hastaHora, llegadaHoras } = CALIBRACION.jornada
  const destinos = PUNTOS.filter(
    (p) => p.tipo === 'nav' && !p.esSalida && !p.soloReferencia,
  )
  if (destinos.length === 0) return []

  // Serie de marea por destino, una sola vez.
  const mareas = new Map<string, SerieMarea | null>()
  for (const p of destinos) {
    const m = datos.marine[idx(p.id)]
    mareas.set(
      p.id,
      m ? serieMarea(m.hourly.time, m.hourly.sea_level_height_msl) : null,
    )
  }

  const ahora = new Date()
  const out: DiaJornada[] = []
  for (let d = 0; d < f0.daily.time.length; d++) {
    const base = parsePanama(`${f0.daily.time[d]}T00:00`)
    const inicio = new Date(base.getTime() + desdeHora * 3600_000)
    const fin = new Date(base.getTime() + hastaHora * 3600_000)
    if (fin <= ahora) continue // jornada de hoy ya terminada
    const llegada = new Date(inicio.getTime() + llegadaHoras * 3600_000)

    const scored = destinos
      .map((p) => {
        const { entrada, rango } = entradaJornada(
          inicio,
          hastaHora - desdeHora,
          datos.forecast,
          datos.marine,
          p,
          mareas.get(p.id) ?? null,
          llegada,
        )
        return { punto: p, entrada, rango, score: scoreBloque(entrada) }
      })
      .sort((a, b) => b.score.total - a.score.total)
    const mejor = scored[0]
    const dispersion = mejor.score.total - scored[scored.length - 1].score.total
    out.push({
      dia: base,
      clave: f0.daily.time[d],
      entrada: mejor.entrada,
      rango: mejor.rango,
      tormentaDesde: primeraTormenta(f0, inicio, hastaHora - desdeHora),
      score: mejor.score,
      mejorDestino: mejor.punto,
      destinos: scored.map(({ punto, score }) => ({ punto, score })),
      parejo: dispersion <= UMBRAL_PAREJO,
      sol: {
        sale: parsePanama(f0.daily.sunrise[d]),
        sePone: parsePanama(f0.daily.sunset[d]),
      },
    })
  }
  return out
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

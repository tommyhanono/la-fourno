// El motor de la semana. Una sola pregunta y una sola respuesta:
// para cada día del pronóstico, cómo está el corredor
// Marina Ocean Reef → Las Perlas durante la JORNADA de Tommy
// (9 am – 4 pm), y a qué destino conviene ir ese día.
//
// Deliberadamente NO hay bloques de horas hacia afuera: la app
// responde por días. Lo más fino que sale al UI es la forma del día
// (si conviene temprano o por la tarde), sin puntajes por franja.

import { PUNTOS, PUNTO_SALIDA, type Punto } from '../config/puntos'
import { CALIBRACION } from '../config/calibracion'
import type { DatosApp, PuntoForecast, PuntoMarine } from './types'
import { MODELOS } from './api'
import {
  scoreBloque,
  scorePlaya,
  puntosViento,
  puntosSol,
  type EntradaBloque,
  type ResultadoScore,
} from './score'
import { serieMarea, nivelRelativo, tendenciaEn, type SerieMarea } from './tide'
import { parsePanama, claveDia } from './time'

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

/** Índices horarios [inicio, inicio + horas) de una serie. */
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

/**
 * El corredor hora por hora: para cada hora de la franja, el PEOR de
 * los dos extremos (salida y destino), porque el corredor se navega
 * entero. Devuelve una serie de valores que sí existieron a la vez.
 *
 * Antes se sacaba el mínimo de un punto y el máximo del otro, así que
 * un rango como "2–9 kt" podía no darse en ningún punto real.
 */
function serieCorredor(
  puntos: { times: string[]; valores: (number | null)[] }[],
  inicio: Date,
  horas: number,
): number[] {
  const porHora = new Map<string, number>()
  for (const { times, valores } of puntos) {
    for (const i of indicesBloque(times, inicio, horas)) {
      const v = valores[i]
      if (v == null || Number.isNaN(v)) continue
      const clave = times[i]
      const previo = porHora.get(clave)
      porHora.set(clave, previo == null ? v : Math.max(previo, v))
    }
  }
  return [...porHora.values()]
}

export interface RangoDia {
  vientoMin: number | null
  vientoMax: number | null
  olaMin: number | null
  olaMax: number | null
}

/** Cómo se reparte el día: ¿conviene temprano, tarde, o da igual? */
export type FormaDia = 'temprano' | 'tarde' | 'parejo'

export interface DiaJornada {
  dia: Date
  clave: string
  /** Condiciones de toda la jornada (salida → mejor destino). */
  entrada: EntradaBloque
  /** Rango medido del corredor durante la jornada (mín → máx). */
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
  /** Si el día está mejor temprano, por la tarde, o parejo. */
  forma: FormaDia
  /**
   * true si la jornada ya arrancó (es hoy y pasaron las 9 am). Con el
   * día empezado, `forma` deja de ser un consejo: decir "está mejor
   * temprano" a las 2 pm es hablar de una mañana que ya pasó. El UI la
   * calla en ese caso. La jornada ya TERMINADA no llega hasta acá:
   * esos días se descartan al armar la semana.
   */
  enCurso: boolean
  /**
   * Cuánto se contradicen los modelos sobre este día, en puntos del
   * score de viento + sol (de 75). null si no se pudo medir (falló la
   * request extra o no hay dos modelos con datos). Por encima de
   * `calibracion.desacuerdoModelosPts` el UI avisa que el día no está
   * firme todavía.
   */
  desacuerdo: number | null
  /**
   * Días de anticipación: 0 = hoy, 1 = mañana. Se usa para saber si el
   * pronóstico de ese día todavía le gana al promedio de la temporada
   * (ver `calibracion.skillHorizonteDias`).
   */
  anticipacionDias: number
  /**
   * true si a esa distancia el pronóstico ya no supera medidamente a la
   * climatología. El día se muestra igual; solo deja de venderse como
   * más preciso de lo que se pudo comprobar.
   */
  fueraDeSkill: boolean
  /** Amanece / se pone, del día. */
  sol: { sale: Date; sePone: Date } | null
}

/**
 * Diferencia de score por debajo de la cual los destinos se consideran
 * empatados: el pronóstico no distingue tan fino entre islas vecinas y
 * vender un "ganador" sería ruido.
 */
const UMBRAL_PAREJO = 3

/**
 * Diferencia entre la mañana y la tarde por debajo de la cual el día
 * se declara parejo. Más chico que esto es ruido del modelo, no una
 * razón para cambiar la hora de salida.
 */
const UMBRAL_FORMA = 6

/**
 * Cuánto se contradicen los modelos globales sobre un día, medido en
 * PUNTOS DEL SCORE (0..75 = viento 45 + sol 30), no en unidades físicas.
 *
 * Por qué en puntos y no en nudos o en %: las curvas no son rectas. Un
 * desacuerdo de 3 kt cuando todos rondan los 5 kt no cambia nada — el
 * día es bueno igual. Los mismos 3 kt alrededor de 13 kt mueven el
 * score de "se anda bien" a "incómodo". Lo que importa no es que los
 * modelos difieran, sino que difieran lo suficiente para cambiar la
 * respuesta.
 *
 * Suma viento Y sol. Medido el 1-sep-2026, los modelos se contradicen
 * MÁS en las nubes que en el viento (mediana 10.5 de 30 contra ~5 de
 * 45): mirar solo el viento dejaba fuera la mayor fuente de duda, justo
 * en el segundo criterio de Tommy.
 *
 * Devuelve null si no hay al menos dos modelos con datos (pasa en el
 * último día: ICON llega más corto que ECMWF).
 */
function desacuerdoModelos(
  datos: DatosApp,
  inicio: Date,
  horas: number,
  destino: Punto,
): number | null {
  const ms = datos.modelos
  if (!ms) return null
  const iSalida = idx(PUNTO_SALIDA.id)
  const iDestino = idx(destino.id)
  const puntos = [ms[iSalida], ms[iDestino]].filter(Boolean)
  if (puntos.length === 0) return null

  /** Serie del corredor para una variable de un modelo. */
  const serie = (clave: string, peor: 'max' | 'media') => {
    const porHora = new Map<string, number[]>()
    for (const p of puntos) {
      const times = p.hourly.time as string[]
      const vals = (p.hourly[clave] ?? []) as (number | null)[]
      for (const i of indicesBloque(times, inicio, horas)) {
        const v = vals[i]
        if (v == null || Number.isNaN(v)) continue
        const arr = porHora.get(times[i]) ?? []
        arr.push(v)
        porHora.set(times[i], arr)
      }
    }
    // Viento: el peor punto del corredor. Nubes: el promedio, igual que
    // hace entradaFranja, porque el cielo no se "sufre" por el peor.
    return [...porHora.values()].map((xs) =>
      peor === 'max' ? Math.max(...xs) : xs.reduce((a, b) => a + b, 0) / xs.length,
    )
  }

  const porModelo: number[] = []
  for (const modelo of MODELOS) {
    const v = serie(`wind_speed_10m_${modelo}`, 'max')
    const n = serie(`cloud_cover_${modelo}`, 'media')
    if (v.length === 0 && n.length === 0) continue
    // Mismo resumen que usa el score de verdad.
    const vTip = v.length > 0 ? tipico(meanNum(v), maxNum(v)) : null
    const nMed = n.length > 0 ? meanNum(n) : null
    let pts = 0
    if (vTip != null) pts += puntosViento(vTip)
    if (nMed != null) pts += puntosSol(nMed)
    porModelo.push(pts)
  }
  if (porModelo.length < 2) return null
  return Math.max(...porModelo) - Math.min(...porModelo)
}

/**
 * Hasta qué día de anticipación el pronóstico todavía le gana al
 * promedio de la época. Depende del MES: en seca los nortes se
 * pronostican bien hasta el día 7; en lluviosa, la convección local
 * deja de distinguirse del promedio a partir del día 6. Los números y
 * su medición están en `calibracion.skillHorizonteDias`.
 */
export function horizonteDeSkill(dia: Date): number {
  const mes = Number(claveDia(dia).slice(5, 7))
  const seco = (CALIBRACION.mesesSecos as readonly number[]).includes(mes)
  return seco
    ? CALIBRACION.skillHorizonteDias.seca
    : CALIBRACION.skillHorizonteDias.lluviosa
}

/** Primera hora con tormenta dentro de la jornada. */
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
 * Condiciones del corredor durante una franja, hacia un destino.
 * Viento y ola se resumen como "lo típico ponderado al pico"
 * (calibracion.jornada.pesoPico) y la tormenta entra con la fracción
 * de horas que ocupa, para que un chubasco de una hora no mate el día.
 */
function entradaFranja(
  inicio: Date,
  horas: number,
  fs: PuntoForecast[],
  ms: (PuntoMarine | null)[],
  destino: Punto,
  mareaDestino: SerieMarea | null,
  llegada: Date,
): { entrada: EntradaBloque; rango: RangoDia } {
  const iSalida = idx(PUNTO_SALIDA.id)
  const iDestino = idx(destino.id)
  const pares: { f: PuntoForecast; m: PuntoMarine | null }[] = [
    { f: fs[iSalida], m: ms[iSalida] },
    { f: fs[iDestino], m: ms[iDestino] },
  ]

  const serieF = (campo: keyof PuntoForecast['hourly']) =>
    serieCorredor(
      pares.map(({ f }) => ({
        times: f.hourly.time,
        valores: f.hourly[campo] as (number | null)[],
      })),
      inicio,
      horas,
    )
  const serieM = (campo: keyof PuntoMarine['hourly']) =>
    serieCorredor(
      pares
        .filter((p): p is { f: PuntoForecast; m: PuntoMarine } => p.m != null)
        .map(({ m }) => ({
          times: m.hourly.time,
          valores: m.hourly[campo] as (number | null)[],
        })),
      inicio,
      horas,
    )

  const vientos = serieF('wind_speed_10m')
  const rachas = serieF('wind_gusts_10m')
  const nubes = serieF('cloud_cover')
  const probs = serieF('precipitation_probability')
  const lluvias = serieF('precipitation')
  const capes = serieF('cape')
  const olas = serieM('wave_height')

  // El período MOLESTO es el corto, así que aquí el peor caso es el
  // mínimo: se toma el mínimo de cada punto y luego el menor de todos.
  const periodos = pares.flatMap(({ m }) =>
    m ? indicesBloque(m.hourly.time, inicio, horas).map((i) => m.hourly.wave_period[i]) : [],
  )

  // Horas de tormenta: el peor de los dos extremos del corredor manda,
  // sin sumarlas dos veces.
  const esTormenta = (w: number | null | undefined) =>
    w != null && (CALIBRACION.seguridad.tormentaCodes as readonly number[]).includes(w)
  let horasTormenta = 0
  let horasTotal = 0
  const codes: number[] = []
  for (const { f } of pares) {
    const ii = indicesBloque(f.hourly.time, inicio, horas)
    let aqui = 0
    for (const i of ii) {
      const w = f.hourly.weather_code[i]
      if (w != null) codes.push(w)
      if (esTormenta(w)) aqui++
    }
    horasTormenta = Math.max(horasTormenta, aqui)
    horasTotal = Math.max(horasTotal, ii.length)
  }

  const vientoPico = maxNum(vientos)
  const olaPico = maxNum(olas)
  return {
    // Rango REAL del corredor: mínimo y máximo de la misma serie
    // hora a hora. El score usa su propio número ponderado, pero al
    // capitán se le muestra lo medido.
    rango: {
      vientoMin: minNum(vientos),
      vientoMax: vientoPico,
      olaMin: minNum(olas),
      olaMax: olaPico,
    },
    entrada: {
      vientoKt: tipico(meanNum(vientos), vientoPico),
      rachaKt: maxNum(rachas),
      nubosidadPct: meanNum(nubes),
      probLluviaPct: maxNum(probs),
      lluviaMmH: tipico(meanNum(lluvias), maxNum(lluvias)),
      olaM: tipico(meanNum(olas), olaPico),
      periodoS: minNum(periodos),
      weatherCodes: codes,
      tormentaFrac: horasTotal > 0 ? horasTormenta / horasTotal : 0,
      capeJkg: tipico(meanNum(capes), maxNum(capes)),
      mareaRel: mareaDestino ? nivelRelativo(mareaDestino, llegada) : null,
      mareaTendencia: mareaDestino ? tendenciaEn(mareaDestino, llegada) : null,
    },
  }
}

/**
 * La semana, día por día. Cada día se evalúa sobre la jornada típica
 * (calibracion.jornada, 9 am – 4 pm) contra CADA destino de
 * navegación, y gana el de mejor score: ese es "el mejor destino
 * según el clima de ese día". Empates los decide el orden de puntos.ts.
 */
export function jornadasSemana(datos: DatosApp): DiaJornada[] {
  const f0 = datos.forecast[idx(PUNTO_SALIDA.id)]
  if (!f0) return []
  const { desdeHora, hastaHora, llegadaHoras } = CALIBRACION.jornada
  const horas = hastaHora - desdeHora
  const destinos = PUNTOS.filter(
    (p) => p.tipo === 'nav' && !p.esSalida && !p.soloReferencia,
  )
  if (destinos.length === 0) return []

  // Serie de marea por destino, una sola vez.
  const mareas = new Map<string, SerieMarea | null>()
  for (const p of destinos) {
    const m = datos.marine[idx(p.id)]
    mareas.set(p.id, m ? serieMarea(m.hourly.time, m.hourly.sea_level_height_msl) : null)
  }

  const ahora = new Date()
  const out: DiaJornada[] = []
  // Medianoche de hoy en Panamá, para medir anticipación en días de
  // calendario. No se usa el índice del arreglo: si los datos vienen del
  // caché (hasta 6 h) el primer día podría ya no ser hoy, y entonces
  // "día 6" se marcaría mal.
  const hoy0 = parsePanama(`${claveDia(ahora)}T00:00`)

  for (let d = 0; d < f0.daily.time.length; d++) {
    const base = parsePanama(`${f0.daily.time[d]}T00:00`)
    const anticipacion = Math.round((base.getTime() - hoy0.getTime()) / 86400_000)
    const inicio = new Date(base.getTime() + desdeHora * 3600_000)
    const fin = new Date(base.getTime() + hastaHora * 3600_000)
    if (fin <= ahora) continue // jornada de hoy ya terminada
    const llegada = new Date(inicio.getTime() + llegadaHoras * 3600_000)

    const scored = destinos
      .map((p) => {
        const { entrada, rango } = entradaFranja(
          inicio,
          horas,
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
      tormentaDesde: primeraTormenta(f0, inicio, horas),
      score: mejor.score,
      mejorDestino: mejor.punto,
      destinos: scored.map(({ punto, score }) => ({ punto, score })),
      parejo: dispersion <= UMBRAL_PAREJO,
      forma: formaDelDia(
        datos,
        inicio,
        horas,
        mejor.punto,
        mareas.get(mejor.punto.id) ?? null,
        llegada,
      ),
      enCurso: inicio <= ahora,
      desacuerdo: desacuerdoModelos(datos, inicio, horas, mejor.punto),
      anticipacionDias: anticipacion,
      fueraDeSkill: anticipacion > horizonteDeSkill(base),
      sol: {
        sale: parsePanama(f0.daily.sunrise[d]),
        sePone: parsePanama(f0.daily.sunset[d]),
      },
    })
  }
  return out
}

/**
 * Mañana contra tarde, con la misma vara que el día entero. No sale
 * como puntaje al UI: solo dice si conviene salir temprano, aguantar
 * para la tarde, o si da igual. Los bloques de horas con su propio
 * número confundían más de lo que ayudaban.
 */
function formaDelDia(
  datos: DatosApp,
  inicio: Date,
  horas: number,
  destino: Punto,
  marea: SerieMarea | null,
  llegada: Date,
): FormaDia {
  const mitad = Math.round(horas / 2)
  if (mitad < 1 || horas - mitad < 1) return 'parejo'
  const trozo = (desde: Date, cuantas: number) =>
    scoreBloque(
      entradaFranja(desde, cuantas, datos.forecast, datos.marine, destino, marea, llegada)
        .entrada,
    ).total
  const manana = trozo(inicio, mitad)
  const tarde = trozo(new Date(inicio.getTime() + mitad * 3600_000), horas - mitad)
  if (Math.abs(manana - tarde) < UMBRAL_FORMA) return 'parejo'
  return manana > tarde ? 'temprano' : 'tarde'
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
  const { desdeHora, hastaHora } = CALIBRACION.jornada
  const out: DiaPlaya[] = []
  for (let d = 0; d < f.daily.time.length; d++) {
    const base = parsePanama(`${f.daily.time[d]}T00:00`)
    // Mismas horas que la jornada de navegación: 9 am – 4 pm.
    const ii = indicesBloque(
      f.hourly.time,
      new Date(base.getTime() + desdeHora * 3600_000),
      hastaHora - desdeHora,
    )
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

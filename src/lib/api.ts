// Fetch a Open-Meteo (forecast + marine), en lote: una sola request
// por API para los 9 puntos (lat/lon separados por coma).
// Sin API key, gratis. Horizonte: hoy + 7 días, horario, hora Panamá.
//
// RESOLUCIÓN REAL (medido 31-ago-2026, ver DECISIONES.md §13)
// Los 9 puntos NO son 9 pronósticos independientes: el modelo tiene
// celdas de ~11 km y varios puntos caen en la misma. Contadora,
// Chapera y Caracoles comparten celda atmosférica; Marina e Islas
// Ocean Reef comparten celda marina. La app muestra 9 puntos porque
// son 9 destinos de Tommy, no porque el modelo los distinga.
//
// CELDA DE MAR, NO DE TIERRA
// Por defecto Open-Meteo prefiere la celda de TIERRA más cercana, y
// sobre tierra el viento sale frenado por la rugosidad del suelo.
// Para una app de mar eso es el dato equivocado. Con cell_selection=sea
// se midió: Las Sirenas máx 8.6 → 11.0 kt, Coronado 6.1 → 8.8 kt,
// Marina 8.8 → 10.2 kt. Siempre hacia MÁS viento, o sea hacia el lado
// seguro. La API marina ya es de mar por definición: no lleva el flag.

import { PUNTOS } from '../config/puntos'
import type { DatosApp, PuntoForecast, PuntoMarine, PuntoModelos } from './types'

const TZ = 'America%2FPanama'
const DIAS = 8 // hoy + 7

const HOURLY_FORECAST = [
  'temperature_2m',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'cloud_cover',
  'precipitation',
  'precipitation_probability',
  'weather_code',
  'uv_index',
  'cape',
].join(',')

// A propósito NO se piden wind_wave_* ni swell_wave_*: se evaluaron el
// 31-ago-2026 y no aportan. wave_period ya es media ponderada por
// energía y baja sola cuando el chop domina. Ver score.ts ('mar-corto').
const HOURLY_MARINE = [
  'wave_height',
  'wave_period',
  'wave_direction',
  'sea_level_height_msl',
].join(',')

function coords(): { lats: string; lons: string } {
  return {
    lats: PUNTOS.map((p) => p.lat).join(','),
    lons: PUNTOS.map((p) => p.lon).join(','),
  }
}

export function urlForecast(): string {
  const { lats, lons } = coords()
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
    `&hourly=${HOURLY_FORECAST}&daily=sunrise,sunset` +
    `&timezone=${TZ}&forecast_days=${DIAS}&wind_speed_unit=kn` +
    `&cell_selection=sea`
  )
}

export function urlMarine(): string {
  const { lats, lons } = coords()
  return (
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}` +
    `&hourly=${HOURLY_MARINE}&timezone=${TZ}&forecast_days=${DIAS}`
  )
}

/** Los tres modelos globales que se comparan entre sí. */
export const MODELOS = ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless'] as const

/**
 * Viento y nubosidad de cada modelo por separado. Sirve para una sola
 * cosa: saber cuánto se contradicen entre ellos.
 *
 * El pronóstico normal (best_match) da un número y punto. Pero el
 * 1-sep-2026 el viento típico de jornada del corredor era 10.2 kt según
 * ECMWF, 10.8 según GFS y 5.8 según ICON: el mismo día vale 34 o 44
 * puntos de viento según a quién le creas. Sin esto la app enseña
 * "68/100" con la misma cara en un día firme que en uno que se mueve.
 *
 * SE PIDE TAMBIÉN LA NUBOSIDAD, y no es un adorno. Al principio era
 * solo viento, por ser el 45 % del score. Fue un error: los modelos se
 * contradicen MÁS en las nubes. Ese mismo día, para el 2-sep —que era
 * justo el que la app recomendaba— ECMWF veía 28 % de nubes, GFS 95 % e
 * ICON 46 %: 21.6 puntos de los 30 que pesa el sol, contra una mediana
 * de ~5 en viento. Y el sol es el segundo criterio de Tommy. El aviso
 * estaba ciego a la mayor fuente de incertidumbre que tenía enfrente.
 *
 * Pesa ~110 KB y la request es opcional: si falla, la app anda igual y
 * simplemente no marca desacuerdo.
 */
export function urlModelos(): string {
  const { lats, lons } = coords()
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
    `&hourly=wind_speed_10m,cloud_cover&timezone=${TZ}&forecast_days=${DIAS}` +
    `&wind_speed_unit=kn&cell_selection=sea&models=${MODELOS.join(',')}`
  )
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

/** Con un solo punto la API devuelve objeto; con varios, array. */
function asArray<T>(x: T | T[]): T[] {
  return Array.isArray(x) ? x : [x]
}

/**
 * Baja todo. Si una de las dos APIs falla, devuelve lo que sí llegó y
 * anota la falla — la app decide qué mostrar. Solo lanza error si no
 * llegó NADA utilizable.
 */
export async function bajarDatos(): Promise<DatosApp> {
  const fallas: string[] = []

  const [rf, rm, rx] = await Promise.allSettled([
    fetchJson<PuntoForecast | PuntoForecast[]>(urlForecast()),
    fetchJson<PuntoMarine | PuntoMarine[]>(urlMarine()),
    fetchJson<PuntoModelos | PuntoModelos[]>(urlModelos()),
  ])

  const forecast = rf.status === 'fulfilled' ? asArray(rf.value) : null
  const marine = rm.status === 'fulfilled' ? asArray(rm.value) : null
  const modelos = rx.status === 'fulfilled' ? asArray(rx.value) : null

  if (rf.status === 'rejected') fallas.push('clima (Open-Meteo forecast)')
  if (rm.status === 'rejected') fallas.push('mar y marea (Open-Meteo marine)')
  // El multimodelo NO se anota como falla visible: es un extra para
  // medir incertidumbre. Sin él la app da el mismo pronóstico, solo
  // deja de avisar cuándo los modelos se contradicen.

  // Sin clima no hay app: el forecast es la columna vertebral.
  if (!forecast || forecast.length !== PUNTOS.length) {
    throw new Error('No llegó el pronóstico de clima')
  }

  return {
    fetchedAt: new Date().toISOString(),
    forecast,
    marine:
      marine && marine.length === PUNTOS.length
        ? marine
        : PUNTOS.map(() => null),
    modelos: modelos && modelos.length === PUNTOS.length ? modelos : null,
    fallas,
  }
}

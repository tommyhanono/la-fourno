// Fetch a Open-Meteo (forecast + marine), en lote: una sola request
// por API para los 9 puntos (lat/lon separados por coma).
// Sin API key, gratis. Horizonte: hoy + 7 días, horario, hora Panamá.

import { PUNTOS } from '../config/puntos'
import type { DatosApp, PuntoForecast, PuntoMarine } from './types'

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
    `&timezone=${TZ}&forecast_days=${DIAS}&wind_speed_unit=kn`
  )
}

export function urlMarine(): string {
  const { lats, lons } = coords()
  return (
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}` +
    `&hourly=${HOURLY_MARINE}&timezone=${TZ}&forecast_days=${DIAS}`
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

  const [rf, rm] = await Promise.allSettled([
    fetchJson<PuntoForecast | PuntoForecast[]>(urlForecast()),
    fetchJson<PuntoMarine | PuntoMarine[]>(urlMarine()),
  ])

  const forecast = rf.status === 'fulfilled' ? asArray(rf.value) : null
  const marine = rm.status === 'fulfilled' ? asArray(rm.value) : null

  if (rf.status === 'rejected') fallas.push('clima (Open-Meteo forecast)')
  if (rm.status === 'rejected') fallas.push('mar y marea (Open-Meteo marine)')

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
    fallas,
  }
}

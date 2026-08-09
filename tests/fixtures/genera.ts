// Genera datos sintéticos con la misma forma que Open-Meteo, para
// tests deterministas (unit y E2E). Semana "buena": mañanas calmas,
// tarde con brisa, un día con tormenta para probar la seguridad.

import { PUNTOS } from '../../src/config/puntos'
import type { PuntoForecast, PuntoMarine, DatosApp } from '../../src/lib/types'

export const DIA_BASE = '2026-08-10' // lunes

/** Día base alternativo (p. ej. "hoy" para E2E). */
let diaBase = DIA_BASE
export function usarDiaBase(iso: string): void {
  diaBase = iso
}

function fechas(dias: number): string[] {
  const out: string[] = []
  const base = new Date(`${diaBase}T00:00:00Z`)
  for (let d = 0; d < dias; d++) {
    out.push(new Date(base.getTime() + d * 86400_000).toISOString().slice(0, 10))
  }
  return out
}

function horasIso(dias: number): string[] {
  const out: string[] = []
  for (const dia of fechas(dias)) {
    for (let h = 0; h < 24; h++) {
      out.push(`${dia}T${String(h).padStart(2, '0')}:00`)
    }
  }
  return out
}

/**
 * Patrón semanal (día 0 = lunes):
 *  - todos los días: 5 kt al amanecer subiendo a 14 kt a las 3 pm
 *  - día 2 (miércoles): tormenta eléctrica al mediodía (código 95)
 *  - día 4 (viernes): viento fuerte todo el día (22-28 kt)
 *  - resto: despejado por la mañana, nubes por la tarde
 */
export function forecastSintetico(): PuntoForecast[] {
  const times = horasIso(8)
  return PUNTOS.map((p) => {
    const n = times.length
    const hourly = {
      time: times,
      temperature_2m: [] as (number | null)[],
      wind_speed_10m: [] as (number | null)[],
      wind_gusts_10m: [] as (number | null)[],
      wind_direction_10m: [] as (number | null)[],
      cloud_cover: [] as (number | null)[],
      precipitation: [] as (number | null)[],
      precipitation_probability: [] as (number | null)[],
      weather_code: [] as (number | null)[],
      uv_index: [] as (number | null)[],
      cape: [] as (number | null)[],
    }
    for (let i = 0; i < n; i++) {
      const dia = Math.floor(i / 24)
      const h = i % 24
      const esViernes = dia === 4
      const tormenta = dia === 2 && h >= 11 && h <= 15
      const viento = esViernes ? 24 : 5 + Math.max(0, (h - 7) * 1.1)
      hourly.temperature_2m.push(26 + (h > 10 && h < 17 ? 4 : 0))
      hourly.wind_speed_10m.push(Math.round(viento * 10) / 10)
      hourly.wind_gusts_10m.push(Math.round(viento * 1.3 * 10) / 10)
      hourly.wind_direction_10m.push(190)
      hourly.cloud_cover.push(tormenta ? 95 : h < 12 ? 12 : 45)
      hourly.precipitation.push(tormenta ? 6 : 0)
      hourly.precipitation_probability.push(tormenta ? 90 : 8)
      hourly.weather_code.push(tormenta ? 95 : h < 12 ? 1 : 2)
      hourly.uv_index.push(h >= 9 && h <= 15 ? 9 : h > 6 && h < 18 ? 4 : 0)
      hourly.cape.push(tormenta ? 3200 : 400)
    }
    return {
      latitude: p.lat,
      longitude: p.lon,
      hourly,
      daily: {
        time: fechas(8),
        sunrise: fechas(8).map((d) => `${d}T06:10`),
        sunset: fechas(8).map((d) => `${d}T18:35`),
      },
    }
  })
}

/** Marea semidiurna 12.42 h con rango ~4 m; ola chica salvo el viernes. */
export function marineSintetico(): PuntoMarine[] {
  const times = horasIso(8)
  return PUNTOS.map((p) => {
    const hourly = {
      time: times,
      wave_height: [] as (number | null)[],
      wave_period: [] as (number | null)[],
      wave_direction: [] as (number | null)[],
      sea_level_height_msl: [] as (number | null)[],
    }
    for (let i = 0; i < times.length; i++) {
      const dia = Math.floor(i / 24)
      hourly.wave_height.push(dia === 4 ? 1.9 : 0.4)
      hourly.wave_period.push(dia === 4 ? 5 : 13)
      hourly.wave_direction.push(200)
      hourly.sea_level_height_msl.push(
        Math.round(2 * Math.cos((2 * Math.PI * i) / 12.42) * 100) / 100,
      )
    }
    return { latitude: p.lat, longitude: p.lon, hourly }
  })
}

export function datosSinteticos(): DatosApp {
  return {
    fetchedAt: new Date(`${diaBase}T12:00:00-05:00`).toISOString(),
    forecast: forecastSintetico(),
    marine: marineSintetico(),
    fallas: [],
  }
}

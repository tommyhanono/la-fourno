// Genera datos sintéticos con la misma forma que Open-Meteo, para
// tests deterministas (unit y E2E). Semana "buena": mañanas calmas,
// tarde con brisa, un día con tormenta para probar la seguridad.

import { PUNTOS } from '../../src/config/puntos'
import type {
  PuntoForecast,
  PuntoMarine,
  PuntoModelos,
  DatosApp,
} from '../../src/lib/types'

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
      shortwave_radiation: [] as (number | null)[],
      terrestrial_radiation: [] as (number | null)[],
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
      const nubes = tormenta ? 95 : h < 12 ? 12 : 45
      hourly.cloud_cover.push(nubes)
      // Radiación: perfil diurno simple con el máximo al mediodía, y la
      // fracción que pasa según las nubes. El índice resultante cae en
      // el rango real medido del corredor (0.13 a 0.72).
      const teorica = h >= 6 && h <= 18 ? Math.round(1350 * Math.sin((Math.PI * (h - 6)) / 12)) : 0
      hourly.terrestrial_radiation.push(teorica)
      hourly.shortwave_radiation.push(Math.round(teorica * (0.72 - 0.005 * nubes)))
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
      ocean_current_velocity: [] as (number | null)[],
      ocean_current_direction: [] as (number | null)[],
    }
    for (let i = 0; i < times.length; i++) {
      const dia = Math.floor(i / 24)
      hourly.wave_height.push(dia === 4 ? 1.9 : 0.4)
      hourly.wave_period.push(dia === 4 ? 5 : 13)
      hourly.wave_direction.push(200)
      hourly.sea_level_height_msl.push(
        Math.round(2 * Math.cos((2 * Math.PI * i) / 12.42) * 100) / 100,
      )
      // Corriente. Ojo con la convención, que es donde se equivoca todo
      // el mundo: el viento del fixture viene DE 190°, o sea que sopla
      // HACIA 10°. Para que vayan en contra, la corriente tiene que ir
      // hacia ~190°; si va hacia 10° van juntos.
      //   · JUEVES (día 3): corriente fuerte hacia 190° → EN CONTRA.
      //   · resto: corriente floja hacia 10° → a favor, no se marca.
      hourly.ocean_current_velocity.push(dia === 3 ? 2.2 : 0.6)
      hourly.ocean_current_direction.push(dia === 3 ? 190 : 10)
    }
    return { latitude: p.lat, longitude: p.lon, hourly }
  })
}

/**
 * Viento por modelo, con la forma que devuelve Open-Meteo cuando se
 * piden varios `models` (clave con el modelo pegado al nombre).
 *
 * Los tres coinciden con el pronóstico principal salvo el MARTES (día
 * 1), donde se apartan a propósito en los DOS ejes: ICON ve menos
 * viento y GFS ve el cielo cerrado. Así hay un día con desacuerdo real
 * y otros sin él, y el test puede distinguirlos.
 * El último día ICON llega null, que es lo que hace de verdad.
 */
export function modelosSinteticos(): PuntoModelos[] {
  const times = horasIso(8)
  return PUNTOS.map((p) => {
    const propio = forecastSintetico().find(
      (f) => f.latitude === p.lat && f.longitude === p.lon,
    )!.hourly
    const base = propio.wind_speed_10m
    const nubes = propio.cloud_cover
    const hourly: Record<string, string[] | (number | null)[]> = { time: times }
    for (const modelo of ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless']) {
      hourly[`wind_speed_10m_${modelo}`] = times.map((_, i) => {
        const dia = Math.floor(i / 24)
        if (dia === 7 && modelo === 'icon_seamless') return null
        const v = base[i]
        if (v == null) return null
        // ICON ve el martes mucho más calmado que los otros dos.
        if (dia === 1 && modelo === 'icon_seamless') return v * 0.45
        return v
      })
      // Las nubes también se comparan: medido en vivo, es donde los
      // modelos MÁS se contradicen. El MARTES, además del viento, GFS
      // ve el cielo cerrado. Los dos ejes juntos en el mismo día es lo
      // realista —cuando un modelo se va, se va en todo— y es lo que
      // hace que ese día cruce el umbral combinado.
      hourly[`cloud_cover_${modelo}`] = times.map((_, i) => {
        const dia = Math.floor(i / 24)
        if (dia === 7 && modelo === 'icon_seamless') return null
        const v = nubes[i]
        if (v == null) return null
        if (dia === 1 && modelo === 'gfs_seamless') return 95
        return v
      })
    }
    return { latitude: p.lat, longitude: p.lon, hourly: hourly as PuntoModelos['hourly'] }
  })
}

export function datosSinteticos(): DatosApp {
  return {
    fetchedAt: new Date(`${diaBase}T12:00:00-05:00`).toISOString(),
    forecast: forecastSintetico(),
    marine: marineSintetico(),
    modelos: modelosSinteticos(),
    fallas: [],
  }
}

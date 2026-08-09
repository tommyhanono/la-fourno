// Tipos del motor de datos. Unidades internas fijas:
// viento kt · ola m · temperatura °C · lluvia mm · marea m (sobre MSL).

export interface HorarioForecast {
  time: string[]
  temperature_2m: (number | null)[]
  wind_speed_10m: (number | null)[]
  wind_gusts_10m: (number | null)[]
  wind_direction_10m: (number | null)[]
  cloud_cover: (number | null)[]
  precipitation: (number | null)[]
  precipitation_probability: (number | null)[]
  weather_code: (number | null)[]
  uv_index: (number | null)[]
  cape: (number | null)[]
}

export interface DiarioForecast {
  time: string[]
  sunrise: string[]
  sunset: string[]
}

export interface PuntoForecast {
  latitude: number
  longitude: number
  hourly: HorarioForecast
  daily: DiarioForecast
}

export interface HorarioMarine {
  time: string[]
  wave_height: (number | null)[]
  wave_period: (number | null)[]
  wave_direction: (number | null)[]
  sea_level_height_msl: (number | null)[]
}

export interface PuntoMarine {
  latitude: number
  longitude: number
  hourly: HorarioMarine
}

/** Todo lo que la app necesita, ya bajado. Indexado igual que PUNTOS. */
export interface DatosApp {
  /** ISO con offset de Panamá del momento del fetch */
  fetchedAt: string
  forecast: PuntoForecast[]
  marine: (PuntoMarine | null)[]
  /** APIs que fallaron en el último intento (para avisar sin romper) */
  fallas: string[]
}

export interface ExtremoMarea {
  time: Date
  nivel: number
  tipo: 'pleamar' | 'bajamar'
}

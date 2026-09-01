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
  /** Mar total (swell + chop combinados). */
  wave_height: (number | null)[]
  /**
   * Período medio del mar total, ponderado por energía. Baja solo
   * cuando el chop del viento domina, así que sirve para juzgar el
   * picado sin pedir el desglose wind_wave/swell (probado y descartado:
   * ver score.ts, contribución 'mar-corto').
   */
  wave_period: (number | null)[]
  wave_direction: (number | null)[]
  sea_level_height_msl: (number | null)[]
  /** Corriente: velocidad en km/h y rumbo HACIA donde va, en grados. */
  ocean_current_velocity: (number | null)[]
  ocean_current_direction: (number | null)[]
}

export interface PuntoMarine {
  latitude: number
  longitude: number
  hourly: HorarioMarine
}

/**
 * Viento de cada modelo global por separado. Las claves llegan con el
 * modelo pegado al nombre: `wind_speed_10m_ecmwf_ifs025`, etc. Se usa
 * solo para medir cuánto se contradicen entre ellos, nunca para
 * pronosticar: para eso manda best_match, que es `forecast`.
 */
export interface HorarioModelos {
  time: string[]
  [clave: string]: string[] | (number | null)[]
}

export interface PuntoModelos {
  latitude: number
  longitude: number
  hourly: HorarioModelos
}

/** Todo lo que la app necesita, ya bajado. Indexado igual que PUNTOS. */
export interface DatosApp {
  /** ISO con offset de Panamá del momento del fetch */
  fetchedAt: string
  forecast: PuntoForecast[]
  marine: (PuntoMarine | null)[]
  /**
   * Viento por modelo, para medir incertidumbre. null si esa request
   * falló: es un extra, la app funciona igual sin él.
   */
  modelos: PuntoModelos[] | null
  /** APIs que fallaron en el último intento (para avisar sin romper) */
  fallas: string[]
}

export interface ExtremoMarea {
  time: Date
  nivel: number
  tipo: 'pleamar' | 'bajamar'
}

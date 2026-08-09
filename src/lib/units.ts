// Unidades de presentación. Internamente todo vive en kt / m / °C;
// aquí se convierte solo al mostrar. Preferencias en localStorage.

export interface Unidades {
  viento: 'kt' | 'kmh'
  ola: 'ft' | 'm'
  temp: 'c' | 'f'
}

export const UNIDADES_DEFAULT: Unidades = { viento: 'kt', ola: 'ft', temp: 'c' }

const KEY = 'lafourno:unidades:v1'

export function cargarUnidades(): Unidades {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...UNIDADES_DEFAULT }
    return { ...UNIDADES_DEFAULT, ...JSON.parse(raw) }
  } catch {
    return { ...UNIDADES_DEFAULT }
  }
}

export function guardarUnidades(u: Unidades): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(u))
  } catch {
    // localStorage lleno o bloqueado: la preferencia vive solo en memoria
  }
}

export const M_A_FT = 3.28084
export const KT_A_KMH = 1.852

export function fmtViento(kt: number | null | undefined, u: Unidades): string {
  if (kt == null || Number.isNaN(kt)) return '—'
  return u.viento === 'kt' ? `${Math.round(kt)} kt` : `${Math.round(kt * KT_A_KMH)} km/h`
}

export function fmtOla(m: number | null | undefined, u: Unidades): string {
  if (m == null || Number.isNaN(m)) return '—'
  return u.ola === 'ft' ? `${(m * M_A_FT).toFixed(1)} ft` : `${m.toFixed(1)} m`
}

export function fmtTemp(c: number | null | undefined, u: Unidades): string {
  if (c == null || Number.isNaN(c)) return '—'
  return u.temp === 'c' ? `${Math.round(c)} °C` : `${Math.round(c * 9 / 5 + 32)} °F`
}

/** La marea siempre en metros: es como se leen las tablas en Panamá. */
export function fmtMarea(m: number | null | undefined): string {
  if (m == null || Number.isNaN(m)) return '—'
  return `${m.toFixed(1)} m`
}

const RUMBOS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO']

export function rumbo(grados: number | null | undefined): string {
  if (grados == null || Number.isNaN(grados)) return '—'
  return RUMBOS[Math.round((((grados % 360) + 360) % 360) / 22.5) % 16]
}

// Caché en localStorage con expiración. Regla: nunca martillar las
// APIs (fresco < 30 min no se re-baja), nunca disfrazar dato viejo de
// fresco (fetchedAt siempre visible en el UI) y nunca pantalla rota
// (si el fetch falla se sirve lo último que hubo, avisando).

import type { DatosApp } from './types'
import { bajarDatos } from './api'

const KEY = 'lafourno:datos:v2'

/** Fresco: no se refetchea. */
export const TTL_FRESCO_MS = 30 * 60_000
/** Viejo de verdad: se muestra pero con aviso fuerte. */
export const TTL_VIEJO_MS = 6 * 3600_000

export function leerCache(): DatosApp | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as DatosApp
    if (!d?.fetchedAt || !Array.isArray(d.forecast)) return null
    return d
  } catch {
    return null
  }
}

function escribirCache(d: DatosApp): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    // sin espacio: la app sigue con datos en memoria
  }
}

export function edadMs(d: DatosApp): number {
  return Date.now() - new Date(d.fetchedAt).getTime()
}

export interface EstadoDatos {
  datos: DatosApp | null
  /** hubo error en el último intento de refresco */
  error: string | null
  cargando: boolean
}

/**
 * Estrategia: devuelve el caché al instante; si está vencido (o no
 * existe) baja datos frescos en background y avisa por callback.
 */
export async function refrescar(force = false): Promise<DatosApp> {
  const cached = leerCache()
  if (!force && cached && edadMs(cached) < TTL_FRESCO_MS && cached.fallas.length === 0) {
    return cached
  }
  const frescos = await bajarDatos()
  escribirCache(frescos)
  return frescos
}

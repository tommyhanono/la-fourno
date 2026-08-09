// Hooks de estado: datos con caché + refresco en background,
// unidades persistidas, y router por hash (sin dependencias).

import { useCallback, useEffect, useState } from 'react'
import type { DatosApp } from '../lib/types'
import { leerCache, refrescar, TTL_FRESCO_MS } from '../lib/cache'
import {
  cargarUnidades,
  guardarUnidades,
  type Unidades,
} from '../lib/units'

export interface EstadoDatos {
  datos: DatosApp | null
  cargando: boolean
  /** el último intento de red falló (se muestra lo que hay en caché) */
  errorRed: boolean
  recargar: () => void
}

export function useDatos(): EstadoDatos {
  const [datos, setDatos] = useState<DatosApp | null>(() => leerCache())
  const [cargando, setCargando] = useState(false)
  const [errorRed, setErrorRed] = useState(false)

  const recargar = useCallback(() => {
    setCargando(true)
    refrescar(true)
      .then((d) => {
        setDatos(d)
        setErrorRed(false)
      })
      .catch(() => setErrorRed(true))
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => {
    let vivo = true
    const cached = leerCache()
    const vencido =
      !cached || Date.now() - new Date(cached.fetchedAt).getTime() > TTL_FRESCO_MS
    if (vencido || cached?.fallas.length) {
      setCargando(true)
      refrescar()
        .then((d) => {
          if (!vivo) return
          setDatos(d)
          setErrorRed(false)
        })
        .catch(() => vivo && setErrorRed(true))
        .finally(() => vivo && setCargando(false))
    }
    // Refresco en background cada 15 min mientras la app está abierta
    // (refrescar() respeta el TTL: no martilla la API).
    const timer = setInterval(() => {
      refrescar()
        .then((d) => {
          if (!vivo) return
          setDatos(d)
          setErrorRed(false)
        })
        .catch(() => vivo && setErrorRed(true))
    }, 15 * 60_000)
    return () => {
      vivo = false
      clearInterval(timer)
    }
  }, [])

  return { datos, cargando, errorRed, recargar }
}

export function useUnidades(): [Unidades, (u: Partial<Unidades>) => void] {
  const [u, setU] = useState<Unidades>(() => cargarUnidades())
  const set = useCallback((patch: Partial<Unidades>) => {
    setU((prev) => {
      const next = { ...prev, ...patch }
      guardarUnidades(next)
      return next
    })
  }, [])
  return [u, set]
}

/** Router mínimo por hash: '#/', '#/punto/<id>', '#/ajustes'. */
export function useRuta(): string {
  const [ruta, setRuta] = useState(() => window.location.hash || '#/')
  useEffect(() => {
    const fn = () => setRuta(window.location.hash || '#/')
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])
  return ruta
}

export function irA(hash: string): void {
  window.location.hash = hash
}

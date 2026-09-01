// Tipos de scripts/backtest.mjs, para que el test de deriva pueda
// importarlo y comparar sus curvas con las de la app.
//
// El script es .mjs a propósito: corre con `node` sin build, que es lo
// que lo hace usable como herramienta de medición suelta. Esta
// declaración le da tipos al único consumidor que tiene desde el lado
// tipado (tests/unit/incertidumbre.test.ts).

export type Curva = [number, number][]

export const UBICACIONES: {
  id: string
  nombre: string
  lat: number
  lon: number
  tipo: string
}[]
export const LEADS: number[]
export const CURVAS: { viento: Curva; sol: Curva; ola: Curva }
export const PESOS: { viento: number; sol: number; ola: number; marea: number }
export const RACHA: { deltaKt: number; penal: number }
export const PESO_PICO: number
export function interp(curva: Curva, x: number): number
export function scoreParcial(e: {
  viento: number | null
  racha: number | null
  nubes: number | null
  ola: number | null
}): number

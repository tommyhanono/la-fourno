// Cuánto se puede equivocar el score de un día, en puntos.
//
// Antes la app trataba todos los días con la misma cara y solo marcaba
// los lejanos con una regla de "hasta acá le gana a la climatología".
// Eso decía SI el pronóstico sirve, no CUÁNTO se equivoca. Esto es lo
// segundo, y sale de medirlo: `npm run backtest` compara, sobre 90 días
// reales y las cuatro ubicaciones clave, lo que el modelo predecía a N
// días contra lo que después resultó, y calcula el score con cada uno.
//
// El número NO está escrito a mano acá: se lee del artefacto que deja
// el backtest, así que no puede desincronizarse de la medición.

import backtest from '../config/backtest.json'

interface Banda {
  maePts: number
  p90Pts: number
  dias: number
}

const BANDA = backtest.bandaPts as unknown as Record<string, Banda>

/** Cuándo se midió, para poder decirlo en el UI sin inventar. */
export const BACKTEST_INFO = {
  generado: backtest._generado as string,
  ventanaDias: backtest._ventanaDias as number,
  ubicaciones: (backtest.ubicaciones as string[]).length,
}

/**
 * Error típico del score a N días de anticipación, en puntos.
 *
 * Para hoy y mañana-mismo (anticipación 0) no hay medición: el backtest
 * compara corridas de días anteriores, y el pronóstico de hoy para hoy
 * es prácticamente el análisis. Se usa la banda de 1 día, que es la más
 * chica y por lo tanto la afirmación más conservadora.
 *
 * Más allá del último horizonte medido se mantiene el último valor: no
 * se extrapola, igual que en las curvas del score.
 */
export function bandaPts(anticipacionDias: number): number | null {
  const leads = Object.keys(BANDA)
    .map(Number)
    .sort((a, b) => a - b)
  if (leads.length === 0) return null
  const n = Math.max(leads[0], Math.min(leads[leads.length - 1], anticipacionDias))
  return BANDA[String(n)]?.maePts ?? null
}

/** El 10 % peor, para cuando hace falta hablar del peor caso. */
export function bandaP90Pts(anticipacionDias: number): number | null {
  const leads = Object.keys(BANDA)
    .map(Number)
    .sort((a, b) => a - b)
  if (leads.length === 0) return null
  const n = Math.max(leads[0], Math.min(leads[leads.length - 1], anticipacionDias))
  return BANDA[String(n)]?.p90Pts ?? null
}

/** "±8" — redondeado a entero, que es toda la precisión que aguanta. */
export function textoBanda(anticipacionDias: number): string | null {
  const b = bandaPts(anticipacionDias)
  return b == null ? null : `±${Math.round(b)}`
}

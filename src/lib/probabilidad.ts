// PROBABILIDAD CALIBRADA — "78 % de que salga excelente".
//
// Un puntaje con ±8 puntos de error es difícil de usar: no se sabe si
// 71 y 76 son distintos o son el mismo día con ruido. Una probabilidad
// sí se usa, PERO solo si está calibrada: si cuando dice 70 % el día
// sale bueno el 70 % de las veces. Si no, es peor que el puntaje,
// porque suena a certeza.
//
// DE DÓNDE SALE
// No de la dispersión del ensemble. Se evaluó el 1-sep-2026 y no se
// puede: la API de ensemble solo guarda ~4 días de pasado (verificado:
// 101 horas contiguas del 28-ago al 1-sep), así que no hay histórico
// contra el cual calibrar. Una probabilidad sacada de la dispersión
// sería exactamente el número que parece preciso y no lo es.
//
// Sale del BACKTEST: 364 pares (score pronosticado, score que resultó)
// por horizonte, sobre 90 días y 4 ubicaciones. La distribución del
// error con signo a cada horizonte dice, para un pronóstico dado, qué
// fracción de las veces el día real terminó por encima del umbral. Es
// calibrada por construcción, y se verifica con un diagrama de
// confiabilidad en `tests/unit/probabilidad.test.ts`.
//
// EL UMBRAL también sale de los datos. "Bueno" (≥55) lo cumple el 95 %
// de los días del corredor: una probabilidad con ese corte diría 95 %
// todos los días y no serviría para elegir. "Excelente" (≥75) lo cumple
// el 35 %, así que discrimina — y es una etiqueta que la app ya usa, no
// un corte inventado para esto.

import backtest from '../config/backtest.json'

const GRILLA = backtest.probGrillaScore as number[]
const CURVA = backtest.probPorScore as unknown as Record<string, (number | null)[]>

export const UMBRAL_EXCELENTE = backtest.umbralExcelente as number
export const TASA_BASE = backtest.tasaBaseExcelente as number

function leadDisponible(anticipacionDias: number): string {
  const leads = Object.keys(CURVA)
    .map(Number)
    .sort((a, b) => a - b)
  const n = Math.max(leads[0], Math.min(leads[leads.length - 1], anticipacionDias))
  return String(n)
}

/**
 * Probabilidad (0..1) de que el día termine siendo Excelente, dado el
 * puntaje pronosticado y a cuántos días está.
 *
 * Lee la curva de calibración del backtest: de los días históricos con
 * un puntaje parecido a este y a esta misma distancia, ¿cuántos
 * terminaron Excelente? Interpola entre los puntos de la grilla.
 *
 * OJO CON LA TENTACIÓN de calcularlo con el error promedio del
 * horizonte: se probó y el diagrama de confiabilidad lo tumbó. A 4 días
 * decía 89 % en el tramo alto y pasaba el 45 %. El error NO es
 * independiente del pronóstico —los puntajes altos regresan a la
 * media—, así que la probabilidad tiene que estar CONDICIONADA al
 * puntaje, no solo al horizonte.
 */
export function probExcelente(score: number, anticipacionDias: number): number | null {
  const curva = CURVA[leadDisponible(anticipacionDias)]
  if (!curva || curva.length === 0) return null
  if (score <= GRILLA[0]) return curva[0]
  const ultimo = GRILLA.length - 1
  if (score >= GRILLA[ultimo]) return curva[ultimo]
  for (let i = 1; i < GRILLA.length; i++) {
    if (score > GRILLA[i]) continue
    const x0 = GRILLA[i - 1]
    const x1 = GRILLA[i]
    const y0 = curva[i - 1]
    const y1 = curva[i]
    if (y0 == null || y1 == null) return y1 ?? y0
    return y0 + (y1 - y0) * ((score - x0) / (x1 - x0))
  }
  return curva[ultimo]
}

/** "78 %" — entero, que es toda la precisión que el dato aguanta. */
export function textoProb(score: number, anticipacionDias: number): string | null {
  const p = probExcelente(score, anticipacionDias)
  return p == null ? null : `${Math.round(p * 100)} %`
}

/**
 * Cómo se lee esa probabilidad en palabras.
 *
 * Los cortes no son redondos por gusto: la tasa base de días
 * excelentes es 35 %, así que "como cualquier día" tiene que rodear ese
 * número. Decir "probable" con 40 % sería vender una ventaja que no
 * existe sobre tirar una moneda cargada.
 */
export function fraseProb(p: number): string {
  if (p >= 0.75) return 'Casi seguro que sale excelente.'
  if (p >= 0.5) return 'Más probable que no que salga excelente.'
  if (p >= 0.25) return 'Puede salir excelente, como un día cualquiera.'
  if (p >= 0.1) return 'Difícil que salga excelente.'
  return 'Muy difícil que salga excelente.'
}

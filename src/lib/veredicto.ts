// Quién se corona como "el mejor día de la semana".
//
// Vivía dentro de Home.tsx, o sea dentro de un componente, o sea sin
// forma de probar la regla sin renderizar. Acá es una función, y los
// tests prueban EXACTAMENTE lo que la pantalla ejecuta.

import { CALIBRACION } from '../config/calibracion'
import type { DiaJornada } from './ventanas'

/**
 * Un día es dudoso cuando los tres modelos globales no coinciden lo
 * suficiente como para cambiar la respuesta. No dice que el día sea
 * malo: dice que el número todavía no está firme.
 *
 * El umbral (20 puntos de los 75 que pesan viento + sol) está muy por
 * encima del error típico del pronóstico, que el backtest midió entre
 * 5.3 y 8.8 puntos según la distancia. Si fuera del orden del error
 * normal marcaría días que solo tienen la incertidumbre de siempre.
 */
export function dudoso(d: DiaJornada): boolean {
  return d.desacuerdo != null && d.desacuerdo >= CALIBRACION.desacuerdoModelosPts
}

/**
 * El mejor día salible de la semana, o null si no hay ninguno que se
 * pueda coronar.
 *
 * Tres filtros, en este orden y por estas razones:
 *
 *  1. **Peligro**: un día con bandera de seguridad no compite. Obvio.
 *  2. **Decidido**: si los modelos no coinciden, el día no se corona.
 *     No es que sea malo — es que no está decidido, y venderlo como el
 *     mejor sería presentar como certeza lo que el propio dato dice que
 *     no lo es. OJO: lo que descalifica es la DISPERSIÓN, no la
 *     distancia. Un día a 6 días con los tres modelos de acuerdo es más
 *     confiable que uno a 2 con ellos peleados.
 *  3. **Completo**: un día al que le faltan datos no compite contra
 *     días completos — sin el dato de mar pierde 25 puntos de arranque
 *     y perdería siempre por una razón que no es el clima. Si ninguno
 *     está completo, se comparan entre ellos, que al menos están todos
 *     igual de mancos.
 */
export function elegirMejorDia(semana: DiaJornada[]): DiaJornada | null {
  const salibles = semana.filter((d) => !d.score.peligro)
  if (salibles.length === 0) return null

  const decididos = salibles.filter((d) => !dudoso(d))
  if (decididos.length === 0) return null

  const completos = decididos.filter((d) => d.score.pesoFaltante === 0)
  const candidatos = completos.length > 0 ? completos : decididos
  return candidatos.reduce((a, b) => (b.score.total > a.score.total ? b : a))
}

/** Por qué no hay veredicto, para poder decirlo sin mentir. */
export type MotivoSinVeredicto = 'todos-peligrosos' | 'ninguno-decidido'

export function motivoSinVeredicto(semana: DiaJornada[]): MotivoSinVeredicto {
  return semana.some((d) => !d.score.peligro) ? 'ninguno-decidido' : 'todos-peligrosos'
}

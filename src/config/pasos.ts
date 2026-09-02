// LOS PASOS ENTRE ISLAS — conocimiento local declarado, NO dato de modelo.
//
// Por qué existe este archivo: el aviso de viento contra corriente que
// da la app sale del modelo, y el modelo NO VE los pasos. Verificado el
// 1-sep-2026: cuatro puntos que abarcan 3.5 km a través del paso
// Contadora–Chapera caen todos en la MISMA celda (8.625, −79.0416) y
// devuelven la misma corriente, 0.2 a 1.1 km/h. Se probó con los dos
// modelos de corriente disponibles (best_match y meteofrance_currents)
// y dan idéntico. A ~11 km de celda, un canal de 1 km no existe.
//
// LO QUE ACÁ HAY Y LO QUE NO
//   · HAY geometría: qué pasos son y cómo están orientados. Eso se
//     verifica en una carta y no depende de ningún modelo.
//   · NO HAY velocidades de corriente. No las tengo, no las puedo
//     verificar, y ponerlas inventadas sería peor que no decir nada —
//     alguien podría cruzar confiando en un número que me inventé.
//
// Lo que la app sí puede decir con esto: en qué horas la marea corre
// más fuerte (se deriva de la curva de marea, que está validada a ±4
// min contra la tabla oficial de Balboa) y que en estos pasos ese
// efecto se multiplica. La decisión de cruzar sigue siendo del capitán.

export interface Paso {
  id: string
  nombre: string
  /** Entre qué islas. Verificable en carta. */
  entre: string
  /**
   * Ancho aproximado del canal, en km. Sirve para explicar por qué el
   * modelo no lo ve: su celda mide ~11 km.
   */
  anchoKm: number
}

/**
 * Los pasos del corredor Ocean Reef → Las Perlas que importan.
 * Lista corta a propósito: solo los que están en la ruta habitual.
 */
export const PASOS: Paso[] = [
  {
    id: 'contadora-chapera',
    nombre: 'Paso Contadora–Chapera',
    entre: 'Contadora y Chapera',
    anchoKm: 2,
  },
  {
    id: 'mogo-chapera',
    nombre: 'Paso Mogo Mogo–Chapera',
    entre: 'Mogo Mogo y Chapera',
    anchoKm: 1.5,
  },
]

/**
 * La marea corre más fuerte a media marea, no en pleamar ni en bajamar.
 *
 * No es una regla inventada: es la derivada de la curva. El nivel se
 * mueve más rápido justo entre los extremos, y el flujo que pasa por un
 * canal es proporcional a esa velocidad de cambio. Como la curva de
 * marea está validada a ±4 min contra la tabla oficial de Balboa, el
 * instante de máximo flujo se puede señalar sin inventar nada.
 *
 * Fracción del máximo de velocidad de cambio a partir de la cual se
 * considera que "está corriendo fuerte".
 */
export const CORRE_FUERTE_FRAC = 0.7

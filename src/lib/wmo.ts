// Códigos de tiempo WMO → texto e icono. Solo los que aparecen en
// el trópico panameño; el resto cae al genérico más cercano.

export type IconoCielo =
  | 'sol'
  | 'sol-nube'
  | 'nube'
  | 'niebla'
  | 'llovizna'
  | 'lluvia'
  | 'tormenta'

export interface Cielo {
  texto: string
  icono: IconoCielo
}

export function cieloDeCodigo(code: number | null | undefined): Cielo {
  if (code == null) return { texto: 'sin dato', icono: 'nube' }
  if (code === 0) return { texto: 'despejado', icono: 'sol' }
  if (code === 1) return { texto: 'casi despejado', icono: 'sol' }
  if (code === 2) return { texto: 'parcialmente nublado', icono: 'sol-nube' }
  if (code === 3) return { texto: 'nublado', icono: 'nube' }
  if (code === 45 || code === 48) return { texto: 'neblina', icono: 'niebla' }
  if (code >= 51 && code <= 57) return { texto: 'llovizna', icono: 'llovizna' }
  if (code >= 61 && code <= 67) return { texto: 'lluvia', icono: 'lluvia' }
  if (code >= 80 && code <= 82) return { texto: 'aguaceros', icono: 'lluvia' }
  if (code === 95) return { texto: 'tormenta eléctrica', icono: 'tormenta' }
  if (code === 96 || code === 99)
    return { texto: 'tormenta con granizo', icono: 'tormenta' }
  return { texto: 'variable', icono: 'sol-nube' }
}

/**
 * Cómo se describe el cielo de un DÍA entero.
 *
 * La nubosidad que entra es el PROMEDIO de la jornada y la lluvia es el
 * MÁXIMO — las dos cosas correctas, pero juntas sin matiz se
 * contradicen: la semana del 1-sep-2026 la app llegó a mostrar
 * "despejado · lluvia 69 %", que es justo lo que no hay que decirle a
 * alguien decidiendo si sale.
 *
 * No es un error de dato: en temporada lluviosa el patrón real ES sol
 * de mañana y chubasco de tarde, y el promedio de nubes queda bajo. La
 * app tiene que llamarlo por su nombre en vez de dejar dos hechos
 * peleándose en la misma línea.
 */
export function textoCieloDia(
  nubesMedia: number | null,
  probLluviaMax: number | null,
  indiceSol?: number | null,
): string {
  // El ÍNDICE manda sobre la nubosidad, y por la misma razón por la que
  // manda en el score: describe la luz que te toca, no el campo de
  // nubes del modelo. Medido el 1-sep-2026 sobre 360 días: usar la
  // nubosidad hacía que el 11.4 % de los días dijeran "nublado" con el
  // sol puntuando 0.78 o más — días de 95 % de nubes por los que igual
  // pasa el 68 % de la radiación. Con el índice, etiqueta y puntaje no
  // se pueden contradecir porque salen del mismo número.
  //
  // Los cortes son los cuartiles observados del índice en el corredor
  // (p25 0.45 · p50 0.55 · p75 0.66), así que cada palabra cubre
  // aproximadamente una cuarta parte de los días.
  if (indiceSol != null) {
    const base =
      indiceSol >= 0.65
        ? 'despejado'
        : indiceSol >= 0.55
          ? 'sol parcial'
          : indiceSol >= 0.42
            ? 'nublado'
            : 'cerrado'
    if (indiceSol >= 0.55 && probLluviaMax != null && probLluviaMax > 50) {
      return 'sol y chubascos'
    }
    return base
  }
  if (nubesMedia == null) return '—'
  const base = nubesMedia <= 25 ? 'despejado' : nubesMedia <= 50 ? 'sol parcial' : 'nublado'
  // Cielo abierto en promedio pero con lluvia más probable que no:
  // el día no es "despejado", es de sol y chubascos.
  if (nubesMedia <= 50 && probLluviaMax != null && probLluviaMax > 50) {
    return 'sol y chubascos'
  }
  return base
}

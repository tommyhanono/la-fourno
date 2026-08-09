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

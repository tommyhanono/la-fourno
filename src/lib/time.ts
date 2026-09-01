// Hora de Panamá (America/Panama, UTC-5 fijo, sin DST).
// Las APIs ya devuelven horas locales de Panamá ("2026-08-09T14:00");
// aquí se parsean SIEMPRE como Panamá, sin depender del reloj del
// dispositivo ni de su zona horaria.

export const TZ_OFFSET_MS = -5 * 3600_000

/** Parsea un ISO local de Panamá ("2026-08-09T14:00") a Date (instante real). */
export function parsePanama(iso: string): Date {
  const [d, t] = iso.split('T')
  const [y, m, day] = d.split('-').map(Number)
  const [hh, mm] = (t ?? '00:00').split(':').map(Number)
  return new Date(Date.UTC(y, m - 1, day, hh, mm) - TZ_OFFSET_MS)
}

/**
 * EL ÚNICO "AHORA" DE LA APP. Todo el código que necesite saber qué
 * hora es pasa por acá.
 *
 * Devuelve un instante, no una hora local: un Date ES un instante
 * absoluto, y lo panameño aparece al LEER sus componentes con
 * `compsPanama`. Mezclar las dos ideas es de donde salieron los dos
 * bugs de "el índice 0 es hoy": alguien calculaba el día con el reloj
 * del dispositivo en vez del de Panamá.
 *
 * Existe como función y no como `new Date()` suelto para que los tests
 * puedan congelarla en un solo lugar, y para que buscar "quién decide
 * qué día es hoy" tenga UNA respuesta.
 */
export function ahoraPanama(): Date {
  return new Date()
}

/** "2026-09-01" — el día de HOY según el reloj de Panamá. */
export function hoyPanama(): string {
  return claveDia(ahoraPanama())
}

/**
 * Medianoche de hoy en Panamá, como instante.
 *
 * Es lo que hace falta para medir anticipación en días de calendario, y
 * estaba escrito a mano en dos lugares distintos como
 * `parsePanama(claveDia(new Date()) + 'T00:00')`. Una sola vez.
 */
export function medianocheHoyPanama(): Date {
  return parsePanama(`${hoyPanama()}T00:00`)
}

/**
 * Busca un día por FECHA en una lista, nunca por posición.
 *
 * Los dos bugs de esta clase salieron de asumir que el índice 0 de un
 * arreglo de días es hoy. No lo es cuando el caché cruza la medianoche:
 * el pronóstico guardado ayer empieza en ayer. Esta función existe para
 * que no haya excusa para volver a indexar por posición.
 */
export function buscarDia<T extends { clave: string }>(
  dias: readonly T[],
  clave: string,
): T | undefined {
  return dias.find((d) => d.clave === clave)
}

function compsPanama(d: Date) {
  const shifted = new Date(d.getTime() + TZ_OFFSET_MS)
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
    hh: shifted.getUTCHours(),
    mm: shifted.getUTCMinutes(),
    dow: shifted.getUTCDay(),
  }
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "2:35 pm" — reloj de 12 horas, como se habla en Panamá. */
export function horaCorta(d: Date): string {
  const { hh, mm } = compsPanama(d)
  const ampm = hh < 12 ? 'am' : 'pm'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`
}

/** "2 pm" — para ejes y timelines. */
export function horaMuyCorta(d: Date): string {
  const { hh } = compsPanama(d)
  const ampm = hh < 12 ? 'am' : 'pm'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12} ${ampm}`
}

/** "sábado 15" */
export function diaLargo(d: Date): string {
  const c = compsPanama(d)
  return `${DIAS[c.dow]} ${c.d}`
}

/** "sáb 15" */
export function diaCorto(d: Date): string {
  const c = compsPanama(d)
  return `${DIAS_CORTOS[c.dow]} ${c.d}`
}

/** "sáb 15 ago, 2:35 pm" */
export function fechaHora(d: Date): string {
  const c = compsPanama(d)
  return `${DIAS_CORTOS[c.dow]} ${c.d} ${MESES_CORTOS[c.m]}, ${horaCorta(d)}`
}

/** "2026-08-09" del reloj de Panamá — clave de día. */
export function claveDia(d: Date): string {
  const c = compsPanama(d)
  return `${c.y}-${String(c.m + 1).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`
}

/** ¿Es hoy (según el reloj de Panamá)? */
export function esHoy(d: Date): boolean {
  return claveDia(d) === claveDia(ahoraPanama())
}

/** ¿Es mañana? */
export function esManana(d: Date): boolean {
  const man = new Date(ahoraPanama().getTime() + 24 * 3600_000)
  return claveDia(d) === claveDia(man)
}

/** "hoy" / "mañana" / "sábado 15" */
export function nombreDia(d: Date): string {
  if (esHoy(d)) return 'hoy'
  if (esManana(d)) return 'mañana'
  return diaLargo(d)
}

/** Hora (0-23) del reloj de Panamá. */
export function horaPanama(d: Date): number {
  return compsPanama(d).hh
}

/** "hace 5 min" / "hace 2 h" */
export function haceCuanto(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.round(ms / 60_000)
  if (min < 1) return 'ahora mismo'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  return `hace ${h} h ${min % 60 ? `${min % 60} min` : ''}`.trim()
}

/**
 * Índice de la hora VIGENTE en una serie horaria: la última que ya
 * empezó. Estaba duplicada, idéntica, en Home y en PuntoVista — dos
 * copias de lo mismo que podían derivar sin que nadie lo notara.
 *
 * Bordes, que antes pasaban en silencio y ahora están declarados:
 *  · Si toda la serie es futura (el pronóstico empieza mañana), devuelve
 *    la primera hora. Es lo más cercano que hay.
 *  · Si toda la serie es pasada (caché muy viejo), devuelve la última.
 *    La app ya avisa aparte de que el dato está viejo; acá no se puede
 *    hacer nada mejor que mostrar lo último que hubo.
 *  · Serie vacía: 0, y quien llame se encontrará un undefined, que es
 *    lo mismo que le pasaría con cualquier otro índice.
 */
export function indiceHoraActual(times: string[], ahora = Date.now()): number {
  if (times.length === 0) return 0
  let mejor = -1
  for (let i = 0; i < times.length; i++) {
    if (parsePanama(times[i]).getTime() <= ahora) mejor = i
    else break
  }
  // -1 = ninguna hora empezó todavía: la primera es la más cercana.
  return mejor === -1 ? 0 : mejor
}

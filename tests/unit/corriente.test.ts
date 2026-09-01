// Viento contra corriente: el caso que arruina el cruce con viento bajo.
//
// Lo delicado acá es la CONVENCIÓN: el viento se nombra por dónde
// VIENE, la corriente por dónde VA. Compararlas crudas da el resultado
// exactamente invertido, y es el error clásico de este cálculo. La
// mitad de estos tests existen para eso.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { difAngulo, enContra, ventanasEnContra, CORRIENTE, KMH_A_KT } from '../../src/lib/corriente'
import { jornadasSemana } from '../../src/lib/ventanas'
import { datosSinteticos, DIA_BASE } from '../fixtures/genera'
import { buscarDia } from '../../src/lib/time'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${DIA_BASE}T05:00:00-05:00`))
})
afterEach(() => vi.useRealTimers())

describe('la convención de rumbos', () => {
  it('difAngulo da el ángulo corto, no la resta cruda', () => {
    expect(difAngulo(10, 350)).toBe(20)
    expect(difAngulo(350, 10)).toBe(20)
    expect(difAngulo(0, 180)).toBe(180)
    expect(difAngulo(90, 90)).toBe(0)
  })

  it('viento del NORTE contra corriente que VA al norte: en contra', () => {
    // Viento "del norte" (0°) sopla HACIA el sur (180°). Si la corriente
    // va hacia el norte (0°), van de frente. Comparando los rumbos
    // crudos (0 vs 0) parecerían iguales: ahí está la trampa.
    expect(enContra(0, 0)).toBe(true)
  })

  it('viento del norte con corriente que VA al sur: a favor, no en contra', () => {
    // El viento sopla hacia el sur y la corriente también va al sur.
    expect(enContra(0, 180)).toBe(false)
  })

  it('de costado no cuenta', () => {
    // Viento del norte sopla hacia 180; corriente hacia 90 → 90° de
    // diferencia. No es "en contra".
    expect(enContra(0, 90)).toBe(false)
  })

  it('el umbral es 135°, no 90°: "en contra" es de frente, no de lado', () => {
    expect(CORRIENTE.anguloMin).toBe(135)
    expect(enContra(0, 30)).toBe(true) // 150° de diferencia
    expect(enContra(0, 60)).toBe(false) // 120°, todavía de costado
  })
})

describe('las ventanas del día', () => {
  it('el fixture marca el jueves, que es donde se cruzan', () => {
    // El fixture pone corriente fuerte al NORTE el día 3 con el viento
    // del sur del patrón semanal: viento contra corriente.
    const jueves = buscarDia(jornadasSemana(datosSinteticos()), '2026-08-13')!
    expect(jueves.contraCorriente.length).toBeGreaterThan(0)
    const v = jueves.contraCorriente[0]
    expect(v.hasta.getTime()).toBeGreaterThan(v.desde.getTime())
    expect(v.corrienteKt).toBeGreaterThanOrEqual(CORRIENTE.corrienteMinKt)
  })

  it('los demás días NO se marcan: si saliera siempre no diría nada', () => {
    const dias = jornadasSemana(datosSinteticos())
    const marcados = dias.filter((d) => d.contraCorriente.length > 0)
    expect(marcados.length).toBeGreaterThan(0)
    expect(marcados.length).toBeLessThan(dias.length)
  })

  it('sin datos de mar no inventa ventanas', () => {
    const datos = datosSinteticos()
    const f = datos.forecast[0]
    expect(ventanasEnContra(f, null, new Date(), 7)).toEqual([])
  })

  it('con corriente por debajo del mínimo no marca, por opuesta que venga', () => {
    // Medido: la corriente del corredor tiene mediana 0.49 kt. Por
    // debajo de eso no alcanza a parar el mar.
    const datos = datosSinteticos()
    const m = datos.marine[0]!
    m.hourly.ocean_current_velocity = m.hourly.ocean_current_velocity.map(() => 0.1)
    m.hourly.ocean_current_direction = m.hourly.ocean_current_direction.map(() => 10)
    const inicio = new Date(`${DIA_BASE}T09:00:00-05:00`)
    expect(ventanasEnContra(datos.forecast[0], m, inicio, 7)).toEqual([])
  })

  it('una sola hora suelta no es una ventana', () => {
    // Un cruce de una hora no cambia la decisión del día; marcarlo sería
    // ruido. Hacen falta al menos dos horas seguidas.
    expect(CORRIENTE.horasMin).toBeGreaterThanOrEqual(2)
  })

  it('la conversión de km/h a nudos es la correcta', () => {
    expect(KMH_A_KT).toBeCloseTo(0.539957, 6)
    expect(1.852 * KMH_A_KT).toBeCloseTo(1, 4)
  })
})

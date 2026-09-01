// Qué día puede coronarse como "el mejor", y cuál no.
//
// La regla que se prueba acá: lo que descalifica a un día NO es estar
// lejos, es que los modelos no se pongan de acuerdo. Un día a 6 días
// con los tres modelos coincidiendo es más confiable que uno a 2 con
// ellos peleados, y la app tiene que reflejar eso.
//
// Se prueba la MISMA función que usa la pantalla (`elegirMejorDia`), no
// una copia de la regla: si la vista cambiara de criterio sin cambiar
// esta función, el test dejaría de proteger nada.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { jornadasSemana, type DiaJornada } from '../../src/lib/ventanas'
import { elegirMejorDia, dudoso } from '../../src/lib/veredicto'
import { CALIBRACION } from '../../src/config/calibracion'
import { datosSinteticos, DIA_BASE } from '../fixtures/genera'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${DIA_BASE}T05:00:00-05:00`))
})
afterEach(() => vi.useRealTimers())

const U = CALIBRACION.desacuerdoModelosPts
const semana = () => jornadasSemana(datosSinteticos())

/** Copia de un día con el desacuerdo forzado. */
const con = (d: DiaJornada, desacuerdo: number | null): DiaJornada => ({
  ...d,
  desacuerdo,
})

describe('el mejor día del veredicto', () => {
  it('con todo en orden, corona al de mejor puntaje', () => {
    const dias = semana().map((d) => con(d, 0))
    const mejor = elegirMejorDia(dias)!
    const maxSalible = Math.max(
      ...dias.filter((d) => !d.score.peligro).map((d) => d.score.total),
    )
    expect(mejor.score.total).toBe(maxSalible)
  })

  it('un día con ALTA dispersión no puede ser el mejor, aunque puntúe más', () => {
    // El caso que pide la regla: se le pone el puntaje más alto de la
    // semana Y dispersión por encima del umbral. No debe ganar.
    const base = semana().map((d) => con(d, 0))
    const candidato = base.find((d) => !d.score.peligro)!
    const trucado = base.map((d) =>
      d.clave === candidato.clave
        ? { ...d, desacuerdo: U + 10, score: { ...d.score, total: 99 } }
        : d,
    )
    const mejor = elegirMejorDia(trucado)!
    expect(mejor.clave).not.toBe(candidato.clave)
    expect(dudoso(trucado.find((d) => d.clave === candidato.clave)!)).toBe(true)
  })

  it('un día LEJANO con baja dispersión SÍ puede ser el mejor', () => {
    // La distancia no descalifica. Solo la falta de acuerdo lo hace.
    const base = semana().map((d) => con(d, U + 10))
    const lejano = base.filter((d) => !d.score.peligro).at(-1)!
    const trucado = base.map((d) =>
      d.clave === lejano.clave
        ? { ...d, desacuerdo: 1, score: { ...d.score, total: 80 } }
        : d,
    )
    const mejor = elegirMejorDia(trucado)!
    expect(mejor.clave).toBe(lejano.clave)
    expect(mejor.anticipacionDias).toBeGreaterThanOrEqual(5)
  })

  it('si NINGÚN día está decidido, no se corona ninguno', () => {
    const dias = semana().map((d) => con(d, U + 5))
    expect(elegirMejorDia(dias)).toBeNull()
  })

  it('sin dato de desacuerdo el día sigue siendo elegible', () => {
    // Si falló la request del multimodelo no se puede castigar a todos
    // los días: la app quedaría sin veredicto por una razón que no
    // tiene que ver con el clima.
    const dias = semana().map((d) => con(d, null))
    expect(elegirMejorDia(dias)).not.toBeNull()
  })

  it('un día peligroso nunca gana, tenga el desacuerdo que tenga', () => {
    const dias = semana().map((d) =>
      d.score.peligro ? { ...d, desacuerdo: 0, score: { ...d.score, total: 99 } } : con(d, 0),
    )
    const mejor = elegirMejorDia(dias)
    expect(mejor?.score.peligro).toBeFalsy()
  })

  it('el umbral está muy por encima del error típico del pronóstico', () => {
    // Justificación del número: si el umbral fuera del orden del error
    // normal, marcaría días que solo tienen la incertidumbre de
    // siempre. Tiene que ser claramente mayor.
    const bandaPeor = 8.9 // MAE a 7 días, del backtest
    expect(U).toBeGreaterThan(bandaPeor * 2)
  })
})

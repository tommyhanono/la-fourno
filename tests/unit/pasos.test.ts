// Los pasos entre islas: decir cuándo corre, sin inventar cuánto.
//
// El modelo NO resuelve los canales — verificado el 1-sep-2026: cuatro
// puntos que abarcan 3.5 km a través del paso Contadora–Chapera caen
// todos en la misma celda y devuelven la misma corriente. Así que la
// app no puede decir la velocidad ahí. Lo que SÍ puede decir, porque
// sale de la curva de marea (validada a ±4 min contra NOAA), es en qué
// horas la marea está corriendo fuerte.

import { describe, it, expect } from 'vitest'
import { serieMarea, tramosDeCorriente } from '../../src/lib/tide'
import { PASOS, CORRE_FUERTE_FRAC } from '../../src/config/pasos'
import { parsePanama } from '../../src/lib/time'

/** Marea semidiurna limpia: pleamar a medianoche, período 12.42 h. */
function serieSintetica(dias = 2) {
  const times: string[] = []
  const niveles: number[] = []
  for (let h = 0; h < dias * 24; h++) {
    const d = new Date(Date.UTC(2026, 7, 10, h + 5))
    times.push(new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 16))
    niveles.push(2 * Math.cos((2 * Math.PI * h) / 12.42))
  }
  return serieMarea(times, niveles)
}

describe('cuándo corre la marea', () => {
  const s = serieSintetica()
  const desde = parsePanama('2026-08-10T00:00')
  const hasta = parsePanama('2026-08-10T23:00')
  const tramos = tramosDeCorriente(s, desde, hasta)

  it('encuentra tramos, y no son el día entero', () => {
    // Si marcara todo el día no diría nada. Con una semidiurna, la marea
    // corre fuerte cerca de media marea: unas pocas horas por ciclo.
    expect(tramos.length).toBeGreaterThan(0)
    const horas = tramos.reduce(
      (a, t) => a + (t.hasta.getTime() - t.desde.getTime()) / 3600_000,
      0,
    )
    expect(horas).toBeLessThan(16)
  })

  it('corre fuerte a MEDIA marea, no en pleamar', () => {
    // Es la parte que no es obvia: el flujo es máximo donde el nivel
    // cambia más rápido, que es entre los extremos. La serie tiene
    // pleamar a las 00:00 y bajamar ~6.2 h después, así que el máximo
    // de flujo cae cerca de las 3.
    const centros = tramos.map(
      (t) => (t.desde.getTime() + t.hasta.getTime()) / 2,
    )
    const horaDe = (ms: number) =>
      Number(new Date(ms - 5 * 3600_000).toISOString().slice(11, 13))
    // Ninguno de los centros debería caer sobre un extremo de marea
    // (0 h, ~6.2 h, ~12.4 h…). Se comprueba que estén a más de 1 h.
    for (const c of centros) {
      const h = horaDe(c)
      const distanciaAExtremo = Math.min(
        ...[0, 6.2, 12.4, 18.6, 24].map((e) => Math.abs(h - e)),
      )
      expect(distanciaAExtremo).toBeGreaterThan(1)
    }
  })

  it('con marea plana no marca nada', () => {
    const times: string[] = []
    const niveles: number[] = []
    for (let h = 0; h < 48; h++) {
      const d = new Date(Date.UTC(2026, 7, 10, h + 5))
      times.push(new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 16))
      niveles.push(0)
    }
    expect(tramosDeCorriente(serieMarea(times, niveles), desde, hasta)).toEqual([])
  })

  it('un tramo de una sola hora no cuenta', () => {
    for (const t of tramos) {
      expect(t.hasta.getTime() - t.desde.getTime()).toBeGreaterThanOrEqual(2 * 3600_000)
    }
  })
})

describe('la tabla de pasos es conocimiento declarado, no dato de modelo', () => {
  it('tiene los pasos de la ruta y su geometría', () => {
    expect(PASOS.length).toBeGreaterThan(0)
    for (const p of PASOS) {
      expect(p.nombre).toBeTruthy()
      expect(p.entre).toBeTruthy()
      expect(p.anchoKm).toBeGreaterThan(0)
    }
  })

  it('NINGÚN paso trae velocidad de corriente inventada', () => {
    // Es la regla que más importa de este archivo: la geometría se
    // verifica en una carta, la velocidad no la tiene nadie. Si alguien
    // agrega un campo de velocidad, este test lo atrapa.
    for (const p of PASOS) {
      expect(Object.keys(p)).toEqual(['id', 'nombre', 'entre', 'anchoKm'])
    }
  })

  it('los pasos son mucho más angostos que la celda del modelo (~11 km)', () => {
    // Es la razón por la que el modelo no los ve, y por la que hace
    // falta declararlos a mano.
    for (const p of PASOS) expect(p.anchoKm).toBeLessThan(11)
  })

  it('el umbral de "corriendo fuerte" deja una minoría del día', () => {
    expect(CORRE_FUERTE_FRAC).toBeGreaterThan(0.5)
    expect(CORRE_FUERTE_FRAC).toBeLessThan(0.9)
  })
})

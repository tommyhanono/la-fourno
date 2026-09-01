// La banda de incertidumbre: que el ±N sea el medido y no otro número.
//
// Dos cosas que este archivo protege:
//  1. Que la banda salga del artefacto del backtest y crezca con la
//     distancia, que es lo que la hace significar algo.
//  2. Que las curvas DUPLICADAS en scripts/backtest.mjs sigan siendo
//     las mismas que las de la app. Están duplicadas a propósito (el
//     script corre sin build), y una copia que se desincroniza en
//     silencio produciría una banda medida sobre un score que ya no
//     existe.

import { describe, it, expect } from 'vitest'
import { bandaPts, bandaP90Pts, textoBanda, BACKTEST_INFO } from '../../src/lib/incertidumbre'
import { CALIBRACION } from '../../src/config/calibracion'
import { CURVAS, PESOS, RACHA, PESO_PICO, interp, scoreParcial } from '../../scripts/backtest.mjs'
import { scoreBloque } from '../../src/lib/score'
import artefacto from '../../src/config/backtest.json'

describe('banda de incertidumbre', () => {
  it('sale del artefacto del backtest, no de una constante', () => {
    expect(BACKTEST_INFO.ventanaDias).toBeGreaterThanOrEqual(60)
    expect(BACKTEST_INFO.ubicaciones).toBe(4)
    expect(BACKTEST_INFO.generado).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('el artefacto declara contra qué se midió, incluido lo que NO es observación', () => {
    // El mar se compara contra el análisis del propio modelo. Eso es
    // modelo contra modelo y tiene que estar dicho, no escondido.
    const v = artefacto._verdad as Record<string, string>
    expect(v.atmosfera).toMatch(/ERA5/)
    expect(v.mar).toMatch(/MODELO CONTRA MODELO/i)
  })

  it('crece con la distancia: si no creciera, no diría nada', () => {
    const b1 = bandaPts(1)!
    const b7 = bandaPts(7)!
    expect(b1).toBeGreaterThan(0)
    expect(b7).toBeGreaterThan(b1)
  })

  it('el p90 siempre es peor que el promedio', () => {
    for (let d = 1; d <= 7; d++) {
      expect(bandaP90Pts(d)!).toBeGreaterThan(bandaPts(d)!)
    }
  })

  it('no extrapola: fuera del rango medido se queda en el extremo', () => {
    expect(bandaPts(0)).toBe(bandaPts(1))
    expect(bandaPts(99)).toBe(bandaPts(7))
    expect(bandaPts(-5)).toBe(bandaPts(1))
  })

  it('el texto es entero: más precisión de la que el dato aguanta sería mentira', () => {
    expect(textoBanda(4)).toMatch(/^±\d+$/)
  })
})

describe('el backtest usa las MISMAS curvas que la app', () => {
  it('los pesos coinciden', () => {
    expect(PESOS.viento).toBe(CALIBRACION.pesos.viento)
    expect(PESOS.sol).toBe(CALIBRACION.pesos.sol)
    expect(PESOS.ola).toBe(CALIBRACION.pesos.ola)
    expect(PESOS.marea).toBe(CALIBRACION.pesos.marea)
  })

  it('la racha coincide', () => {
    expect(RACHA.deltaKt).toBe(CALIBRACION.viento.rachaDeltaKt)
    expect(RACHA.penal).toBe(CALIBRACION.viento.rachaPenal)
    expect(PESO_PICO).toBe(CALIBRACION.jornada.pesoPico)
  })

  it('la curva de viento coincide anclaje por anclaje', () => {
    expect(CURVAS.viento).toEqual(CALIBRACION.viento.curva.map((a) => [a.kt, a.frac]))
  })

  it('la curva de sol coincide', () => {
    expect(CURVAS.sol).toEqual(CALIBRACION.sol.curva.map((a) => [a.pct, a.frac]))
  })

  it('la curva de ola coincide', () => {
    expect(CURVAS.ola).toEqual(CALIBRACION.ola.curva.map((a) => [a.m, a.frac]))
  })

  it('y el score parcial del script da lo mismo que el motor real', () => {
    // La prueba de fuego: mismos insumos, mismo número. Si el script
    // midiera sobre otra fórmula, la banda no aplicaría al score que
    // el usuario ve.
    const casos = [
      { viento: 4, racha: 6, nubes: 10, ola: 0.3 },
      { viento: 13, racha: 22, nubes: 60, ola: 1.1 },
      { viento: 19, racha: 21, nubes: 95, ola: 1.7 },
    ]
    for (const c of casos) {
      const real = scoreBloque({
        vientoKt: c.viento,
        rachaKt: c.racha,
        nubosidadPct: c.nubes,
        probLluviaPct: null,
        lluviaMmH: 0,
        olaM: c.ola,
        periodoS: 9,
        weatherCodes: [0],
        tormentaFrac: 0,
        capeJkg: null,
        mareaRel: null,
        mareaTendencia: null,
      })
      // El motor real suma solo viento+racha+sol+ola cuando la marea
      // falta, que es justo el score parcial del script.
      const soloBase = real.contribuciones
        .filter((x) => ['viento', 'racha', 'sol', 'ola'].includes(x.clave))
        .reduce((a, x) => a + x.puntos, 0)
      expect(scoreParcial(c)).toBeCloseTo(soloBase, 1)
    }
  })

  it('interp respeta los anclajes exactos, igual que curvaFrac', () => {
    for (const [x, y] of CURVAS.viento) expect(interp(CURVAS.viento, x)).toBeCloseTo(y, 10)
    for (const [x, y] of CURVAS.sol) expect(interp(CURVAS.sol, x)).toBeCloseTo(y, 10)
  })
})

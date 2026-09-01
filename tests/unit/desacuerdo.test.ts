// El umbral de desacuerdo entre modelos tiene que marcar una MINORÍA.
//
// El aviso que sale siempre no informa. Este umbral se puso al
// principio mirando 8 días, que es poquísimo — quedó anotado como
// "remedir". Se remidió: la API de pronóstico histórico acepta
// `models=`, así que hay meses de multimodelo, no una semana.
//
// Resultado: el número puesto a ojo aguantó. Marca 19 % de los días en
// lluviosa y 26 % en seca. Este test lo fija.

import { describe, it, expect } from 'vitest'
import { puntosViento, puntosSol } from '../../src/lib/score'
import { CALIBRACION } from '../../src/config/calibracion'
import fixture from '../fixtures/desacuerdo-modelos.json'

interface PorModelo {
  vientoKt: number
  nubesPct: number
}
interface DiaMulti {
  dia: string
  ecmwf_ifs025: PorModelo | null
  gfs_seamless: PorModelo | null
  icon_seamless: PorModelo | null
}

const MODELOS = ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless'] as const

/** Mismo cálculo que ventanas.ts: puntos de viento + sol por modelo. */
function desacuerdo(d: DiaMulti): number | null {
  const pts = MODELOS.map((m) => d[m])
    .filter((x): x is PorModelo => x != null)
    .map((x) => puntosViento(x.vientoKt) + puntosSol(x.nubesPct))
  if (pts.length < 2) return null
  return Math.max(...pts) - Math.min(...pts)
}

const lluviosa = fixture.lluviosa as DiaMulti[]
const seca = fixture.seca as DiaMulti[]
const U = CALIBRACION.desacuerdoModelosPts

const marcados = (ds: DiaMulti[]) => {
  const v = ds.map(desacuerdo).filter((x): x is number => x != null)
  return (100 * v.filter((x) => x >= U).length) / v.length
}

describe('el umbral de desacuerdo marca una minoría, no la mitad', () => {
  it('el fixture tiene meses, no una semana', () => {
    // El umbral original salió de 8 días. Esto es lo que faltaba.
    expect(lluviosa.length).toBeGreaterThan(60)
    expect(seca.length).toBeGreaterThan(60)
  })

  it('en lluviosa marca entre el 5 % y el 35 % de los días', () => {
    const p = marcados(lluviosa)
    expect(p).toBeGreaterThan(5)
    expect(p).toBeLessThan(35)
  })

  it('en seca también, aunque los modelos discrepen más', () => {
    // En seca la p90 del desacuerdo es 33.4 contra 22.1 en lluviosa:
    // los nortes se pronostican bien de media pero cuando fallan,
    // fallan feo. Aun así el umbral deja el aviso en minoría.
    const p = marcados(seca)
    expect(p).toBeGreaterThan(5)
    expect(p).toBeLessThan(40)
  })

  it('un umbral de 10 lo volvería papel tapiz, y por eso no está en 10', () => {
    // Documenta por qué el número es el que es: con 10 saldría en dos
    // de cada tres días y el usuario aprendería a ignorarlo.
    const con10 = (ds: DiaMulti[]) => {
      const v = ds.map(desacuerdo).filter((x): x is number => x != null)
      return (100 * v.filter((x) => x >= 10).length) / v.length
    }
    expect(con10(lluviosa)).toBeGreaterThan(50)
    expect(con10(seca)).toBeGreaterThan(50)
  })

  it('el desacuerdo nunca supera el peso de viento + sol', () => {
    for (const d of [...lluviosa, ...seca]) {
      const v = desacuerdo(d)
      if (v == null) continue
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(CALIBRACION.pesos.viento + CALIBRACION.pesos.sol)
    }
  })
})

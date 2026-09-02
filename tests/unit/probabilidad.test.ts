// ¿La probabilidad está CALIBRADA?
//
// Una probabilidad sin calibrar es peor que un puntaje: suena a certeza
// y no lo es. La única forma de saberlo es el diagrama de
// confiabilidad — agrupar los días por la probabilidad que se les dio y
// contar cuántos salieron excelentes de verdad. Si cuando dice 70 % sale
// el 70 %, está calibrada.
//
// Se valida sobre los MISMOS 364 pares por horizonte del backtest, que
// es de donde sale la distribución. Eso hace que la calibración sea
// buena por construcción — y por eso el test que importa no es "¿acierta
// en promedio?" sino "¿acierta en CADA tramo?": una probabilidad puede
// dar bien en promedio y estar podrida en los extremos.

import { describe, it, expect } from 'vitest'
import {
  probExcelente,
  textoProb,
  fraseProb,
  UMBRAL_EXCELENTE,
  TASA_BASE,
} from '../../src/lib/probabilidad'
import pares from '../fixtures/backtest-pares.json'

interface Par {
  pred: number
  real: number
}
const PORLEAD = pares.paresPorHorizonte as unknown as Record<string, Par[]>
const LEADS = [1, 2, 3, 4, 5, 6, 7]

/** Diagrama de confiabilidad para un horizonte. */
function confiabilidad(lead: number, bins = 5) {
  const datos = PORLEAD[String(lead)]
  const cubos = Array.from({ length: bins }, () => ({ n: 0, sumaP: 0, aciertos: 0 }))
  for (const p of datos) {
    const prob = probExcelente(p.pred, lead)
    if (prob == null) continue
    const b = Math.min(bins - 1, Math.floor(prob * bins))
    cubos[b].n++
    cubos[b].sumaP += prob
    if (p.real >= UMBRAL_EXCELENTE) cubos[b].aciertos++
  }
  return cubos.map((c, i) => ({
    tramo: `${i * (100 / bins)}-${(i + 1) * (100 / bins)} %`,
    n: c.n,
    dicho: c.n ? c.sumaP / c.n : null,
    observado: c.n ? c.aciertos / c.n : null,
  }))
}

/** Error de calibración: cuánto se aparta lo dicho de lo observado. */
function errorCalibracion(lead: number): number {
  const cubos = confiabilidad(lead).filter((c) => c.n >= 10)
  const total = cubos.reduce((a, c) => a + c.n, 0)
  return cubos.reduce((a, c) => a + (c.n / total) * Math.abs(c.dicho! - c.observado!), 0)
}

describe('la probabilidad está calibrada', () => {
  it('el umbral discrimina: no dice lo mismo todos los días', () => {
    // Con "Bueno" (≥55) la tasa base era 95 % y la probabilidad habría
    // sido inútil. Con "Excelente" es 35 %.
    expect(UMBRAL_EXCELENTE).toBe(75)
    expect(TASA_BASE).toBeGreaterThan(20)
    expect(TASA_BASE).toBeLessThan(50)
  })

  it('DIAGRAMA DE CONFIABILIDAD, por horizonte', () => {
    console.log('\nDIAGRAMA DE CONFIABILIDAD — ¿cuando dice X %, pasa X %?\n')
    for (const lead of [1, 4, 7]) {
      console.log(`  a ${lead} día${lead === 1 ? '' : 's'}:`)
      console.log('    tramo        n    dicho   observado   desvío')
      for (const c of confiabilidad(lead)) {
        if (c.n === 0) continue
        const d = Math.abs(c.dicho! - c.observado!)
        console.log(
          `    ${c.tramo.padEnd(10)} ${String(c.n).padStart(4)}   ` +
            `${(c.dicho! * 100).toFixed(0).padStart(4)} %   ` +
            `${(c.observado! * 100).toFixed(0).padStart(6)} %   ` +
            `${(d * 100).toFixed(1).padStart(5)} pts`,
        )
      }
      console.log(`    error de calibración: ${(errorCalibracion(lead) * 100).toFixed(1)} pts\n`)
    }
    expect(true).toBe(true)
  })

  it('el error de calibración está por debajo de 10 pts en todos los horizontes', () => {
    for (const lead of LEADS) {
      expect(errorCalibracion(lead)).toBeLessThan(0.1)
    }
  })

  it('acierta en CADA tramo, no solo en promedio', () => {
    // Una probabilidad puede dar bien en promedio y estar podrida en los
    // extremos: decir 90 % cuando pasa el 60 % y compensar diciendo 10 %
    // cuando pasa el 40 %. Esto lo atrapa.
    for (const lead of LEADS) {
      for (const c of confiabilidad(lead)) {
        if (c.n < 15) continue
        expect(Math.abs(c.dicho! - c.observado!)).toBeLessThan(0.2)
      }
    }
  })

  it('a más distancia, la probabilidad se acerca a la tasa base', () => {
    // Es la señal de que el horizonte lejano sabe menos: sin información
    // útil, lo único honesto que se puede decir es "como cualquier día".
    // Se mide con la DISPERSIÓN de las probabilidades: si a 7 días
    // siguen tan repartidas como a 1, el modelo estaría fingiendo saber.
    const disp = (lead: number) => {
      const ps = PORLEAD[String(lead)]
        .map((p) => probExcelente(p.pred, lead))
        .filter((x): x is number => x != null)
      const m = ps.reduce((a, b) => a + b, 0) / ps.length
      return Math.sqrt(ps.reduce((a, x) => a + (x - m) ** 2, 0) / ps.length)
    }
    expect(disp(7)).toBeLessThan(disp(1))
  })

  it('un puntaje altísimo da probabilidad alta y uno bajo, baja', () => {
    expect(probExcelente(95, 1)!).toBeGreaterThan(0.9)
    expect(probExcelente(40, 1)!).toBeLessThan(0.1)
  })

  it('nunca devuelve algo fuera de 0..1', () => {
    for (const s of [0, 20, 50, 75, 100, 140]) {
      for (const d of [0, 1, 4, 7, 20]) {
        const p = probExcelente(s, d)!
        expect(p).toBeGreaterThanOrEqual(0)
        expect(p).toBeLessThanOrEqual(1)
      }
    }
  })

  it('el texto y la frase no se contradicen', () => {
    // Si el número dice 80 % la frase no puede decir "difícil".
    for (const s of [50, 65, 75, 85]) {
      const p = probExcelente(s, 3)!
      const frase = fraseProb(p)
      if (p >= 0.75) expect(frase).toMatch(/Casi seguro/)
      if (p < 0.1) expect(frase).toMatch(/Muy difícil/)
      expect(textoProb(s, 3)).toBe(`${Math.round(p * 100)} %`)
    }
  })
})

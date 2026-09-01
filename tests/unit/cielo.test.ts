// Cómo se describe el cielo de un día entero.
//
// El bug que arregla: la nubosidad que entra es el PROMEDIO de la
// jornada y la lluvia es el MÁXIMO. Las dos correctas, pero juntas sin
// matiz se contradicen — la app llegó a mostrar "despejado · lluvia
// 69 %", que es justo lo que no hay que decirle a alguien decidiendo si
// sale al mar.

import { describe, it, expect } from 'vitest'
import { textoCieloDia } from '../../src/lib/wmo'

describe('el cielo del día', () => {
  it('sin dato de nubes no inventa nada', () => {
    expect(textoCieloDia(null, 80)).toBe('—')
  })

  it('cielo abierto y sin lluvia: despejado', () => {
    expect(textoCieloDia(10, 5)).toBe('despejado')
    expect(textoCieloDia(25, null)).toBe('despejado')
  })

  it('nubosidad media: sol parcial', () => {
    expect(textoCieloDia(40, 10)).toBe('sol parcial')
  })

  it('cerrado: nublado', () => {
    expect(textoCieloDia(80, 10)).toBe('nublado')
    expect(textoCieloDia(80, 90)).toBe('nublado')
  })

  it('NO dice "despejado" con la lluvia más probable que no', () => {
    // El caso real: 1-sep-2026, promedio de nubes bajo y 69 % de
    // probabilidad. En lluviosa el patrón es sol de mañana y chubasco
    // de tarde, y hay que llamarlo por su nombre.
    expect(textoCieloDia(15, 69)).toBe('sol y chubascos')
    expect(textoCieloDia(45, 80)).toBe('sol y chubascos')
  })

  it('con lluvia posible pero no probable, se queda con el cielo', () => {
    // 50 % o menos no alcanza para cambiar la descripción del día.
    expect(textoCieloDia(15, 50)).toBe('despejado')
    expect(textoCieloDia(15, 35)).toBe('despejado')
  })

  it('nunca se contradice: si dice despejado, la lluvia no es probable', () => {
    for (let nubes = 0; nubes <= 100; nubes += 5) {
      for (let prob = 0; prob <= 100; prob += 5) {
        const t = textoCieloDia(nubes, prob)
        if (t === 'despejado' || t === 'sol parcial') {
          expect(prob).toBeLessThanOrEqual(50)
        }
      }
    }
  })
})

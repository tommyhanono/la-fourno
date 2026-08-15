import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  bloquesCorredor,
  mejoresVentanas,
  resumenSemanal,
  diasPlaya,
} from '../../src/lib/ventanas'
import { datosSinteticos, DIA_BASE } from '../fixtures/genera'
import { horaPanama, claveDia } from '../../src/lib/time'

beforeEach(() => {
  // "ahora" = lunes 5:00 am Panamá del set sintético
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${DIA_BASE}T05:00:00-05:00`))
})

afterEach(() => vi.useRealTimers())

describe('bloques del corredor', () => {
  it('solo genera bloques con luz de día', () => {
    const bloques = bloquesCorredor(datosSinteticos())
    expect(bloques.length).toBeGreaterThan(10)
    for (const b of bloques) {
      const h = horaPanama(b.inicio)
      expect(h).toBeGreaterThanOrEqual(6)
      expect(h).toBeLessThanOrEqual(16)
    }
  })

  it('no genera bloques ya pasados', () => {
    vi.setSystemTime(new Date(`${DIA_BASE}T15:00:00-05:00`))
    const bloques = bloquesCorredor(datosSinteticos())
    for (const b of bloques) {
      expect(b.fin.getTime()).toBeGreaterThan(Date.now())
    }
  })

  it('los bloques de tormenta salen con peligro', () => {
    const bloques = bloquesCorredor(datosSinteticos())
    const miercolesMediodia = bloques.find(
      (b) => claveDia(b.inicio) === '2026-08-12' && horaPanama(b.inicio) === 12,
    )
    expect(miercolesMediodia).toBeDefined()
    expect(miercolesMediodia!.score.peligro).toBe(true)
  })
})

describe('mejores ventanas', () => {
  it('devuelve 3 ventanas ordenadas por fecha, sin peligro', () => {
    const vs = mejoresVentanas(bloquesCorredor(datosSinteticos()))
    expect(vs).toHaveLength(3)
    for (let i = 1; i < vs.length; i++) {
      expect(vs[i].inicio.getTime()).toBeGreaterThan(vs[i - 1].inicio.getTime())
    }
    for (const v of vs) expect(v.score.peligro).toBe(false)
  })

  it('prefiere las mañanas calmas (el viento manda)', () => {
    const vs = mejoresVentanas(bloquesCorredor(datosSinteticos()))
    for (const v of vs) {
      expect(horaPanama(v.inicio)).toBeLessThanOrEqual(10)
    }
  })

  it('evita el viernes ventoso', () => {
    const vs = mejoresVentanas(bloquesCorredor(datosSinteticos()))
    for (const v of vs) {
      expect(claveDia(v.inicio)).not.toBe('2026-08-14')
    }
  })

  it('máximo 2 ventanas por día y separadas ≥ 4 h', () => {
    const vs = mejoresVentanas(bloquesCorredor(datosSinteticos()), 3)
    const porDia = new Map<string, number>()
    for (const v of vs) {
      porDia.set(claveDia(v.inicio), (porDia.get(claveDia(v.inicio)) ?? 0) + 1)
    }
    for (const n of porDia.values()) expect(n).toBeLessThanOrEqual(2)
    const orden = [...vs].sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
    for (let i = 1; i < orden.length; i++) {
      expect(
        orden[i].inicio.getTime() - orden[i - 1].inicio.getTime(),
      ).toBeGreaterThanOrEqual(4 * 3600_000)
    }
  })

  it('sin datos de marea sigue dando ventanas (score parcial)', () => {
    const datos = datosSinteticos()
    datos.marine = datos.marine.map(() => null)
    const vs = mejoresVentanas(bloquesCorredor(datos))
    expect(vs.length).toBe(3)
    expect(vs[0].score.parcial).toBe(true)
  })
})

describe('resumen día por día', () => {
  it('cubre TODOS los días del pronóstico, incluso los feos', () => {
    const dias = resumenSemanal(bloquesCorredor(datosSinteticos()))
    // 8 días de pronóstico, todos con bloques de luz futuros a las 5 am
    expect(dias).toHaveLength(8)
    const claves = dias.map((d) => d.clave)
    expect(claves).toContain('2026-08-12') // miércoles de tormenta
    expect(claves).toContain('2026-08-14') // viernes ventoso
    expect(claves).toContain('2026-08-16') // el domingo que viene
    for (const d of dias) expect(d.mejorBloque).not.toBeNull()
  })

  it('viene ordenado cronológicamente y el mejor bloque manda por score', () => {
    const bloques = bloquesCorredor(datosSinteticos())
    const dias = resumenSemanal(bloques)
    for (let i = 1; i < dias.length; i++) {
      expect(dias[i].dia.getTime()).toBeGreaterThan(dias[i - 1].dia.getTime())
    }
    for (const d of dias) {
      const delDia = bloques.filter((b) => claveDia(b.inicio) === d.clave)
      const max = Math.max(...delDia.map((b) => b.score.total))
      expect(d.mejorBloque!.score.total).toBe(max)
    }
  })
})

describe('días de playa', () => {
  it('puntúa los 8 días para un punto de playa', () => {
    const dias = diasPlaya(datosSinteticos(), 'las-sirenas')
    expect(dias).toHaveLength(8)
    // miércoles con tormenta = día malo
    const miercoles = dias.find((d) => d.clave === '2026-08-12')!
    expect(miercoles.score.peligro).toBe(true)
    // lunes despejado por la mañana = decente
    const lunes = dias.find((d) => d.clave === '2026-08-10')!
    expect(lunes.score.total).toBeGreaterThan(miercoles.score.total)
  })
})

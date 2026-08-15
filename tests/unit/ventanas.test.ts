import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  bloquesCorredor,
  mejoresVentanas,
  jornadasSemana,
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

describe('jornadas día por día', () => {
  it('cubre TODOS los días del pronóstico, incluso los feos', () => {
    const dias = jornadasSemana(datosSinteticos())
    // 8 días de pronóstico, todos con jornada futura a las 5 am
    expect(dias).toHaveLength(8)
    const claves = dias.map((d) => d.clave)
    expect(claves).toContain('2026-08-12') // miércoles de tormenta
    expect(claves).toContain('2026-08-14') // viernes ventoso
    expect(claves).toContain('2026-08-16') // el domingo que viene
    for (let i = 1; i < dias.length; i++) {
      expect(dias[i].dia.getTime()).toBeGreaterThan(dias[i - 1].dia.getTime())
    }
  })

  it('cada día trae un mejor destino de navegación (nunca la marina)', () => {
    const dias = jornadasSemana(datosSinteticos())
    for (const d of dias) {
      expect(d.mejorDestino.tipo).toBe('nav')
      expect(d.mejorDestino.esSalida).toBeFalsy()
      // los puntos de consulta local no se proponen como destino
      expect(d.mejorDestino.soloReferencia).toBeFalsy()
      expect(d.destinos.map((x) => x.punto.id)).not.toContain('ocean-reef-islas')
      // el mejor destino encabeza la lista ordenada por score
      expect(d.destinos[0].punto.id).toBe(d.mejorDestino.id)
      for (let i = 1; i < d.destinos.length; i++) {
        expect(d.destinos[i].score.total).toBeLessThanOrEqual(
          d.destinos[i - 1].score.total,
        )
      }
    }
  })

  it('evalúa la jornada entera: la tormenta del mediodía mata el miércoles', () => {
    const dias = jornadasSemana(datosSinteticos())
    // La tormenta es 11 am – 3 pm: un bloque de 9-11 se le escaparía,
    // pero la jornada 9 am – 4 pm la agarra sí o sí (5 de 7 h > 35 %).
    const miercoles = dias.find((d) => d.clave === '2026-08-12')!
    expect(miercoles.score.peligro).toBe(true)
    expect(miercoles.tormentaDesde).not.toBeNull()
    expect(horaPanama(miercoles.tormentaDesde!)).toBe(11)
  })

  it('una tormenta corta penaliza proporcional pero NO mata el día', () => {
    const datos = datosSinteticos()
    // Solo 1 h de tormenta (2 pm) el jueves: 1/7 < 35 % → sin peligro.
    for (const f of datos.forecast) {
      for (let i = 0; i < f.hourly.time.length; i++) {
        if (f.hourly.time[i] === '2026-08-13T14:00') {
          f.hourly.weather_code[i] = 95
        }
      }
    }
    const jueves = jornadasSemana(datos).find((d) => d.clave === '2026-08-13')!
    expect(jueves.score.peligro).toBe(false)
    expect(jueves.score.total).toBeGreaterThan(0)
    const penal = jueves.score.contribuciones.find((c) => c.clave === 'tormenta')!
    expect(penal).toBeDefined()
    // 1 de 7 h del penal completo (60), no los 60 enteros
    expect(Math.abs(penal.puntos)).toBeLessThan(15)
    expect(jueves.score.total).toBeLessThan(
      jornadasSemana(datosSinteticos()).find((d) => d.clave === '2026-08-13')!.score
        .total,
    )
  })

  it('el rango del día es el medido, y encierra al número del score', () => {
    const dias = jornadasSemana(datosSinteticos())
    const lunes = dias[0]
    const { vientoMin, vientoMax, olaMin, olaMax } = lunes.rango
    // el rango es real: mín ≤ máx, y el valor ponderado del score cae dentro
    expect(vientoMin!).toBeLessThanOrEqual(vientoMax!)
    expect(lunes.entrada.vientoKt!).toBeGreaterThanOrEqual(vientoMin!)
    expect(lunes.entrada.vientoKt!).toBeLessThanOrEqual(vientoMax!)
    expect(olaMin!).toBeLessThanOrEqual(olaMax!)
    // el fixture sube el viento 1.1 kt/h desde las 7 am: la jornada
    // 9 am – 4 pm tiene que verse como un rango, no como un número
    expect(vientoMax! - vientoMin!).toBeGreaterThan(2)
    expect(lunes.sol).not.toBeNull()
    expect(horaPanama(lunes.sol!.sale)).toBe(6)
    // el fixture da el mismo clima a todos los puntos → empate declarado
    expect(lunes.parejo).toBe(true)
  })

  it('el viernes ventoso puntúa peor que un día normal', () => {
    const dias = jornadasSemana(datosSinteticos())
    const viernes = dias.find((d) => d.clave === '2026-08-14')!
    const jueves = dias.find((d) => d.clave === '2026-08-13')!
    expect(viernes.score.total).toBeLessThan(jueves.score.total)
  })

  it('la jornada de hoy ya terminada no aparece', () => {
    vi.setSystemTime(new Date(`${DIA_BASE}T17:00:00-05:00`)) // 5 pm
    const dias = jornadasSemana(datosSinteticos())
    expect(dias).toHaveLength(7)
    expect(dias[0].clave).toBe('2026-08-11')
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

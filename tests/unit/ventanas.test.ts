import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { jornadasSemana, diasPlaya } from '../../src/lib/ventanas'
import { datosSinteticos, DIA_BASE } from '../fixtures/genera'
import { horaPanama } from '../../src/lib/time'
import { PUNTOS } from '../../src/config/puntos'
import { CALIBRACION } from '../../src/config/calibracion'

beforeEach(() => {
  // "ahora" = lunes 5:00 am Panamá del set sintético
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${DIA_BASE}T05:00:00-05:00`))
})

afterEach(() => vi.useRealTimers())

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

  it('el rango del día existe de verdad: sale de la misma serie horaria', () => {
    // El mínimo y el máximo tienen que venir del corredor hora a hora
    // (el peor de salida y destino cada hora), no el mínimo de un punto
    // con el máximo de otro: eso daba rangos que no pasaban nunca.
    const datos = datosSinteticos()
    const lunes = jornadasSemana(datos)[0]
    const destino = lunes.mejorDestino.id
    const iSalida = PUNTOS.findIndex((p) => p.esSalida)
    const iDestino = PUNTOS.findIndex((p) => p.id === destino)
    const porHora: number[] = []
    for (let h = CALIBRACION.jornada.desdeHora; h < CALIBRACION.jornada.hastaHora; h++) {
      const clave = `${lunes.clave}T${String(h).padStart(2, '0')}:00`
      const vs = [iSalida, iDestino]
        .map((i) => {
          const f = datos.forecast[i]
          const k = f.hourly.time.indexOf(clave)
          return k >= 0 ? f.hourly.wind_speed_10m[k] : null
        })
        .filter((v): v is number => v != null)
      if (vs.length) porHora.push(Math.max(...vs))
    }
    expect(porHora.length).toBe(
      CALIBRACION.jornada.hastaHora - CALIBRACION.jornada.desdeHora,
    )
    expect(lunes.rango.vientoMin).toBeCloseTo(Math.min(...porHora), 6)
    expect(lunes.rango.vientoMax).toBeCloseTo(Math.max(...porHora), 6)
  })

  it('la forma del día dice temprano cuando el viento sube por la tarde', () => {
    // El fixture sube el viento a lo largo del día: la mañana tiene que
    // salir mejor que la tarde, sin inventar bloques con puntaje.
    const dias = jornadasSemana(datosSinteticos())
    const lunes = dias[0]
    expect(['temprano', 'tarde', 'parejo']).toContain(lunes.forma)
    expect(lunes.forma).toBe('temprano')
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

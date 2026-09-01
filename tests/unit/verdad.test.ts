// La verdad de campo no puede perder datos ni preguntar de más.
// Lo más delicado es el SNAPSHOT: si no se congela el pronóstico que
// estaba vigente, el registro no sirve para calibrar nada.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  archivarSemana,
  pronosticoDe,
  diaAPreguntar,
  guardarRegistro,
  leerRegistros,
  leerArchivo,
  resumir,
  DIAS_ATRAS,
} from '../../src/lib/verdad'
import { jornadasSemana } from '../../src/lib/ventanas'
import { scoreBloque } from '../../src/lib/score'
import { datosSinteticos, DIA_BASE } from '../fixtures/genera'

/** localStorage de mentira: jsdom no está en este proyecto. */
function memoriaLocal() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  } as Storage
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoriaLocal())
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${DIA_BASE}T05:00:00-05:00`))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const semana = () => jornadasSemana(datosSinteticos())

describe('archivo de pronósticos', () => {
  it('guarda la semana entera con la fecha en que se emitió', () => {
    const s = semana()
    const nuevos = archivarSemana(s)
    expect(nuevos.length).toBe(s.length)
    expect(nuevos.every((p) => p.emitidoEl === DIA_BASE)).toBe(true)
    expect(leerArchivo().length).toBe(s.length)
  })

  it('no archiva dos veces el mismo día', () => {
    archivarSemana(semana())
    const segunda = archivarSemana(semana())
    expect(segunda).toEqual([])
    expect(leerArchivo().length).toBe(semana().length)
  })

  it('vuelve a archivar al día siguiente, y ahí sí acumula', () => {
    archivarSemana(semana())
    const antes = leerArchivo().length
    vi.setSystemTime(new Date(`2026-08-11T05:00:00-05:00`))
    const nuevos = archivarSemana(semana())
    expect(nuevos.length).toBeGreaterThan(0)
    expect(leerArchivo().length).toBeGreaterThan(antes)
  })

  it('el resumen guarda los INSUMOS, para poder reproducir el score', () => {
    // Es lo que permite preguntarse después "¿con pesoPico en 0.35
    // habría acertado?". Sin la entrada solo se sabe que la app dijo 72.
    const r = resumir(semana()[0], DIA_BASE)
    expect(r.entrada).toBeDefined()
    expect(typeof r.entrada.vientoKt).toBe('number')
    expect(r.entrada).toHaveProperty('nubosidadPct')
    expect(r.entrada).toHaveProperty('olaM')
    expect(r.entrada).toHaveProperty('mareaRel')
    // y el score archivado tiene que ser reproducible con esa entrada
    expect(scoreBloque(r.entrada).total).toBe(r.score)
  })

  it('el resumen guarda el desglose, no solo el total', () => {
    // Sin el desglose no se puede saber QUÉ término falló, solo que el
    // número no dio. Eso no alcanza para mover una perilla.
    const r = resumir(semana()[0], DIA_BASE)
    expect(r.contribuciones.length).toBeGreaterThan(2)
    expect(r.contribuciones.some((c) => c.clave === 'viento')).toBe(true)
    expect(typeof r.score).toBe('number')
    expect(r.anticipacionDias).toBe(0)
  })

  it('recupera el pronóstico vigente de un día', () => {
    archivarSemana(semana())
    const p = pronosticoDe('2026-08-11')
    expect(p).toBeDefined()
    expect(p!.dia).toBe('2026-08-11')
    expect(p!.emitidoEl).toBe(DIA_BASE)
  })

  it('nunca devuelve un pronóstico emitido DESPUÉS del día', () => {
    // Uno emitido después ya sabría cómo salió la cosa: usarlo sería
    // hacer trampa contra uno mismo al calibrar.
    archivarSemana(semana())
    vi.setSystemTime(new Date('2026-08-13T05:00:00-05:00'))
    archivarSemana(semana())
    const p = pronosticoDe('2026-08-11')
    expect(p).toBeDefined()
    expect(p!.emitidoEl <= '2026-08-11').toBe(true)
  })
})

describe('a qué día se le pregunta', () => {
  it('a las 5 am no pregunta por hoy: la jornada no ha pasado', () => {
    const d = diaAPreguntar()
    expect(d).not.toBe(DIA_BASE)
  })

  it('después de las 4 pm sí pregunta por hoy', () => {
    vi.setSystemTime(new Date(`${DIA_BASE}T18:00:00-05:00`))
    expect(diaAPreguntar()).toBe(DIA_BASE)
  })

  it('no pregunta por un día ya contestado', () => {
    vi.setSystemTime(new Date(`${DIA_BASE}T18:00:00-05:00`))
    guardarRegistro(DIA_BASE, 'no-sali')
    expect(diaAPreguntar()).not.toBe(DIA_BASE)
  })

  it('con todo contestado no hay nada que preguntar y la fila no existe', () => {
    vi.setSystemTime(new Date(`${DIA_BASE}T18:00:00-05:00`))
    for (let i = 0; i <= DIAS_ATRAS; i++) {
      const d = new Date(new Date(`${DIA_BASE}T18:00:00-05:00`).getTime() - i * 86400_000)
      guardarRegistro(d.toISOString().slice(0, 10), 'no-sali')
    }
    expect(diaAPreguntar()).toBeNull()
  })

  it('nunca pregunta más atrás del límite: nadie se acuerda', () => {
    vi.setSystemTime(new Date(`${DIA_BASE}T18:00:00-05:00`))
    const d = diaAPreguntar()!
    const dias = Math.round(
      (new Date(`${DIA_BASE}T00:00:00-05:00`).getTime() -
        new Date(`${d}T00:00:00-05:00`).getTime()) /
        86400_000,
    )
    expect(dias).toBeLessThanOrEqual(DIAS_ATRAS)
  })
})

describe('guardar un registro', () => {
  it('congela el pronóstico vigente junto a la respuesta', () => {
    archivarSemana(semana())
    vi.setSystemTime(new Date('2026-08-12T18:00:00-05:00'))
    const r = guardarRegistro('2026-08-11', 'peor', { vientoRealKt: 18, nota: 'picado' })
    expect(r.pronostico).toBeDefined()
    expect(r.pronostico!.dia).toBe('2026-08-11')
    expect(r.vientoRealKt).toBe(18)
    expect(r.nota).toBe('picado')
  })

  it('sin archivo previo guarda igual, solo que sin snapshot', () => {
    // Vale más un registro manco que ninguno.
    const r = guardarRegistro(DIA_BASE, 'igual')
    expect(r.pronostico).toBeUndefined()
    expect(leerRegistros().length).toBe(1)
  })

  it('contestar dos veces el mismo día no duplica: manda el último', () => {
    guardarRegistro(DIA_BASE, 'peor')
    guardarRegistro(DIA_BASE, 'mejor')
    const rs = leerRegistros().filter((r) => r.dia === DIA_BASE)
    expect(rs.length).toBe(1)
    expect(rs[0].resultado).toBe('mejor')
  })

  it('la nota se recorta a 280 y el viento absurdo se descarta', () => {
    const r = guardarRegistro(DIA_BASE, 'igual', { nota: 'x'.repeat(400) })
    expect(r.nota!.length).toBe(280)
  })

  it('arranca sin sincronizar: el teléfono manda, la nube es respaldo', () => {
    const r = guardarRegistro(DIA_BASE, 'igual')
    expect(r.sincronizado).toBe(false)
  })

  it('si localStorage está roto no se cae la app', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('nope')
      },
      setItem: () => {
        throw new Error('nope')
      },
    } as unknown as Storage)
    expect(() => leerRegistros()).not.toThrow()
    expect(() => guardarRegistro(DIA_BASE, 'igual')).not.toThrow()
    expect(() => diaAPreguntar()).not.toThrow()
  })
})

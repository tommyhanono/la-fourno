// Los cinco momentos borde del manejo de tiempo.
//
// Ya salieron DOS bugs de la misma clase: asumir que el índice 0 de un
// arreglo de días es hoy. Un tercer parche no resuelve la clase de
// error, así que esto prueba la clase entera con el reloj congelado en
// los momentos donde el día cambia de identidad.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  ahoraPanama,
  hoyPanama,
  medianocheHoyPanama,
  claveDia,
  buscarDia,
  parsePanama,
} from '../../src/lib/time'
import { jornadasSemana, diasPlaya } from '../../src/lib/ventanas'
import { diaAPreguntar, archivarSemana, leerArchivo } from '../../src/lib/verdad'
import { datosSinteticos, DIA_BASE } from '../fixtures/genera'

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
  vi.useFakeTimers()
  vi.stubGlobal('localStorage', memoriaLocal())
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Congela el reloj en un instante dado en hora de Panamá. */
const congelar = (isoPanama: string) => vi.setSystemTime(new Date(`${isoPanama}-05:00`))

describe('los cinco momentos borde', () => {
  it('1. 23:58 — todavía es hoy, no mañana', () => {
    congelar(`${DIA_BASE}T23:58:00`)
    expect(hoyPanama()).toBe(DIA_BASE)
    expect(claveDia(ahoraPanama())).toBe(DIA_BASE)
    expect(claveDia(medianocheHoyPanama())).toBe(DIA_BASE)
  })

  it('2. 00:02 — ya es el día siguiente', () => {
    congelar('2026-08-11T00:02:00')
    expect(hoyPanama()).toBe('2026-08-11')
    // Y la anticipación se cuenta desde HOY, no desde el primer día del
    // arreglo, que sigue siendo el 10.
    const dias = jornadasSemana(datosSinteticos())
    const d11 = buscarDia(dias, '2026-08-11')
    expect(d11?.anticipacionDias).toBe(0)
  })

  it('3. salto de día con caché de AYER: el índice 0 ya no es hoy', () => {
    // El bug que salió dos veces. El fixture arranca el 10; con el reloj
    // en el 12, los primeros días del arreglo son de hace dos días.
    congelar('2026-08-12T09:30:00')

    // En PLAYA el riesgo está vivo: diasPlaya NO descarta días pasados,
    // así que su índice 0 es del 10 y tratarlo como "hoy" mentiría. Es
    // exactamente donde se repitió el bug.
    const playa = diasPlaya(datosSinteticos(), 'las-sirenas')
    expect(playa[0].clave).toBe('2026-08-10')
    expect(playa[0].clave).not.toBe(hoyPanama())
    expect(buscarDia(playa, hoyPanama())!.anticipacionDias).toBe(0)

    // En navegación, jornadasSemana sí descarta las jornadas
    // terminadas, así que el índice 0 CASUALMENTE coincide con hoy. Eso
    // es filtrado, no garantía: la anticipación se sigue contando por
    // fecha, y es lo único de lo que se puede depender.
    const dias = jornadasSemana(datosSinteticos())
    expect(buscarDia(dias, hoyPanama())!.anticipacionDias).toBe(0)
    expect(dias.every((d) => d.clave >= hoyPanama())).toBe(true)
  })

  it('4. el proveedor entrega en UTC y aun así el día es el de Panamá', () => {
    // 2026-08-11T02:00Z son todavía las 21:00 del día 10 en Panamá.
    // Si algo leyera el día con el reloj UTC, se adelantaría un día.
    vi.setSystemTime(new Date('2026-08-11T02:00:00Z'))
    expect(hoyPanama()).toBe('2026-08-10')
    // parsePanama interpreta las horas de la API como Panamá, no como
    // la zona del dispositivo.
    expect(parsePanama('2026-08-10T21:00').toISOString()).toBe('2026-08-11T02:00:00.000Z')
  })

  it('5. arranque en frío justo después de medianoche', () => {
    // Sin nada en localStorage y a las 00:01: no puede reventar ni
    // preguntar por un día que todavía no terminó.
    congelar('2026-08-11T00:01:00')
    expect(() => jornadasSemana(datosSinteticos())).not.toThrow()
    const dias = jornadasSemana(datosSinteticos())
    expect(dias.length).toBeGreaterThan(0)
    // A las 00:01 la jornada de hoy no ha pasado: se pregunta por ayer.
    const pregunta = diaAPreguntar()
    expect(pregunta).not.toBe('2026-08-11')
    expect(pregunta).toBe('2026-08-10')
    // Y el archivo se escribe con la fecha de HOY, no la del primer día.
    archivarSemana(dias)
    expect(leerArchivo().every((p) => p.emitidoEl === '2026-08-11')).toBe(true)
  })
})

describe('nadie vuelve a indexar días por posición', () => {
  /** Todos los .ts/.tsx de src, recursivo. */
  function fuentes(dir: string): string[] {
    const out: string[] = []
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) out.push(...fuentes(p))
      else if (/\.tsx?$/.test(p)) out.push(p)
    }
    return out
  }

  it('no hay `[0]` sobre listas de días en src/', () => {
    // Guardia contra la clase de bug, no contra una instancia. Si algo
    // necesita "el primer día", que lo busque por fecha con `buscarDia`.
    const sospechosos: string[] = []
    const patron =
      /\b(dias|semana|jornadas|diasPlaya\([^)]*\)|jornadasSemana\([^)]*\))\s*\[\s*0\s*\]/
    for (const f of fuentes('src')) {
      const txt = readFileSync(f, 'utf8')
      txt.split('\n').forEach((linea, i) => {
        if (patron.test(linea)) sospechosos.push(`${f}:${i + 1}  ${linea.trim()}`)
      })
    }
    expect(sospechosos).toEqual([])
  })

  it('buscarDia encuentra por fecha y no se confunde con la posición', () => {
    const lista = [
      { clave: '2026-08-10', v: 'a' },
      { clave: '2026-08-11', v: 'b' },
    ]
    expect(buscarDia(lista, '2026-08-11')?.v).toBe('b')
    expect(buscarDia(lista, '2026-08-99')).toBeUndefined()
  })
})

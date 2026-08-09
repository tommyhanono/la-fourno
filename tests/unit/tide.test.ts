import { describe, it, expect } from 'vitest'
import { serieMarea, nivelEn, tendenciaEn, extremos, nivelRelativo } from '../../src/lib/tide'
import { parsePanama } from '../../src/lib/time'

// Marea sintética semidiurna tipo Balboa: período 12.42 h, amplitud 2 m.
// Pleamar exacta en t=0 (medianoche Panamá del 2026-08-10).
const PERIODO_H = 12.42
function nivelTeorico(horas: number): number {
  return 2 * Math.cos((2 * Math.PI * horas) / PERIODO_H)
}

function serieSintetica(dias = 2) {
  const times: string[] = []
  const niveles: number[] = []
  for (let h = 0; h < dias * 24; h++) {
    const d = new Date(Date.UTC(2026, 7, 10, h + 5)) // 05 UTC = 00 Panamá
    const iso = new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 16)
    times.push(iso)
    niveles.push(nivelTeorico(h))
  }
  return serieMarea(times, niveles)
}

describe('marea estimada', () => {
  it('interpola el nivel entre horas', () => {
    const s = serieSintetica()
    const t = parsePanama('2026-08-10T00:30')
    const v = nivelEn(s, t)!
    expect(v).toBeGreaterThan(nivelTeorico(1))
    expect(v).toBeLessThan(nivelTeorico(0))
  })

  it('detecta pleamares y bajamares con error < 25 min', () => {
    const s = serieSintetica()
    const ext = extremos(
      s,
      parsePanama('2026-08-10T00:00'),
      parsePanama('2026-08-11T00:00'),
    )
    // en 24 h de marea semidiurna: 3-4 extremos
    expect(ext.length).toBeGreaterThanOrEqual(3)
    expect(ext.length).toBeLessThanOrEqual(4)
    // la primera bajamar teórica cae en t = PERIODO/2 = 6.21 h
    const bajamar = ext.find((e) => e.tipo === 'bajamar')!
    const teoricoMs = parsePanama('2026-08-10T00:00').getTime() + (PERIODO_H / 2) * 3600_000
    expect(Math.abs(bajamar.time.getTime() - teoricoMs)).toBeLessThan(25 * 60_000)
    expect(bajamar.nivel).toBeCloseTo(-2, 1)
  })

  it('alterna pleamar/bajamar', () => {
    const s = serieSintetica()
    const ext = extremos(
      s,
      parsePanama('2026-08-10T00:00'),
      parsePanama('2026-08-12T00:00'),
    )
    for (let i = 1; i < ext.length; i++) {
      expect(ext[i].tipo).not.toBe(ext[i - 1].tipo)
    }
  })

  it('tendencia llenando/vaciando', () => {
    const s = serieSintetica()
    // justo después de la pleamar de t=0 → vaciando
    expect(tendenciaEn(s, parsePanama('2026-08-10T01:00'))).toBe('vaciando')
    // subiendo hacia la pleamar de t≈12.42 → llenando
    expect(tendenciaEn(s, parsePanama('2026-08-10T10:00'))).toBe('llenando')
  })

  it('nivel relativo 0..1', () => {
    const s = serieSintetica()
    const enPleamar = nivelRelativo(s, parsePanama('2026-08-10T12:25'))!
    const enBajamar = nivelRelativo(s, parsePanama('2026-08-10T06:13'))!
    expect(enPleamar).toBeGreaterThan(0.9)
    expect(enBajamar).toBeLessThan(0.1)
  })

  it('datos con huecos (null) no revientan ni inventan extremos', () => {
    const s = serieSintetica()
    const conHuecos = serieMarea(
      s.times.map((t) => t.toISOString?.() ?? '') as unknown as string[],
      [],
    )
    // serie vacía
    expect(extremos(conHuecos, new Date(0), new Date())).toEqual([])

    const times: string[] = []
    const niveles: (number | null)[] = []
    for (let h = 0; h < 24; h++) {
      times.push(`2026-08-10T${String(h).padStart(2, '0')}:00`)
      niveles.push(h >= 6 && h <= 9 ? null : nivelTeorico(h))
    }
    const s2 = serieMarea(times, niveles)
    const ext = extremos(s2, parsePanama('2026-08-10T00:00'), parsePanama('2026-08-11T00:00'))
    for (const e of ext) {
      expect(Number.isFinite(e.nivel)).toBe(true)
    }
    expect(nivelEn(s2, parsePanama('2026-08-10T07:30'))).toBeNull()
  })
})

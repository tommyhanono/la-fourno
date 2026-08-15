import { describe, it, expect } from 'vitest'
import {
  fmtViento,
  fmtOla,
  fmtTemp,
  fmtMarea,
  refMarea,
  rumbo,
  procedencia,
  UNIDADES_DEFAULT,
} from '../../src/lib/units'

const u = UNIDADES_DEFAULT // kt / ft / °C

describe('unidades', () => {
  it('viento en nudos y km/h', () => {
    expect(fmtViento(10, u)).toBe('10 kt')
    expect(fmtViento(10, { ...u, viento: 'kmh' })).toBe('19 km/h')
  })

  it('ola en pies y metros', () => {
    expect(fmtOla(1, u)).toBe('3.3 ft')
    expect(fmtOla(1, { ...u, ola: 'm' })).toBe('1.0 m')
  })

  it('temperatura en °C y °F', () => {
    expect(fmtTemp(30, u)).toBe('30 °C')
    expect(fmtTemp(30, { ...u, temp: 'f' })).toBe('86 °F')
  })

  it('la marea siempre en metros', () => {
    expect(fmtMarea(4.35)).toBe('4.3 m')
    expect(fmtMarea(-0.8)).toBe('-0.8 m')
  })

  it('dato faltante muestra raya, nunca NaN', () => {
    expect(fmtViento(null, u)).toBe('—')
    expect(fmtOla(undefined, u)).toBe('—')
    expect(fmtTemp(NaN, u)).toBe('—')
    expect(fmtMarea(null)).toBe('—')
  })

  it('rumbos', () => {
    expect(rumbo(0)).toBe('N')
    expect(rumbo(225)).toBe('SO')
    expect(rumbo(359)).toBe('N')
    expect(rumbo(null)).toBe('—')
  })

  it('viento y ola se nombran por DONDE VIENEN, nunca al revés', () => {
    expect(procedencia(180)).toBe('del S')
    expect(procedencia(90)).toBe('del E')
    expect(procedencia(null)).toBe('—')
  })

  it('la marea dice respecto a qué: un número solo no significa nada', () => {
    expect(refMarea(2.1)).toBe('sobre el nivel medio')
    expect(refMarea(-1.9)).toBe('bajo el nivel medio')
    expect(refMarea(0.02)).toBe('en el nivel medio')
    expect(refMarea(null)).toBeUndefined()
  })
})

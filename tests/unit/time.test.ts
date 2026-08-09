import { describe, it, expect } from 'vitest'
import { parsePanama, horaCorta, horaMuyCorta, claveDia, horaPanama } from '../../src/lib/time'

describe('hora de Panamá', () => {
  it('parsea ISO local de Panamá como UTC-5', () => {
    const d = parsePanama('2026-08-09T14:00')
    expect(d.toISOString()).toBe('2026-08-09T19:00:00.000Z')
  })

  it('formatea 12 horas como se habla en Panamá', () => {
    expect(horaCorta(parsePanama('2026-08-09T14:35'))).toBe('2:35 pm')
    expect(horaCorta(parsePanama('2026-08-09T00:05'))).toBe('12:05 am')
    expect(horaCorta(parsePanama('2026-08-09T12:00'))).toBe('12:00 pm')
    expect(horaMuyCorta(parsePanama('2026-08-09T06:00'))).toBe('6 am')
  })

  it('claveDia y horaPanama no dependen de la zona del dispositivo', () => {
    // 23:30 Panamá = 04:30 UTC del día siguiente
    const d = parsePanama('2026-08-09T23:30')
    expect(claveDia(d)).toBe('2026-08-09')
    expect(horaPanama(d)).toBe(23)
  })
})

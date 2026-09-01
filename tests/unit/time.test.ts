import { describe, it, expect } from 'vitest'
import {
  parsePanama,
  horaCorta,
  horaMuyCorta,
  claveDia,
  horaPanama,
  indiceHoraActual,
} from '../../src/lib/time'

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

describe('la hora vigente de una serie', () => {
  const serie = [
    '2026-08-10T08:00',
    '2026-08-10T09:00',
    '2026-08-10T10:00',
    '2026-08-10T11:00',
  ]
  const t = (iso: string) => new Date(iso).getTime()

  it('toma la hora que ya empezó, no la que viene', () => {
    // A las 9:45 la hora vigente es la de las 9, no la de las 10.
    expect(indiceHoraActual(serie, t('2026-08-10T09:45:00-05:00'))).toBe(1)
  })

  it('justo en el cambio de hora ya cuenta la nueva', () => {
    expect(indiceHoraActual(serie, t('2026-08-10T10:00:00-05:00'))).toBe(2)
  })

  it('si toda la serie es futura, devuelve la primera', () => {
    // Pasa si el pronóstico empieza mañana. Es lo más cercano que hay.
    expect(indiceHoraActual(serie, t('2026-08-10T06:00:00-05:00'))).toBe(0)
  })

  it('si toda la serie es pasada, devuelve la última', () => {
    // Caché muy viejo. La app avisa aparte de que el dato está viejo;
    // acá no se puede hacer mejor que mostrar lo último que hubo.
    expect(indiceHoraActual(serie, t('2026-08-12T06:00:00-05:00'))).toBe(3)
  })

  it('con serie vacía no revienta', () => {
    expect(indiceHoraActual([], t('2026-08-10T09:00:00-05:00'))).toBe(0)
  })
})

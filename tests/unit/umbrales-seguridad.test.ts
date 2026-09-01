// Los umbrales de seguridad tienen que disparar en una MINORÍA.
//
// La regla de la casa: el aviso que sale siempre no informa. Un umbral
// que marca la mitad de los días deja de ser una señal y pasa a ser
// papel tapiz — el usuario aprende a ignorarlo, y el día que de verdad
// importa también lo ignora.
//
// Esto se mide sobre PRONÓSTICOS HISTÓRICOS REALES, no sobre ERA5: el
// archivo de reanálisis no trae CAPE ni códigos de tormenta, así que
// con él estos tres términos no se podían ejercitar. Fue justo por eso
// que el umbral de CAPE pasó meses mal puesto.

import { describe, it, expect } from 'vitest'
import { CALIBRACION } from '../../src/config/calibracion'
import fixture from '../fixtures/umbrales-seguridad.json'

interface DiaLluviosa {
  dia: string
  capeTipico: number
  tormentaFrac: number
  probMax: number
  lluviaTipica: number
}
interface DiaSeca {
  dia: string
  capeTipico: number
  tormentaFrac: number
}

const lluviosa = fixture.lluviosa as DiaLluviosa[]
const seca = fixture.seca as DiaSeca[]
const S = CALIBRACION.seguridad
const pct = (n: number, total: number) => (100 * n) / total

/** El CAPE solo aplica cuando el modelo NO declaró tormenta. */
const capeDispara = (d: { capeTipico: number; tormentaFrac: number }) =>
  d.tormentaFrac === 0 && d.capeTipico > S.capeAltoJkg

describe('los umbrales de seguridad no son papel tapiz', () => {
  it('el fixture cubre las dos temporadas con muestra suficiente', () => {
    expect(lluviosa.length).toBeGreaterThanOrEqual(80)
    expect(seca.length).toBeGreaterThanOrEqual(55)
  })

  it('CAPE: dispara en menos del 25 % de los días de lluviosa', () => {
    // Con el umbral viejo de 2500 esto daba 44 %: el aviso salía casi
    // un día sí y otro no. El trópico corre CAPE alto de rutina, así
    // que un umbral pensado para latitudes medias no sirve acá.
    const n = lluviosa.filter(capeDispara).length
    expect(pct(n, lluviosa.length)).toBeLessThan(25)
  })

  it('CAPE: pero tampoco está muerto, marca algo en lluviosa', () => {
    // Si no disparara nunca sería una perilla decorativa, que es el
    // otro extremo del mismo error.
    expect(lluviosa.filter(capeDispara).length).toBeGreaterThan(0)
  })

  it('CAPE: queda dormido en temporada seca, y está bien', () => {
    // 60 días de seca sin una sola tormenta y CAPE mediano de ~1000:
    // no hay convección que avisar. Un aviso ahí sería ruido puro.
    const n = seca.filter(capeDispara).length
    expect(pct(n, seca.length)).toBeLessThan(5)
    expect(seca.every((d) => d.tormentaFrac === 0)).toBe(true)
  })

  it('la bandera de tormenta es rara: es una raya dura, no un semáforo', () => {
    const n = lluviosa.filter((d) => d.tormentaFrac >= S.tormentaPeligroFrac).length
    expect(pct(n, lluviosa.length)).toBeLessThan(10)
  })

  it('pero la tormenta SÍ se cuenta cuando aparece, aunque no marque bandera', () => {
    // 35 % de los días de lluviosa tienen algo de tormenta en la
    // jornada. Esos no se ignoran: penalizan en proporción a las horas
    // que ocupan. Lo raro debe ser la BANDERA, no el castigo.
    const conAlgo = lluviosa.filter((d) => d.tormentaFrac > 0).length
    expect(conAlgo).toBeGreaterThan(lluviosa.length * 0.2)
  })

  it('lluvia fuerte: minoría clara', () => {
    const n = lluviosa.filter((d) => d.lluviaTipica >= S.lluviaFuerteMmH).length
    expect(pct(n, lluviosa.length)).toBeLessThan(15)
  })

  it('la probabilidad de lluvia NO es una raya dura, y por eso puede ser frecuente', () => {
    // Sale en el 92 % de los días de lluviosa, y está bien: el castigo
    // es PROPORCIONAL (12 pts × prob/100), así que 22 % resta 2.6 y
    // 100 % resta 12. Discrimina por magnitud, no por sí o no. Si
    // alguna vez se convierte en umbral, hay que remedirlo.
    const conPenal = lluviosa.filter((d) => d.probMax > 20).length
    expect(pct(conPenal, lluviosa.length)).toBeGreaterThan(50)
    expect(CALIBRACION.sol.probLluviaPenalMax).toBeLessThan(15)
  })
})

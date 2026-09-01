// Qué pasa cuando la API no manda todo.
//
// El problema que resuelve: antes, un día sin dato de mar perdía 25
// puntos de arranque (ola 15 + marea 10) y salía compitiendo contra
// días completos como si nada. Nunca podía ganar, y la razón no tenía
// que ver con el clima. Peor: mostraba un número que parecía normal.

import { describe, it, expect } from 'vitest'
import { scoreBloque, scorePlaya, faltaDatoCritico, type EntradaBloque } from '../../src/lib/score'
import { CALIBRACION } from '../../src/config/calibracion'

const DIA_PERFECTO: EntradaBloque = {
  vientoKt: 4,
  rachaKt: 6,
  nubosidadPct: 10,
  probLluviaPct: 5,
  lluviaMmH: 0,
  olaM: 0.3,
  periodoS: 9,
  weatherCodes: [0],
  tormentaFrac: 0,
  capeJkg: 500,
  mareaRel: 0.6,
  mareaTendencia: 'llenando',
}

describe('score con datos incompletos', () => {
  it('con todos los datos no falta nada', () => {
    const r = scoreBloque(DIA_PERFECTO)
    expect(r.parcial).toBe(false)
    expect(r.faltan).toEqual([])
    expect(r.pesoFaltante).toBe(0)
    expect(faltaDatoCritico(r)).toBe(false)
  })

  it('sin API marina se pierden exactamente ola + marea', () => {
    const r = scoreBloque({ ...DIA_PERFECTO, olaM: null, mareaRel: null })
    expect(r.faltan).toEqual(['ola', 'marea'])
    expect(r.pesoFaltante).toBe(CALIBRACION.pesos.ola + CALIBRACION.pesos.marea)
  })

  it('sin mar el día NO se marca como sin dato: viento y sol siguen sirviendo', () => {
    // 25 puntos de 100 es mucho, pero lo que queda es justo de lo que
    // Tommy decide. Taparlo sería peor que mostrarlo con su salvedad.
    const r = scoreBloque({ ...DIA_PERFECTO, olaM: null, mareaRel: null })
    expect(faltaDatoCritico(r)).toBe(false)
    expect(r.total).toBeGreaterThan(0)
  })

  it('sin viento sí es dato crítico: el número sería decorado', () => {
    const r = scoreBloque({ ...DIA_PERFECTO, vientoKt: null })
    expect(r.faltan).toContain('viento')
    expect(faltaDatoCritico(r)).toBe(true)
  })

  it('sin cielo también', () => {
    const r = scoreBloque({ ...DIA_PERFECTO, nubosidadPct: null })
    expect(r.faltan).toContain('cielo')
    expect(faltaDatoCritico(r)).toBe(true)
  })

  it('el peso que falta nunca supera 100 ni baja de 0', () => {
    const vacio = scoreBloque({
      ...DIA_PERFECTO,
      vientoKt: null,
      nubosidadPct: null,
      olaM: null,
      mareaRel: null,
    })
    expect(vacio.pesoFaltante).toBe(100)
    expect(vacio.faltan).toEqual(['viento', 'cielo', 'ola', 'marea'])
    expect(vacio.total).toBe(0)
  })

  it('la seguridad sigue funcionando aunque falten datos', () => {
    // Lo más importante: que un dato faltante NO apague una bandera.
    const r = scoreBloque({
      ...DIA_PERFECTO,
      nubosidadPct: null,
      olaM: null,
      mareaRel: null,
      vientoKt: 30,
    })
    expect(r.peligro).toBe(true)
    expect(r.contribuciones.some((c) => c.clave === 'viento-peligroso')).toBe(true)
  })

  it('el score de playa también dice qué le faltó', () => {
    const r = scorePlaya({
      nubosidadPct: null,
      probLluviaPct: 10,
      vientoKt: 8,
      weatherCodes: [0],
    })
    expect(r.faltan).toEqual(['cielo'])
    expect(r.pesoFaltante).toBe(CALIBRACION.playa.pesos.sol)
    expect(r.parcial).toBe(true)
  })
})

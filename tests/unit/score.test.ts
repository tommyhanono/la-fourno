import { describe, it, expect } from 'vitest'
import { scoreBloque, scorePlaya, type EntradaBloque } from '../../src/lib/score'
import { CALIBRACION } from '../../src/config/calibracion'

const base: EntradaBloque = {
  vientoKt: 5,
  rachaKt: 8,
  nubosidadPct: 10,
  probLluviaPct: 5,
  lluviaMmH: 0,
  olaM: 0.4,
  periodoS: 14,
  weatherCodes: [0, 0],
  capeJkg: 300,
  mareaRel: 0.7,
  mareaTendencia: 'llenando',
}

describe('scoreBloque — casos borde', () => {
  it('calma total con sol da score alto (≥85)', () => {
    const r = scoreBloque(base)
    expect(r.total).toBeGreaterThanOrEqual(85)
    expect(r.peligro).toBe(false)
    expect(r.parcial).toBe(false)
  })

  it('viento fuerte con sol perfecto da score bajo: el viento manda', () => {
    const r = scoreBloque({ ...base, vientoKt: 25, rachaKt: 33 })
    // pierde los 45 del viento y la penalización de rachas
    expect(r.total).toBeLessThan(55)
    const viento = r.contribuciones.find((c) => c.clave === 'viento')
    expect(viento?.puntos).toBe(0)
  })

  it('tormenta eléctrica con mar plano mata el bloque', () => {
    const r = scoreBloque({ ...base, weatherCodes: [0, 95] })
    expect(r.peligro).toBe(true)
    expect(r.total).toBeLessThan(45)
    expect(r.contribuciones.some((c) => c.clave === 'tormenta')).toBe(true)
  })

  it('el score distingue días parecidos: interpola, no salta por cajones', () => {
    // Tres días que antes caían todos en el mismo tramo y daban el
    // mismo número. Ahora tienen que ordenarse de mejor a peor.
    const a = scoreBloque({ ...base, vientoKt: 9, rachaKt: 11 })
    const b = scoreBloque({ ...base, vientoKt: 10.5, rachaKt: 12 })
    const c = scoreBloque({ ...base, vientoKt: 12, rachaKt: 14 })
    expect(a.total).toBeGreaterThan(b.total)
    expect(b.total).toBeGreaterThan(c.total)
    // los anclajes de la calibración se respetan tal cual
    const enAnclaje = scoreBloque({ ...base, vientoKt: 5, rachaKt: 8 })
    const viento = enAnclaje.contribuciones.find((x) => x.clave === 'viento')!
    expect(viento.puntos).toBe(CALIBRACION.pesos.viento) // frac 1.0 exacto
  })

  it('tormentaFrac escala el castigo sin cambiar los bloques de 2 h', () => {
    const conTormenta = { ...base, weatherCodes: [0, 95] }
    const completo = scoreBloque(conTormenta)
    const corta = scoreBloque({ ...conTormenta, tormentaFrac: 1 / 7 })
    const larga = scoreBloque({ ...conTormenta, tormentaFrac: 5 / 7 })
    // sin el campo, nada cambia: la tormenta pesa completa y es peligro
    expect(completo.peligro).toBe(true)
    const penalCompleto = completo.contribuciones.find((c) => c.clave === 'tormenta')!
    expect(penalCompleto.puntos).toBe(-CALIBRACION.seguridad.tormentaPenal)
    // 1 de 7 h: penaliza poco y NO marca peligro (< 35 %)
    expect(corta.peligro).toBe(false)
    expect(corta.total).toBeGreaterThan(completo.total)
    // 5 de 7 h: sí es peligro y castiga fuerte
    expect(larga.peligro).toBe(true)
    expect(larga.total).toBeLessThan(corta.total)
  })

  it('la curva respeta EXACTAMENTE cada anclaje de la calibración', () => {
    // Este es el contrato con calibracion.ts: los números que Tommy
    // ajustó a mano tienen que salir tal cual en su propio valor. Entre
    // anclajes se interpola, pero en el anclaje no se negocia.
    for (const a of CALIBRACION.viento.curva) {
      const r = scoreBloque({ ...base, vientoKt: a.kt, rachaKt: a.kt })
      const viento = r.contribuciones.find((c) => c.clave === 'viento')!
      expect(viento.puntos).toBeCloseTo(
        Math.round(CALIBRACION.pesos.viento * a.frac * 10) / 10,
        6,
      )
    }
  })

  it('la curva nunca sube al subir el viento (monótona) y no se extrapola', () => {
    let previo = Infinity
    for (let kt = 0; kt <= 40; kt += 0.25) {
      const r = scoreBloque({ ...base, vientoKt: kt, rachaKt: kt })
      const pts = r.contribuciones.find((c) => c.clave === 'viento')!.puntos
      expect(pts).toBeLessThanOrEqual(previo + 1e-9)
      expect(pts).toBeGreaterThanOrEqual(0)
      previo = pts
    }
  })

  it('viento de peligro marca bandera aunque el resto del día esté perfecto', () => {
    const kt = CALIBRACION.seguridad.vientoPeligrosoKt
    const justoDebajo = scoreBloque({ ...base, vientoKt: kt - 0.5, rachaKt: kt - 0.5 })
    const enLaRaya = scoreBloque({ ...base, vientoKt: kt, rachaKt: kt })
    expect(justoDebajo.peligro).toBe(false)
    expect(enLaRaya.peligro).toBe(true)
    // la bandera explica por qué, y no falsea el total
    const bandera = enLaRaya.contribuciones.find((c) => c.clave === 'viento-peligroso')!
    expect(bandera.tipo).toBe('bandera')
    expect(bandera.puntos).toBe(0)
  })

  it('una tormenta corta no borra el peligro que ya marcó el viento', () => {
    // La asignación de la tormenta pisaba el peligro anterior: un día de
    // 25 kt con un chubasco de 1 h salía "sin peligro".
    const r = scoreBloque({
      ...base,
      vientoKt: 25,
      rachaKt: 27,
      weatherCodes: [0, 95],
      tormentaFrac: 1 / 7,
    })
    expect(r.peligro).toBe(true)
  })

  it('todos los datos faltantes: score 0 sin reventar, marcado parcial', () => {
    const r = scoreBloque({
      vientoKt: null,
      rachaKt: null,
      nubosidadPct: null,
      probLluviaPct: null,
      lluviaMmH: null,
      olaM: null,
      periodoS: null,
      weatherCodes: [],
      capeJkg: null,
      mareaRel: null,
      mareaTendencia: null,
    })
    expect(r.parcial).toBe(true)
    expect(r.total).toBe(0)
    expect(Number.isFinite(r.total)).toBe(true)
  })

  it('sin dato de marea el score sigue siendo utilizable (factor menor)', () => {
    const r = scoreBloque({ ...base, mareaRel: null, mareaTendencia: null })
    expect(r.parcial).toBe(true)
    // pierde como mucho el peso de marea + bono
    const completo = scoreBloque(base)
    expect(completo.total - r.total).toBeLessThanOrEqual(
      CALIBRACION.pesos.marea + CALIBRACION.marea.llenandoBono,
    )
    expect(r.total).toBeGreaterThan(70)
  })

  it('mar corto y picado penaliza aunque haya sol', () => {
    const r = scoreBloque({ ...base, olaM: 1.2, periodoS: 5 })
    expect(r.contribuciones.some((c) => c.clave === 'mar-corto')).toBe(true)
  })

  it('ola peligrosa marca bandera de peligro', () => {
    const r = scoreBloque({ ...base, olaM: 2.2, periodoS: 8 })
    expect(r.peligro).toBe(true)
  })

  it('rachas muy por encima del sostenido restan', () => {
    const r = scoreBloque({ ...base, vientoKt: 8, rachaKt: 20 })
    expect(r.contribuciones.some((c) => c.clave === 'racha')).toBe(true)
  })

  it('marea vaciando a la llegada resta un poco', () => {
    const lleno = scoreBloque({ ...base, mareaTendencia: 'llenando' })
    const vacio = scoreBloque({ ...base, mareaTendencia: 'vaciando' })
    expect(vacio.total).toBeLessThan(lleno.total)
  })

  it('bajamar extrema en destino penaliza', () => {
    const r = scoreBloque({ ...base, mareaRel: 0.05 })
    expect(r.contribuciones.some((c) => c.clave === 'marea-baja')).toBe(true)
  })

  it('el desglose siempre suma (redondeado) el total', () => {
    for (const e of [
      base,
      { ...base, vientoKt: 25 },
      { ...base, weatherCodes: [95] },
      { ...base, olaM: 2.5, periodoS: 4 },
    ]) {
      const r = scoreBloque(e)
      const suma = r.contribuciones.reduce((a, c) => a + c.puntos, 0)
      expect(r.total).toBe(Math.max(0, Math.min(100, Math.round(suma))))
    }
  })

  it('el total nunca sale de 0..100', () => {
    const horrible = scoreBloque({
      ...base,
      vientoKt: 40,
      rachaKt: 60,
      nubosidadPct: 100,
      probLluviaPct: 100,
      lluviaMmH: 20,
      olaM: 4,
      periodoS: 3,
      weatherCodes: [99],
      capeJkg: 4000,
      mareaRel: 0.01,
      mareaTendencia: 'vaciando',
    })
    expect(horrible.total).toBe(0)
    const perfecto = scoreBloque(base)
    expect(perfecto.total).toBeLessThanOrEqual(100)
  })
})

describe('scorePlaya', () => {
  it('día despejado y brisa = día de playa alto', () => {
    const r = scorePlaya({
      nubosidadPct: 10,
      probLluviaPct: 5,
      vientoKt: 6,
      weatherCodes: [0],
    })
    expect(r.total).toBeGreaterThanOrEqual(85)
  })

  it('tormenta hunde el día de playa', () => {
    const r = scorePlaya({
      nubosidadPct: 10,
      probLluviaPct: 5,
      vientoKt: 6,
      weatherCodes: [95],
    })
    expect(r.peligro).toBe(true)
    expect(r.total).toBeLessThan(50)
  })

  it('sin datos: 0 y parcial, sin reventar', () => {
    const r = scorePlaya({
      nubosidadPct: null,
      probLluviaPct: null,
      vientoKt: null,
      weatherCodes: [],
    })
    expect(r.parcial).toBe(true)
    expect(r.total).toBe(0)
  })
})

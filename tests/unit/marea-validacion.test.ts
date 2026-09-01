// VALIDACIÓN EXTERNA DE LA MAREA
//
// Hasta ahora el único contraste contra una fuente de afuera era n=2:
// dos extremos de un día contra una tabla comercial. Esto lo sube a 355
// extremos en 3 meses, contra las predicciones armónicas OFICIALES de
// NOAA para Balboa (estación 9812501, datum MSL, dominio público).
//
// Balboa está a ~7 km de Marina Ocean Reef, así que compara el mismo
// pedazo de mar. El datum coincide: NOAA se pide en MSL y CMEMS
// devuelve `sea_level_height_msl`.
//
// Corre offline contra un fixture (tests/fixtures/marea-balboa.json).
// Es una prueba de REGRESIÓN: si alguien toca la detección de extremos
// y la empeora, esto falla. Los números de los límites salen de la
// medición del 1-sep-2026 y están anotados en ACCURACY.md.

import { describe, it, expect } from 'vitest'
import { serieMarea, extremos } from '../../src/lib/tide'
import fixture from '../fixtures/marea-balboa.json'

interface ExtremoNoaa {
  t: string
  nivel: number
  tipo: 'pleamar' | 'bajamar'
}

/** La serie es horaria y contigua: los tiempos se reconstruyen del inicio. */
function tiempos(): string[] {
  const base = new Date(`${fixture.desde}:00-05:00`).getTime()
  return fixture.niveles.map((_, i) => {
    const d = new Date(base + i * 3600_000 - 5 * 3600_000)
    return `${d.toISOString().slice(0, 13)}:00`
  })
}

const serie = serieMarea(tiempos(), fixture.niveles)
const noaa = fixture.extremosNoaa as ExtremoNoaa[]

/**
 * Empareja cada extremo oficial con el del modelo más cercano EN TIEMPO
 * y del mismo tipo. Descarta los de los bordes de la ventana, donde el
 * modelo no puede tener el par.
 */
function emparejados() {
  const desde = serie.times[12]
  const hasta = serie.times[serie.times.length - 13]
  const mios = extremos(serie, desde, hasta)
  const out: { dtMin: number; dNivel: number; tipo: string }[] = []
  for (const e of noaa) {
    const t = new Date(`${e.t}:00-05:00`).getTime()
    if (t < desde.getTime() || t > hasta.getTime()) continue
    let mejor: (typeof mios)[number] | null = null
    let mejorDt = Infinity
    for (const m of mios) {
      if (m.tipo !== e.tipo) continue
      const dt = Math.abs(m.time.getTime() - t)
      if (dt < mejorDt) {
        mejorDt = dt
        mejor = m
      }
    }
    // Más de 3 h de diferencia no es "el mismo extremo": es que faltó.
    if (!mejor || mejorDt > 3 * 3600_000) continue
    out.push({
      dtMin: (mejor.time.getTime() - t) / 60_000,
      dNivel: mejor.nivel - e.nivel,
      tipo: e.tipo,
    })
  }
  return out
}

const pares = emparejados()
const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const pct = (xs: number[], f: number) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(f * (s.length - 1))]
}
const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

describe('la marea estimada contra la tabla oficial de Balboa', () => {
  it('encuentra casi todos los extremos oficiales', () => {
    // Si la detección se rompe, lo primero que pasa es que deja de
    // aparear. 90 % es holgado y aun así atrapa una regresión seria.
    expect(pares.length).toBeGreaterThan(noaa.length * 0.9)
  })

  it('el desfase típico queda en pocos minutos', () => {
    // Sin la corrección de `marea.desfaseModeloMin` esto daba 27.0.
    const abs = pares.map((p) => Math.abs(p.dtMin))
    expect(mediana(abs)).toBeLessThan(8)
  })

  it('ni el 10 % peor se pasa de 15 min', () => {
    // Sin corrección: 35.0 min.
    const abs = pares.map((p) => Math.abs(p.dtMin))
    expect(pct(abs, 0.9)).toBeLessThan(15)
  })

  it('el peor caso de tres meses no llega a media hora', () => {
    const abs = pares.map((p) => Math.abs(p.dtMin))
    expect(Math.max(...abs)).toBeLessThan(30)
  })

  it('no queda sesgo sistemático de tiempo', () => {
    // Esto es lo que la autoconsistencia NO podía detectar: con el
    // modelo corrido media hora, el período y el ciclo sicigia-cuadratura
    // seguían dando perfectos. Hizo falta una fuente externa.
    // Si alguien pone `desfaseModeloMin` en 0, este test cae en −27.
    expect(Math.abs(media(pares.map((p) => p.dtMin)))).toBeLessThan(5)
  })

  it('pleamares y bajamares se comportan parecido', () => {
    // Un modelo que acierta las pleamares y erra las bajamares sería
    // peligroso justo donde importa: entrar con marea baja.
    const alt = pares.filter((p) => p.tipo === 'pleamar').map((p) => Math.abs(p.dtMin))
    const baj = pares.filter((p) => p.tipo === 'bajamar').map((p) => Math.abs(p.dtMin))
    expect(alt.length).toBeGreaterThan(100)
    expect(baj.length).toBeGreaterThan(100)
    expect(Math.abs(mediana(alt) - mediana(baj))).toBeLessThan(25)
  })

  it('la amplitud del ciclo es la correcta, aunque el nivel esté corrido', () => {
    // El sesgo de NIVEL entre datums no importa para la app: el score
    // usa nivel RELATIVO al rango del día, y el UI muestra la curva.
    // Lo que sí importaría es que el rango estuviera mal.
    const rangoNoaa = Math.max(...noaa.map((e) => e.nivel)) - Math.min(...noaa.map((e) => e.nivel))
    const rangoMio = Math.max(...fixture.niveles) - Math.min(...fixture.niveles)
    expect(Math.abs(rangoMio - rangoNoaa) / rangoNoaa).toBeLessThan(0.15)
  })
})

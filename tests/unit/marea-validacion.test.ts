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
  const out: { dtMin: number; dNivel: number; tipo: string; fecha: string }[] = []
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
      fecha: e.t.slice(0, 10),
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

describe('tabla de validación: 10 fechas contra NOAA', () => {
  it('en 10 fechas repartidas, el error de cada extremo está bajo 20 min', () => {
    // La muestra se toma repartida a lo largo de los 3 meses para que
    // caigan fechas de marea viva y de muerta, no diez seguidas.
    const porFecha = new Map<string, { dtMin: number; tipo: string }[]>()
    for (const p of pares) {
      const f = p.fecha
      if (!porFecha.has(f)) porFecha.set(f, [])
      porFecha.get(f)!.push({ dtMin: p.dtMin, tipo: p.tipo })
    }
    const fechas = [...porFecha.keys()].sort()
    const paso = Math.floor(fechas.length / 10)
    const muestra = Array.from({ length: 10 }, (_, i) => fechas[i * paso])

    console.log('\nVALIDACIÓN DE MAREA — modelo contra NOAA Balboa (9812501)\n')
    console.log('fecha        extremos   error de cada uno (min)   |peor|')
    console.log('-----------  --------   -----------------------   -----')
    let peorGlobal = 0
    for (const f of muestra) {
      const es = porFecha.get(f)!
      const abs = es.map((e) => Math.abs(e.dtMin))
      const peor = Math.max(...abs)
      peorGlobal = Math.max(peorGlobal, peor)
      console.log(
        `${f}      ${String(es.length).padStart(2)}       ` +
          es.map((e) => `${e.tipo[0].toUpperCase()} ${e.dtMin >= 0 ? '+' : ''}${e.dtMin.toFixed(0)}`).join('  ').padEnd(24) +
          `  ${peor.toFixed(0).padStart(4)}`,
      )
      // El criterio: cada extremo de cada fecha, bajo 20 minutos.
      for (const a of abs) expect(a).toBeLessThan(20)
    }
    const todos = pares.map((p) => Math.abs(p.dtMin))
    console.log(`\nNUMEROS EXACTOS sobre los ${todos.length} extremos:`)
    console.log(`  mediana ${mediana(todos).toFixed(1)} · p90 ${pct(todos, 0.9).toFixed(1)} · peor ${Math.max(...todos).toFixed(1)} min`)
    console.log(`peor de las 10 fechas: ${peorGlobal.toFixed(1)} min`)
    console.log('(P = pleamar, B = bajamar; + = el modelo va tarde)')
    expect(muestra.length).toBe(10)
  })
})

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

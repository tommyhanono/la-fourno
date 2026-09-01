// ¿Qué perilla mueve de verdad la respuesta, y cuál es decoración?
//
// Corre el motor real (`scoreBloque` acepta una calibración alterna)
// sobre 180 días REALES del corredor —90 de temporada seca y 90 de
// lluviosa— y mide, para cada perilla:
//
//   Δscore  · cuánto cambia el puntaje en promedio
//   semanas · de 25 semanas, en cuántas cambia el día ganador
//   etiq    · en cuántos días cambia la etiqueta que ve el usuario
//
// El criterio para borrar una perilla es duro: si no mueve el ranking
// NI una sola etiqueta en 180 días, no está haciendo nada y ocupa
// espacio en el archivo que Tommy edita. Así se eliminó el bono de
// "mar viejo" el 1-sep-2026 (Δ0.03, 0 semanas, 0 etiquetas).
//
// Los asserts de abajo son una GUARDIA: si alguien neutraliza sin
// querer un término que sí pesaba, o mete uno nuevo que no hace nada,
// esto avisa.

import { describe, it, expect } from 'vitest'
import { scoreBloque, nivelScore, type EntradaBloque } from '../../src/lib/score'
import { CALIBRACION } from '../../src/config/calibracion'
import fixture from '../fixtures/dias-reales.json'

interface DiaCrudo {
  dia: string
  vientoMedio: number
  vientoPico: number
  rachaPico: number
  nubosidadPct: number
  lluviaMedia: number
  lluviaPico: number
  olaMedia: number
  olaPico: number
  periodoMin: number
  weatherCodes: number[]
  tormentaFrac: number
  mareaRel: number
  mareaTendencia: 'llenando' | 'vaciando'
}
const crudos = [...(fixture.seca as DiaCrudo[]), ...(fixture.lluviosa as DiaCrudo[])]
type Cal = typeof CALIBRACION

/**
 * Reconstruye la entrada aplicando pesoPico, que es una perilla de
 * AGREGACIÓN (vive en ventanas.ts) y no de puntaje. Medida sobre un
 * fixture ya agregado daría "no cambia nada", y sería mentira: el
 * cambio ocurre antes de que scoreBloque vea el número.
 */
function entrada(d: DiaCrudo, pesoPico: number): EntradaBloque {
  const tip = (med: number, pico: number) => med * (1 - pesoPico) + pico * pesoPico
  return {
    vientoKt: tip(d.vientoMedio, d.vientoPico),
    rachaKt: d.rachaPico,
    nubosidadPct: d.nubosidadPct,
    probLluviaPct: null, // ERA5 no lo trae
    lluviaMmH: tip(d.lluviaMedia, d.lluviaPico),
    olaM: tip(d.olaMedia, d.olaPico),
    periodoS: d.periodoMin,
    weatherCodes: d.weatherCodes,
    tormentaFrac: d.tormentaFrac,
    capeJkg: null, // ERA5 no lo trae
    mareaRel: d.mareaRel,
    mareaTendencia: d.mareaTendencia,
  }
}

/**
 * CALIBRACION es `as const`, así que todo viene readonly. Para poder
 * perturbarla hace falta una copia mutable — pero con los nombres de
 * propiedad todavía chequeados, no un `any`: si alguien renombra una
 * perilla, este archivo tiene que dejar de compilar.
 */
/** `as const` además congela los valores (`8`, no `number`): se ensanchan. */
type Ancho<T> = T extends number
  ? number
  : T extends string
    ? string
    : T extends boolean
      ? boolean
      : T

type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : Ancho<T>

function con(cambio: (c: Mutable<Cal>) => void): Cal {
  const c = JSON.parse(JSON.stringify(CALIBRACION)) as Mutable<Cal>
  cambio(c)
  // El ensanchado quita los literales, así que hay que volver a
  // estrechar para pasárselo a scoreBloque. Es seguro: los valores
  // salen de una copia de CALIBRACION con perillas movidas.
  return c as unknown as Cal
}

const PP: number = CALIBRACION.jornada.pesoPico
const puntaje = (d: DiaCrudo, cal: Cal, pp: number = PP) =>
  scoreBloque(entrada(d, pp), cal).total
const baseScores = new Map(crudos.map((d) => [d.dia, puntaje(d, CALIBRACION)]))

function orden(cal: Cal, pp: number = PP): string[] {
  return [...crudos]
    .map((d) => ({ dia: d.dia, s: puntaje(d, cal, pp) }))
    .sort((a, b) => b.s - a.s || a.dia.localeCompare(b.dia))
    .map((x) => x.dia)
}
const base = orden(CALIBRACION)
const SEMANAS = Math.floor(crudos.length / 7)

function impacto(cal: Cal, pp: number = PP) {
  const r = orden(cal, pp)
  let semanas = 0
  for (let w = 0; w * 7 + 7 <= crudos.length; w++) {
    const trozo = crudos.slice(w * 7, w * 7 + 7)
    const ganador = (c: Cal, p: number) =>
      [...trozo]
        .map((d) => ({ dia: d.dia, s: puntaje(d, c, p) }))
        .sort((a, b) => b.s - a.s || a.dia.localeCompare(b.dia))[0].dia
    if (ganador(cal, pp) !== ganador(CALIBRACION, PP)) semanas++
  }
  const dif = crudos.map((d) => Math.abs(puntaje(d, cal, pp) - baseScores.get(d.dia)!))
  const medio = dif.reduce((a, b) => a + b, 0) / dif.length
  const pos = new Map(r.map((d, i) => [d, i]))
  const mov = base.reduce((a, d, i) => a + Math.abs((pos.get(d) ?? i) - i), 0) / base.length
  const etiquetas = crudos.filter(
    (d) =>
      nivelScore(puntaje(d, cal, pp)).etiqueta !==
      nivelScore(baseScores.get(d.dia)!).etiqueta,
  ).length
  return { top1: r[0] !== base[0], semanas, medio, mov, etiquetas }
}

/**
 * `seguridad: true` marca las rayas duras. Se listan en el reporte pero
 * quedan FUERA de la guardia de perillas muertas, y con razón: un umbral
 * de peligro que no dispara en 180 días buenos está haciendo su trabajo,
 * no sobrando. Que funcionan se prueba aparte, con días construidos a
 * propósito (ver score.test.ts).
 */
const PRUEBAS: { nombre: string; cal: Cal; pp?: number; seguridad?: boolean }[] = [
  { nombre: 'pesoPico 0.5 → 0.0 (solo promedio)', cal: CALIBRACION, pp: 0 },
  { nombre: 'pesoPico 0.5 → 1.0 (solo pico)', cal: CALIBRACION, pp: 1 },
  { nombre: 'pesoPico 0.5 → 0.35', cal: CALIBRACION, pp: 0.35 },
  { nombre: 'rachaDeltaKt 7 → 5', cal: con((c) => (c.viento.rachaDeltaKt = 5)) },
  { nombre: 'rachaDeltaKt 7 → 10', cal: con((c) => (c.viento.rachaDeltaKt = 10)) },
  { nombre: 'rachaPenal 8 → 0 (quitar)', cal: con((c) => (c.viento.rachaPenal = 0)) },
  { nombre: 'MAREA: quitar el término entero', cal: con((c) => (c.pesos.marea = 0)) },
  { nombre: 'marea bajaExtremaFrac 0.15 → 0.30', cal: con((c) => (c.marea.bajaExtremaFrac = 0.3)) },
  { nombre: 'marea bajaExtremaPenal 6 → 0', cal: con((c) => (c.marea.bajaExtremaPenal = 0)) },
  {
    nombre: 'marea vaciando/llenando → 0',
    cal: con((c) => {
      c.marea.vaciandoPenal = 0
      c.marea.llenandoBono = 0
    }),
  },
  { nombre: 'marCortoRatio 0.14 → 0.20', cal: con((c) => (c.seguridad.marCortoRatio = 0.2)) },
  { nombre: 'marCortoPenal 15 → 0 (quitar)', cal: con((c) => (c.seguridad.marCortoPenal = 0)) },
  {
    nombre: 'olaPeligrosaM 2.0 → 1.6 (raya dura)',
    cal: con((c) => (c.seguridad.olaPeligrosaM = 1.6)),
    seguridad: true,
  },
  {
    nombre: 'vientoPeligrosoKt 22 → 18 (raya dura)',
    cal: con((c) => (c.seguridad.vientoPeligrosoKt = 18)),
    seguridad: true,
  },
  {
    nombre: 'PESOS viento 45→50 / sol 30→25',
    cal: con((c) => {
      c.pesos.viento = 50
      c.pesos.sol = 25
    }),
  },
  {
    nombre: 'PESOS viento 45→40 / sol 30→35',
    cal: con((c) => {
      c.pesos.viento = 40
      c.pesos.sol = 35
    }),
  },
]

/**
 * ¿Qué variable DECIDE el score en la práctica?
 *
 * No es lo mismo que el peso nominal. Una variable puede pesar 45 y no
 * decidir nada si casi no varía entre días; y una de peso 30 puede
 * mandar si se mueve mucho. La forma de saberlo es neutralizarla —
 * ponerle a todos los días su valor mediano— y ver cuánto se desordena
 * el ranking. La que más lo desordena es la que estaba decidiendo.
 */
function medianaDe(f: (d: DiaCrudo) => number | null): number {
  const v = crudos.map(f).filter((x): x is number => x != null).sort((a, b) => a - b)
  return v[Math.floor(v.length / 2)]
}

function neutralizar(campo: 'viento' | 'sol' | 'ola' | 'racha' | 'viento+racha') {
  const medV = medianaDe((d) => d.vientoMedio)
  const medP = medianaDe((d) => d.vientoPico)
  const medN = medianaDe((d) => d.nubosidadPct)
  const medOM = medianaDe((d) => d.olaMedia)
  const medOP = medianaDe((d) => d.olaPico)
  const medR = medianaDe((d) => d.rachaPico)
  return (d: DiaCrudo): DiaCrudo => ({
    ...d,
    ...(campo === 'viento' || campo === 'viento+racha'
      ? { vientoMedio: medV, vientoPico: medP }
      : {}),
    ...(campo === 'racha' || campo === 'viento+racha' ? { rachaPico: medR } : {}),
    ...(campo === 'sol' ? { nubosidadPct: medN } : {}),
    ...(campo === 'ola' ? { olaMedia: medOM, olaPico: medOP } : {}),
  })
}

describe('qué variable decide el score en la práctica', () => {
  it('reporta cuánto desordena el ranking neutralizar cada variable', () => {
    const orden = (ds: DiaCrudo[]) =>
      [...ds]
        .map((d) => ({ dia: d.dia, s: puntaje(d, CALIBRACION) }))
        .sort((a, b) => b.s - a.s || a.dia.localeCompare(b.dia))
        .map((x) => x.dia)
    const base = orden(crudos)

    console.log(`\n¿QUÉ DECIDE EL SCORE? — ${crudos.length} días reales\n`)
    console.log('al neutralizar   | Δscore | posiciones movidas | semanas que cambian')
    console.log('-----------------|--------|--------------------|--------------------')
    const filas: { campo: string; mov: number }[] = []
    for (const campo of ['viento+racha', 'sol', 'viento', 'racha', 'ola'] as const) {
      const mod = crudos.map(neutralizar(campo))
      const r = orden(mod)
      const p2 = new Map(r.map((d, i) => [d, i]))
      const mov =
        base.reduce((a, d, i) => a + Math.abs((p2.get(d) ?? i) - i), 0) / base.length
      const dif =
        mod.reduce(
          (a, d, i) => a + Math.abs(puntaje(d, CALIBRACION) - puntaje(crudos[i], CALIBRACION)),
          0,
        ) / mod.length
      let semanas = 0
      for (let w = 0; w * 7 + 7 <= crudos.length; w++) {
        const g = (ds: DiaCrudo[]) =>
          ds
            .slice(w * 7, w * 7 + 7)
            .map((d) => ({ dia: d.dia, s: puntaje(d, CALIBRACION) }))
            .sort((a, b) => b.s - a.s || a.dia.localeCompare(b.dia))[0].dia
        if (g(mod) !== g(crudos)) semanas++
      }
      filas.push({ campo, mov })
      console.log(
        `${campo.padEnd(16)} | ${dif.toFixed(2).padStart(6)} | ${mov.toFixed(2).padStart(18)} | ${String(semanas).padStart(5)}/${SEMANAS}`,
      )
    }
    filas.sort((a, b) => b.mov - a.mov)
    console.log(`\nLa que más decide: ${filas[0].campo}. Orden: ${filas.map((f) => f.campo).join(' > ')}`)
    console.log('Criterio declarado de Tommy: poco viento primero, buen sol después.')

    // EL CRITERIO de Tommy es "poco viento" — y eso incluye las
    // ráfagas, que son viento. La comparación justa es la familia del
    // viento contra el sol, no el viento sostenido solo.
    const familia = filas.find((f) => f.campo === 'viento+racha')!
    const sol = filas.find((f) => f.campo === 'sol')!
    console.log(
      `\nFamilia del viento (sostenido + ráfaga): ${familia.mov.toFixed(2)} · sol: ${sol.mov.toFixed(2)}`,
    )
    expect(familia.mov).toBeGreaterThan(sol.mov)
  })

  it('playa y navegación ponderan distinto, y de forma coherente', () => {
    // En playa manda el sol y la lluvia; la ola ni siquiera entra. En
    // navegación manda el viento. Son criterios distintos a propósito.
    const p = CALIBRACION.playa.pesos
    expect(p.sol + p.lluvia).toBeGreaterThan(p.viento)
    expect(p.sol).toBeGreaterThan(p.viento)
    expect(Object.keys(p)).not.toContain('ola')
    const n = CALIBRACION.pesos
    expect(n.viento).toBeGreaterThan(n.sol)
    expect(n.viento).toBeGreaterThan(n.ola + n.marea)
  })
})

describe('sensibilidad de las perillas (180 días reales, dos temporadas)', () => {
  it('reporta cuánto mueve cada perilla', () => {
    const scores = [...baseScores.values()]
    console.log(
      `\n${crudos.length} días reales · score medio ${(
        scores.reduce((a, b) => a + b, 0) / scores.length
      ).toFixed(1)} · min ${Math.min(...scores)} · máx ${Math.max(...scores)}\n`,
    )
    console.log('perilla                             | Δscore | semanas | mov   | etiq | top1')
    console.log('------------------------------------|--------|---------|-------|------|-----')
    for (const p of PRUEBAS) {
      const r = impacto(p.cal, p.pp ?? PP)
      console.log(
        `${p.nombre.padEnd(35)} | ${r.medio.toFixed(2).padStart(6)} | ` +
          `${String(r.semanas).padStart(4)}/${SEMANAS} | ${r.mov.toFixed(2).padStart(5)} | ` +
          `${String(r.etiquetas).padStart(4)} | ` +
          (r.top1 ? 'SÍ' : 'no'),
      )
    }
    console.log(
      `\netiq = de ${crudos.length} días, en cuántos cambia la etiqueta que ve el usuario.`,
    )
    console.log('NO medibles con ERA5: probLluviaPenalMax · capeAltoPenal · tormentaPenal')
  })

  it('el término de marea SÍ pesa: por eso se quedó', () => {
    // La misión pedía decidirlo: o entra con respaldo o se borra. Este
    // es el respaldo. Si algún día deja de mover nada, hay que borrarlo.
    const r = impacto(con((c) => (c.pesos.marea = 0)))
    expect(r.medio).toBeGreaterThan(3)
    expect(r.semanas).toBeGreaterThan(0)
    expect(r.etiquetas).toBeGreaterThan(20)
  })

  it('pesoPico es la perilla más sensible, y sigue sin estar validada', () => {
    // Documenta por qué está marcada como crítica en calibracion.ts.
    const r = impacto(CALIBRACION, 0)
    expect(r.semanas).toBeGreaterThanOrEqual(4)
    expect(r.etiquetas).toBeGreaterThan(20)
  })

  it('el umbral de racha pesa más que el tamaño del castigo', () => {
    const umbral = impacto(con((c) => (c.viento.rachaDeltaKt = 5)))
    const castigo = impacto(con((c) => (c.viento.rachaPenal = 0)))
    expect(umbral.etiquetas).toBeGreaterThan(castigo.etiquetas)
  })

  it('ninguna perilla de puntaje es decoración pura', () => {
    // Guardia contra perillas muertas. Si una no mueve NI ranking NI
    // etiqueta en 180 días, o se borra o se justifica acá por qué se
    // queda. Así se detectó el bono de "mar viejo".
    // Las rayas de seguridad quedan fuera: deben estar dormidas.
    const muertas = PRUEBAS.filter((p) => {
      if (p.seguridad) return false
      const r = impacto(p.cal, p.pp ?? PP)
      return r.semanas === 0 && r.etiquetas === 0 && r.mov < 0.5
    })
    expect(muertas.map((m) => m.nombre)).toEqual([])
  })

  it('las rayas de seguridad están dormidas en 180 días buenos', () => {
    // No es un detalle: si una raya dura disparara seguido en días
    // normales, estaría mal puesta y le quitaría sentido a la bandera.
    const rayas = PRUEBAS.filter((p) => p.seguridad)
    expect(rayas.length).toBeGreaterThan(0)
    for (const p of rayas) {
      const r = impacto(p.cal, p.pp ?? PP)
      expect(r.semanas).toBe(0)
    }
  })
})

// El recomendador. Score 0–100 por bloque de 2 h, EXPLICABLE:
// cada resultado trae su desglose con números, nada de caja negra.
// Jerarquía calibrada en config/calibracion.ts: viento → sol,
// con ola y tormenta como seguridad.

import { CALIBRACION, type Calibracion } from '../config/calibracion'

export interface EntradaBloque {
  /** viento sostenido máximo del bloque en el corredor, kt */
  vientoKt: number | null
  /** ráfaga máxima del bloque, kt */
  rachaKt: number | null
  /** nubosidad media, % */
  nubosidadPct: number | null
  /** probabilidad de lluvia máxima, % */
  probLluviaPct: number | null
  /** lluvia máxima, mm/h */
  lluviaMmH: number | null
  /** altura de ola máxima, m */
  olaM: number | null
  /** período de ola mínimo, s */
  periodoS: number | null
  /** códigos WMO del bloque */
  weatherCodes: number[]
  /**
   * Fracción de la franja con tormenta (0..1). Solo la usa la vista de
   * jornada completa, donde un chubasco de una hora no puede pesar
   * igual que una tarde entera de rayos. Sin este campo, cualquier
   * tormenta penaliza completo y marca peligro (bloques de 2 h).
   */
  tormentaFrac?: number
  /** CAPE máximo, J/kg */
  capeJkg: number | null
  /** nivel de marea relativo 0..1 al llegar (null si no hay dato) */
  mareaRel: number | null
  /** tendencia de marea al llegar */
  mareaTendencia: 'llenando' | 'vaciando' | null
}

export interface Contribucion {
  clave: string
  /** "viento 8 kt" — la medición */
  etiqueta: string
  /** puntos con signo */
  puntos: number
  /** 'base' cuenta para el máximo teórico; 'penal' es seguridad */
  tipo: 'base' | 'penal' | 'bono'
}

export interface ResultadoScore {
  total: number
  contribuciones: Contribucion[]
  /** true si faltó algún dato y el score es parcial */
  parcial: boolean
  /** true si hay bandera de seguridad (tormenta / mar peligroso) */
  peligro: boolean
}

function trFrac<K extends string>(
  tramos: readonly ({ frac: number } & { [P in K]: number })[],
  campo: K,
  valor: number,
): number {
  for (const t of tramos) {
    if (valor <= t[campo]) return t.frac
  }
  return 0
}

const r1 = (x: number) => Math.round(x * 10) / 10

/** Score de navegación para un bloque de 2 h en el corredor. */
export function scoreBloque(e: EntradaBloque, cal: Calibracion = CALIBRACION): ResultadoScore {
  const c: Contribucion[] = []
  let parcial = false
  let peligro = false

  // --- Viento (lo que manda) ---
  if (e.vientoKt != null) {
    const frac = trFrac(cal.viento.tramos, 'hastaKt', e.vientoKt)
    c.push({
      clave: 'viento',
      etiqueta: `viento ${Math.round(e.vientoKt)} kt`,
      puntos: r1(cal.pesos.viento * frac),
      tipo: 'base',
    })
    if (
      e.rachaKt != null &&
      e.rachaKt - e.vientoKt > cal.viento.rachaDeltaKt
    ) {
      c.push({
        clave: 'racha',
        etiqueta: `rachas de ${Math.round(e.rachaKt)} kt`,
        puntos: -cal.viento.rachaPenal,
        tipo: 'penal',
      })
    }
  } else {
    parcial = true
  }

  // --- Sol ---
  if (e.nubosidadPct != null) {
    const frac = trFrac(cal.sol.tramos, 'hastaPct', e.nubosidadPct)
    const etiqueta =
      e.nubosidadPct <= 25
        ? 'despejado'
        : e.nubosidadPct <= 50
          ? `sol parcial (${Math.round(e.nubosidadPct)} % nubes)`
          : e.nubosidadPct <= 75
            ? `nublado (${Math.round(e.nubosidadPct)} % nubes)`
            : `cielo cerrado (${Math.round(e.nubosidadPct)} % nubes)`
    c.push({ clave: 'sol', etiqueta, puntos: r1(cal.pesos.sol * frac), tipo: 'base' })
  } else {
    parcial = true
  }
  if (e.probLluviaPct != null && e.probLluviaPct > 20) {
    c.push({
      clave: 'prob-lluvia',
      etiqueta: `${Math.round(e.probLluviaPct)} % prob. de lluvia`,
      puntos: -r1(cal.sol.probLluviaPenalMax * (e.probLluviaPct / 100)),
      tipo: 'penal',
    })
  }

  // --- Ola ---
  if (e.olaM != null) {
    const frac = trFrac(cal.ola.tramos, 'hastaM', e.olaM)
    const ft = e.olaM * 3.28084
    c.push({
      clave: 'ola',
      etiqueta: `ola ${ft.toFixed(1)} ft${e.periodoS != null ? ` cada ${Math.round(e.periodoS)} s` : ''}`,
      puntos: r1(cal.pesos.ola * frac),
      tipo: 'base',
    })
    if (e.periodoS != null && e.periodoS >= cal.ola.periodoLargoS && e.olaM <= 0.9) {
      c.push({
        clave: 'mar-viejo',
        etiqueta: 'mar viejo, período largo',
        puntos: cal.ola.periodoLargoBono,
        tipo: 'bono',
      })
    }
  } else {
    parcial = true
  }

  // --- Marea (menor, pero cuenta) ---
  if (e.mareaRel != null) {
    if (e.mareaRel < cal.marea.bajaExtremaFrac) {
      c.push({
        clave: 'marea-baja',
        etiqueta: 'bajamar extrema a la llegada',
        puntos: -cal.marea.bajaExtremaPenal,
        tipo: 'penal',
      })
      c.push({ clave: 'marea', etiqueta: 'marea', puntos: r1(cal.pesos.marea * 0.3), tipo: 'base' })
    } else if (e.mareaTendencia === 'vaciando') {
      c.push({
        clave: 'marea',
        etiqueta: 'marea',
        puntos: r1(cal.pesos.marea * 0.6),
        tipo: 'base',
      })
      c.push({
        clave: 'marea-vaciando',
        etiqueta: 'vaciando a la llegada',
        puntos: -cal.marea.vaciandoPenal,
        tipo: 'penal',
      })
    } else {
      c.push({
        clave: 'marea',
        etiqueta: e.mareaTendencia === 'llenando' ? 'marea llenando' : 'marea cómoda',
        puntos: r1(cal.pesos.marea * 0.8),
        tipo: 'base',
      })
      if (e.mareaTendencia === 'llenando') {
        c.push({
          clave: 'marea-llenando',
          etiqueta: 'llenando a la llegada',
          puntos: cal.marea.llenandoBono,
          tipo: 'bono',
        })
      }
    }
  } else {
    // sin dato de marea el score sigue: es factor menor
    parcial = true
  }

  // --- Seguridad (mata bloques, no negocia) ---
  const s = cal.seguridad
  const hayTormenta = e.weatherCodes.some((w) =>
    (s.tormentaCodes as readonly number[]).includes(w),
  )
  if (hayTormenta) {
    // Sin tormentaFrac (bloques de 2 h) la tormenta pesa completa.
    const frac = e.tormentaFrac == null ? 1 : Math.min(1, Math.max(0, e.tormentaFrac))
    c.push({
      clave: 'tormenta',
      etiqueta:
        e.tormentaFrac == null
          ? 'tormenta eléctrica pronosticada'
          : `tormenta en ${Math.round(frac * 100)} % de la jornada`,
      puntos: -r1(s.tormentaPenal * frac),
      tipo: 'penal',
    })
    peligro = e.tormentaFrac == null || frac >= s.tormentaPeligroFrac
  } else if (e.capeJkg != null && e.capeJkg > s.capeAltoJkg) {
    c.push({
      clave: 'cape',
      etiqueta: `atmósfera muy inestable (CAPE ${Math.round(e.capeJkg)})`,
      puntos: -s.capeAltoPenal,
      tipo: 'penal',
    })
  }
  if (e.lluviaMmH != null && e.lluviaMmH >= s.lluviaFuerteMmH) {
    c.push({
      clave: 'lluvia',
      etiqueta: `lluvia fuerte (${r1(e.lluviaMmH)} mm/h)`,
      puntos: -s.lluviaFuertePenal,
      tipo: 'penal',
    })
  }
  if (e.olaM != null) {
    if (e.olaM >= s.olaPeligrosaM) {
      c.push({
        clave: 'ola-peligrosa',
        etiqueta: `mar grueso (${(e.olaM * 3.28084).toFixed(1)} ft)`,
        puntos: -s.olaPeligrosaPenal,
        tipo: 'penal',
      })
      peligro = true
    } else if (
      e.periodoS != null &&
      e.periodoS > 0 &&
      e.olaM / e.periodoS > s.marCortoRatio
    ) {
      c.push({
        clave: 'mar-corto',
        etiqueta: `mar corto y picado (${(e.olaM * 3.28084).toFixed(1)} ft cada ${Math.round(e.periodoS)} s)`,
        puntos: -s.marCortoPenal,
        tipo: 'penal',
      })
    }
  }

  const total = Math.max(
    0,
    Math.min(100, Math.round(c.reduce((acc, x) => acc + x.puntos, 0))),
  )
  return { total, contribuciones: c, parcial, peligro }
}

export interface EntradaPlaya {
  nubosidadPct: number | null
  probLluviaPct: number | null
  vientoKt: number | null
  weatherCodes: number[]
}

/** Score de día de playa: sol manda, viento y lluvia acompañan. */
export function scorePlaya(e: EntradaPlaya, cal: Calibracion = CALIBRACION): ResultadoScore {
  const c: Contribucion[] = []
  let parcial = false
  let peligro = false
  const p = cal.playa

  if (e.nubosidadPct != null) {
    const frac = trFrac(cal.sol.tramos, 'hastaPct', e.nubosidadPct)
    c.push({
      clave: 'sol',
      etiqueta: e.nubosidadPct <= 25 ? 'despejado' : `${Math.round(e.nubosidadPct)} % nubes`,
      puntos: r1(p.pesos.sol * frac),
      tipo: 'base',
    })
  } else parcial = true

  if (e.vientoKt != null) {
    const frac = trFrac(p.vientoTramos, 'hastaKt', e.vientoKt)
    c.push({
      clave: 'viento',
      etiqueta: `viento ${Math.round(e.vientoKt)} kt`,
      puntos: r1(p.pesos.viento * frac),
      tipo: 'base',
    })
  } else parcial = true

  if (e.probLluviaPct != null) {
    const frac = trFrac(p.lluviaTramos, 'hastaPct', e.probLluviaPct)
    c.push({
      clave: 'lluvia',
      etiqueta:
        e.probLluviaPct <= 15
          ? 'sin lluvia a la vista'
          : `${Math.round(e.probLluviaPct)} % prob. de lluvia`,
      puntos: r1(p.pesos.lluvia * frac),
      tipo: 'base',
    })
  } else parcial = true

  if (e.weatherCodes.some((w) => (cal.seguridad.tormentaCodes as readonly number[]).includes(w))) {
    c.push({
      clave: 'tormenta',
      etiqueta: 'tormenta eléctrica pronosticada',
      puntos: -cal.seguridad.tormentaPenal,
      tipo: 'penal',
    })
    peligro = true
  }

  const total = Math.max(
    0,
    Math.min(100, Math.round(c.reduce((acc, x) => acc + x.puntos, 0))),
  )
  return { total, contribuciones: c, parcial, peligro }
}

export function nivelScore(total: number, cal: Calibracion = CALIBRACION) {
  return cal.niveles.find((n) => total >= n.desde) ?? cal.niveles[cal.niveles.length - 1]
}

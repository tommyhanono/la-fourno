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
  /** altura de ola máxima, m (mar TOTAL: swell + chop) */
  olaM: number | null
  /**
   * Período mínimo del mar total, s. Es la media ponderada por energía
   * del estado de mar completo: si el chop del viento domina, este
   * número baja solo. Por eso alcanza para juzgar el picado y no hace
   * falta el desglose swell/chop (verificado, ver 'mar-corto' abajo).
   */
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
  /**
   * 'base' cuenta para el máximo teórico; 'penal' es seguridad;
   * 'bandera' no suma puntos, solo explica por qué el día es peligroso.
   */
  tipo: 'base' | 'penal' | 'bono' | 'bandera'
}

export interface ResultadoScore {
  total: number
  contribuciones: Contribucion[]
  /** true si faltó algún dato y el score es parcial */
  parcial: boolean
  /**
   * Qué insumos faltaron, en palabras ('viento', 'ola'…). Vacío si
   * llegó todo.
   */
  faltan: string[]
  /**
   * Cuántos puntos del máximo de 100 quedaron fuera de alcance por
   * datos que no llegaron.
   *
   * Existe porque un booleano no alcanzaba: sin dato de mar un día
   * pierde 25 puntos (ola 15 + marea 10) y nunca podría ganarle a uno
   * completo, pero igual salía compitiendo en el ranking como si nada.
   * Con el peso a la vista se puede decidir si el número todavía
   * significa algo o si mejor no mostrar ninguno.
   */
  pesoFaltante: number
  /** true si hay bandera de seguridad (tormenta / mar peligroso) */
  peligro: boolean
}

/**
 * Fracción del peso leyendo la curva de la calibración: los anclajes
 * son valores exactos y entre dos anclajes se interpola en línea
 * recta. Fuera de la curva se queda en el extremo (no se extrapola).
 *
 * Ojo al leerlo: `{ kt: 12, frac: 0.65 }` es "a 12 kt exactos, 0.65",
 * NO "de 8 a 12 kt, 0.65". Ver el encabezado de calibracion.ts.
 */
function curvaFrac<K extends string>(
  curva: readonly ({ frac: number } & { [P in K]: number })[],
  campo: K,
  valor: number,
): number {
  if (curva.length === 0) return 0
  if (valor <= curva[0][campo]) return curva[0].frac
  for (let i = 1; i < curva.length; i++) {
    const x1 = curva[i][campo]
    if (valor === x1) return curva[i].frac // en el anclaje no se negocia
    if (valor < x1) {
      const x0 = curva[i - 1][campo]
      const y0 = curva[i - 1].frac
      const y1 = curva[i].frac
      if (x1 <= x0) return y1 // anclajes repetidos: manda el de la derecha
      return y0 + (y1 - y0) * ((valor - x0) / (x1 - x0))
    }
  }
  return curva[curva.length - 1].frac
}

/**
 * Puntos de viento (0..pesos.viento) que le tocan a una velocidad.
 * Se expone para poder medir el desacuerdo entre modelos EN LA MISMA
 * MONEDA que el score: 3 kt de diferencia no significan nada a 5 kt y
 * lo cambian todo a 13 kt, porque la curva no es recta.
 */
export function puntosViento(kt: number, cal: Calibracion = CALIBRACION): number {
  return cal.pesos.viento * curvaFrac(cal.viento.curva, 'kt', kt)
}

/** Lo mismo para el sol, y por la misma razón: la curva no es recta. */
export function puntosSol(nubePct: number, cal: Calibracion = CALIBRACION): number {
  return cal.pesos.sol * curvaFrac(cal.sol.curva, 'pct', nubePct)
}

const r1 = (x: number) => Math.round(x * 10) / 10

/** Score de navegación para un bloque de 2 h en el corredor. */
export function scoreBloque(e: EntradaBloque, cal: Calibracion = CALIBRACION): ResultadoScore {
  const c: Contribucion[] = []
  const faltan: string[] = []
  let pesoFaltante = 0
  let peligro = false
  const falta = (que: string, peso: number) => {
    faltan.push(que)
    pesoFaltante += peso
  }

  // --- Viento (lo que manda) ---
  if (e.vientoKt != null) {
    const frac = curvaFrac(cal.viento.curva, 'kt', e.vientoKt)
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
    falta('viento', cal.pesos.viento)
  }

  // --- Sol ---
  if (e.nubosidadPct != null) {
    const frac = curvaFrac(cal.sol.curva, 'pct', e.nubosidadPct)
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
    falta('cielo', cal.pesos.sol)
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
    const frac = curvaFrac(cal.ola.curva, 'm', e.olaM)
    const ft = e.olaM * 3.28084
    c.push({
      clave: 'ola',
      etiqueta: `ola ${ft.toFixed(1)} ft${e.periodoS != null ? ` cada ${Math.round(e.periodoS)} s` : ''}`,
      puntos: r1(cal.pesos.ola * frac),
      tipo: 'base',
    })
    // Acá vivía el bono de "mar viejo, período largo". Se quitó el
    // 1-sep-2026 tras medirlo en 180 días reales: 0 semanas movidas,
    // 0 etiquetas cambiadas. Ver la nota en calibracion.ts (sección ola).
  } else {
    falta('ola', cal.pesos.ola)
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
    falta('marea', cal.pesos.marea)
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
    peligro = peligro || e.tormentaFrac == null || frac >= s.tormentaPeligroFrac
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
  // Viento de peligro: raya dura, no depende de la curva de puntaje.
  if (e.vientoKt != null && e.vientoKt >= s.vientoPeligrosoKt) {
    c.push({
      clave: 'viento-peligroso',
      etiqueta: `viento de ${Math.round(e.vientoKt)} kt sostenidos`,
      puntos: 0,
      tipo: 'bandera',
    })
    peligro = true
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
      // NO CAMBIAR ESTO A wind_wave_* SIN LEER LO DE ABAJO.
      // Se probó el 31-ago-2026 y se descartó con datos.
      //
      // La idea tentadora: "wave_period es el mar combinado, un swell
      // largo esconde el golpeteo corto del viento; hay que medir el
      // chop aparte con wind_wave_height / wind_wave_period".
      //
      // Es falsa. wave_period es la media PONDERADA POR ENERGÍA, así que
      // baja sola cuando el chop pasa a dominar. Medido en Contadora,
      // temporada seca 2026 (1440 h), según la fracción de energía que
      // aporta el chop:  0-10 % → 9.7 s · 25-50 % → 7.9 s ·
      // 50-75 % → 6.1 s · 75-100 % → 4.8 s. Responde perfecto.
      //
      // Y cambiarlo empeoraba el score por dos lados:
      //  1. Cobra dos veces el viento. El chop es casi función pura del
      //     viento local (0-5 kt → 0.04 m · 8-12 kt → 0.25 m ·
      //     15+ kt → 0.62 m), y 79-100 % de las horas que castigaría ya
      //     tienen viento ≥12 kt, donde la curva ya quitó 16-27 pts.
      //  2. El "día trampa" (mar picado con viento ya calmado) NO existe
      //     acá: chop ≥0.4 m con viento <10 kt ocurrió 0 veces en 480 h.
      //     El Golfo es cuenca de fetch limitado, el mar de viento sube
      //     y baja con el viento y no queda picada vieja.
      //
      // Detalle completo en DECISIONES.md §13.
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
  return {
    total,
    contribuciones: c,
    parcial: faltan.length > 0,
    faltan,
    pesoFaltante,
    peligro,
  }
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
  const faltan: string[] = []
  let pesoFaltante = 0
  let peligro = false
  const p = cal.playa
  const falta = (que: string, peso: number) => {
    faltan.push(que)
    pesoFaltante += peso
  }

  if (e.nubosidadPct != null) {
    const frac = curvaFrac(cal.sol.curva, 'pct', e.nubosidadPct)
    c.push({
      clave: 'sol',
      etiqueta: e.nubosidadPct <= 25 ? 'despejado' : `${Math.round(e.nubosidadPct)} % nubes`,
      puntos: r1(p.pesos.sol * frac),
      tipo: 'base',
    })
  } else falta('cielo', p.pesos.sol)

  if (e.vientoKt != null) {
    const frac = curvaFrac(p.vientoCurva, 'kt', e.vientoKt)
    c.push({
      clave: 'viento',
      etiqueta: `viento ${Math.round(e.vientoKt)} kt`,
      puntos: r1(p.pesos.viento * frac),
      tipo: 'base',
    })
  } else falta('viento', p.pesos.viento)

  if (e.probLluviaPct != null) {
    const frac = curvaFrac(p.lluviaCurva, 'pct', e.probLluviaPct)
    c.push({
      clave: 'lluvia',
      etiqueta:
        e.probLluviaPct <= 15
          ? 'sin lluvia a la vista'
          : `${Math.round(e.probLluviaPct)} % prob. de lluvia`,
      puntos: r1(p.pesos.lluvia * frac),
      tipo: 'base',
    })
  } else falta('lluvia', p.pesos.lluvia)

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
  return {
    total,
    contribuciones: c,
    parcial: faltan.length > 0,
    faltan,
    pesoFaltante,
    peligro,
  }
}

/**
 * ¿El score todavía significa algo, o le faltan los insumos que lo
 * sostienen? Falta un dato CRÍTICO cuando lo que no llegó pesa tanto
 * como el cielo o más — o sea, cuando falta el viento o el cielo.
 *
 * Sin ola ni marea (25 pts entre las dos) el día sigue diciendo algo:
 * el viento y el sol, que es de lo que Tommy decide. Sin viento o sin
 * cielo, el número sería un decorado.
 */
export function faltaDatoCritico(
  score: ResultadoScore,
  cal: Calibracion = CALIBRACION,
): boolean {
  return score.pesoFaltante >= cal.pesos.sol
}

export function nivelScore(total: number, cal: Calibracion = CALIBRACION) {
  return cal.niveles.find((n) => total >= n.desde) ?? cal.niveles[cal.niveles.length - 1]
}

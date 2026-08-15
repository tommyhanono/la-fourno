// ============================================================
// LA FOURNO — Calibración del recomendador
// Bote de referencia: Sunsation CCX 40 (40 pies, center console
// rápido). Jerarquía de Tommy: 1º poco viento, 2º buen sol.
// Oleaje y tormenta eléctrica entran como SEGURIDAD (penalizan
// fuerte aunque haya sol).
//
// Todo lo que el score usa sale de este archivo. Edita y listo.
// Unidades internas: viento en nudos, ola en metros, lluvia en mm.
// ============================================================

export interface TramoViento {
  hastaKt: number
  frac: number // fracción del peso de viento que se lleva este tramo
}

export const CALIBRACION = {
  /** Duración de cada bloque del recomendador, en horas. */
  bloqueHoras: 2,

  /**
   * Jornada típica de Tommy: sale 9–10 am y vuelve 3–4 pm.
   * La vista "Día por día" evalúa el día COMPLETO dentro de esta
   * franja (peor caso de viento/ola/tormenta en toda la jornada) y
   * elige el mejor destino del día. llegadaHoras = cuánto tarda el
   * cruce para evaluar la marea al llegar al destino.
   */
  jornada: {
    desdeHora: 9, // 9 am
    hastaHora: 16, // 4 pm
    llegadaHoras: 2,
    /**
     * Cómo se resume una jornada larga en un número. El peor caso puro
     * de 7 h no sirve en temporada lluviosa (un chubasco de las 3 pm
     * mataría TODOS los días y no podrías comparar). Se usa
     * promedio y pico mezclados: 0 = solo el promedio del día,
     * 1 = solo el peor momento. 0.5 = lo típico, ponderado al pico.
     */
    pesoPico: 0.5,
  },

  /**
   * Pesos base (suman 100). El orden ES la jerarquía:
   * viento manda, después sol; ola y marea completan.
   */
  pesos: {
    viento: 45,
    sol: 30,
    ola: 15,
    marea: 10,
  },

  viento: {
    // Viento sostenido (kt) → fracción del peso.
    // Un CCX 40 plana cómodo hasta ~12 kt de viento en el golfo;
    // 15+ ya es mar molesto de banda; 20+ no vale la pena.
    tramos: [
      { hastaKt: 5, frac: 1.0 }, //  calma — día perfecto
      { hastaKt: 8, frac: 0.9 }, //  brisa suave
      { hastaKt: 12, frac: 0.65 }, // se siente pero se anda bien
      { hastaKt: 15, frac: 0.4 }, //  incómodo
      { hastaKt: 18, frac: 0.18 }, // golpeado
      { hastaKt: 22, frac: 0.05 }, // mala idea
      { hastaKt: Infinity, frac: 0 },
    ] as TramoViento[],
    // Si la ráfaga supera al sostenido por más de este delta, resta puntos:
    // viento parejo se maneja, viento a golpes cansa y sorprende.
    rachaDeltaKt: 7,
    rachaPenal: 8,
  },

  sol: {
    // Nubosidad media (%) → fracción del peso de sol.
    tramos: [
      { hastaPct: 25, frac: 1.0 }, // despejado
      { hastaPct: 50, frac: 0.75 }, // parcial
      { hastaPct: 75, frac: 0.45 }, // nublado
      { hastaPct: 100, frac: 0.2 }, // cerrado
    ],
    // Probabilidad de lluvia: resta proporcional hasta este máximo.
    probLluviaPenalMax: 12, // a 100 % de prob se restan 12 pts
  },

  ola: {
    // Altura de ola (m) → fracción del peso. Con 40 pies, 0.5 m ni se
    // siente; 1 m se navega; 1.5 m ya se elige otra ruta.
    tramos: [
      { hastaM: 0.5, frac: 1.0 },
      { hastaM: 0.9, frac: 0.7 },
      { hastaM: 1.3, frac: 0.35 },
      { hastaM: 1.8, frac: 0.1 },
      { hastaM: Infinity, frac: 0 },
    ],
    // Período largo = mar viejo, cómodo. Bono si período ≥ este valor.
    periodoLargoS: 12,
    periodoLargoBono: 3,
  },

  marea: {
    // La marea pesa poco en el score (el CCX 40 entra a casi todo),
    // pero una bajamar extrema complica playas y bajos en Las Perlas.
    // Nivel relativo al rango del día: 0 = bajamar plena, 1 = pleamar.
    bajaExtremaFrac: 0.15, // por debajo de esto en destino → penal
    bajaExtremaPenal: 6,
    vaciandoPenal: 3, // llegando con marea vaciando: pequeña resta
    llenandoBono: 2, // llegando con marea llenando: pequeño bono
  },

  seguridad: {
    // Tormenta eléctrica: códigos WMO 95/96/99 en el bloque.
    // Open-Meteo no publica rayos: weather_code + CAPE son el proxy
    // (documentado en DECISIONES.md).
    tormentaCodes: [95, 96, 99],
    tormentaPenal: 60, // mata el bloque aunque el resto esté perfecto
    /**
     * En franjas largas (la jornada del día) la tormenta penaliza en
     * proporción a las horas que ocupa, y solo marca PELIGRO si tapa
     * al menos esta fracción de la jornada. En los bloques de 2 h no
     * aplica: ahí cualquier tormenta es peligro, sin negociar.
     */
    tormentaPeligroFrac: 0.35,
    capeAltoJkg: 2500, // atmósfera muy cargada sin tormenta declarada
    capeAltoPenal: 20,
    lluviaFuerteMmH: 4,
    lluviaFuertePenal: 25,
    // Mar corto y picado: mucha altura para poco período.
    // ratio = altura(m) / período(s). 1 m a 5 s = 0.2 → castiga.
    marCortoRatio: 0.14,
    marCortoPenal: 15,
    olaPeligrosaM: 2.0,
    olaPeligrosaPenal: 40,
  },

  /** Score de día de playa (Las Sirenas, Coronado): misma lógica, más simple. */
  playa: {
    pesos: { sol: 50, viento: 30, lluvia: 20 },
    // En la playa el viento molesta menos que en el bote:
    vientoTramos: [
      { hastaKt: 8, frac: 1.0 },
      { hastaKt: 13, frac: 0.75 },
      { hastaKt: 18, frac: 0.4 },
      { hastaKt: Infinity, frac: 0.1 },
    ],
    lluviaTramos: [
      { hastaPct: 15, frac: 1.0 },
      { hastaPct: 40, frac: 0.6 },
      { hastaPct: 70, frac: 0.25 },
      { hastaPct: 100, frac: 0 },
    ],
  },

  /** Etiquetas de calidad del score total. */
  niveles: [
    { desde: 75, etiqueta: 'Excelente', clase: 'ok' },
    { desde: 55, etiqueta: 'Bueno', clase: 'ok' },
    { desde: 35, etiqueta: 'Regular', clase: 'warn' },
    { desde: 0, etiqueta: 'Malo', clase: 'danger' },
  ],
} as const

export type Calibracion = typeof CALIBRACION

// ============================================================
// LA FOURNO — Calibración del recomendador
// Bote de referencia: Sunsation CCX 40 (40 pies, center console
// rápido). Jerarquía de Tommy: 1º poco viento, 2º buen sol.
// Oleaje y tormenta eléctrica entran como SEGURIDAD (penalizan
// fuerte aunque haya sol).
//
// Todo lo que el score usa sale de este archivo. Edita y listo.
// Unidades internas: viento en nudos, ola en metros, lluvia en mm.
//
// CÓMO SE LEEN LAS CURVAS
// Cada curva es una lista de ANCLAJES: "a este valor exacto, esta
// fracción del peso". Entre dos anclajes el score interpola en línea
// recta; antes del primero y después del último se queda en el
// extremo. O sea: `{ kt: 12, frac: 0.65 }` significa "a 12 nudos se
// lleva el 65 % del peso del viento", y a 10 kt le toca algo entre
// el anclaje de 8 y el de 12.
//
// Antes esto eran cajones ("de 8 a 12 kt → 0.65"), y con cajones
// media semana caía en el mismo cajón y daba el mismo número: seis
// días seguidos "40" y el score dejaba de servir para comparar. Se
// pasó a curva a propósito. Para endurecer o aflojar un tramo, mueve
// el frac de su anclaje o agrega uno intermedio.
// ============================================================

/** Un punto de la curva: a `valor` exacto le toca `frac` del peso. */
export interface Anclaje {
  frac: number
}
export type AnclajeKt = Anclaje & { kt: number }
export type AnclajePct = Anclaje & { pct: number }
export type AnclajeM = Anclaje & { m: number }

export const CALIBRACION = {
  /** Duración de cada bloque horario interno, en horas. */
  bloqueHoras: 2,

  /**
   * Jornada típica de Tommy: sale 9–10 am y vuelve 3–4 pm.
   * Es la franja que la app evalúa para dar el día completo y para
   * elegir el mejor destino. llegadaHoras = cuánto tarda el cruce,
   * para mirar la marea al LLEGAR y no al salir.
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
    curva: [
      { kt: 0, frac: 1.0 }, //   calma chicha
      { kt: 5, frac: 1.0 }, //   calma — día perfecto
      { kt: 8, frac: 0.9 }, //   brisa suave
      { kt: 12, frac: 0.65 }, // se siente pero se anda bien
      { kt: 15, frac: 0.4 }, //  incómodo
      { kt: 18, frac: 0.18 }, // golpeado
      { kt: 22, frac: 0.05 }, // mala idea
      { kt: 25, frac: 0 }, //    de aquí en adelante, cero
    ] as AnclajeKt[],
    // Si la ráfaga supera al sostenido por más de este delta, resta puntos:
    // viento parejo se maneja, viento a golpes cansa y sorprende.
    rachaDeltaKt: 7,
    rachaPenal: 8,
  },

  sol: {
    // Nubosidad media (%) → fracción del peso de sol.
    curva: [
      { pct: 0, frac: 1.0 },
      { pct: 25, frac: 1.0 }, //  despejado
      { pct: 50, frac: 0.75 }, // parcial
      { pct: 75, frac: 0.45 }, // nublado
      { pct: 100, frac: 0.2 }, // cerrado
    ] as AnclajePct[],
    // Probabilidad de lluvia: resta proporcional hasta este máximo.
    probLluviaPenalMax: 12, // a 100 % de prob se restan 12 pts
  },

  ola: {
    // Altura de ola (m) → fracción del peso. Con 40 pies, 0.5 m ni se
    // siente; 1 m se navega; 1.5 m ya se elige otra ruta.
    curva: [
      { m: 0, frac: 1.0 },
      { m: 0.5, frac: 1.0 },
      { m: 0.9, frac: 0.7 },
      { m: 1.3, frac: 0.35 },
      { m: 1.8, frac: 0.1 },
      { m: 2.5, frac: 0 },
    ] as AnclajeM[],
    // Período largo = mar viejo, cómodo. Bono si el período medio del
    // mar total llega a este valor. Como ese período está ponderado por
    // energía, pedir ≥12 s ya implica swell limpio sin chop encima.
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
    // Tormenta eléctrica: códigos WMO 95/96/99 en la franja.
    // Open-Meteo no publica rayos: weather_code + CAPE son el proxy
    // (documentado en DECISIONES.md).
    tormentaCodes: [95, 96, 99],
    tormentaPenal: 60, // mata la franja aunque el resto esté perfecto
    /**
     * En franjas largas (la jornada del día) la tormenta penaliza en
     * proporción a las horas que ocupa, y solo marca PELIGRO si tapa
     * al menos esta fracción de la jornada. En los bloques de 2 h no
     * aplica: ahí cualquier tormenta es peligro, sin negociar.
     */
    tormentaPeligroFrac: 0.35,
    /**
     * Viento sostenido a partir del cual el día se marca PELIGRO, sin
     * depender de la curva de puntaje. La curva reparte puntos; esto
     * es una raya dura, para que "no salgas" no sea el resultado de
     * una interpolación. 22 kt es donde tu propia escala dice
     * "mala idea".
     */
    vientoPeligrosoKt: 22,
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
    vientoCurva: [
      { kt: 0, frac: 1.0 },
      { kt: 8, frac: 1.0 },
      { kt: 13, frac: 0.75 },
      { kt: 18, frac: 0.4 },
      { kt: 30, frac: 0.1 }, // de aquí en adelante se queda en 0.1
    ] as AnclajeKt[],
    lluviaCurva: [
      { pct: 0, frac: 1.0 },
      { pct: 15, frac: 1.0 },
      { pct: 40, frac: 0.6 },
      { pct: 70, frac: 0.25 },
      { pct: 100, frac: 0 },
    ] as AnclajePct[],
  },

  /**
   * Desacuerdo entre modelos, medido en puntos de viento del score
   * (de 45), a partir del cual el día se marca como "no confiable".
   *
   * No es cosmético: el 1-sep-2026 el viento típico de jornada del
   * corredor era 10.2 kt (ECMWF), 10.8 (GFS) y 5.8 (ICON) — el mismo
   * día valía 34 o 44 puntos de viento según a quién le creyeras.
   *
   * El umbral se eligió midiendo: sobre los 8 días de esa semana los
   * desacuerdos fueron 5.7 · 11.4 · 0.0 · 3.3 · 3.7 · 9.1 · 1.6 · 2.9.
   * Con 8 se marcan 2 de 8 días, justo los dos genuinamente flojos.
   * Bajarlo a 4 marcaría 3 de 8 y el aviso se vuelve papel tapiz:
   * si sale casi siempre, deja de querer decir algo.
   */
  desacuerdoModelosPts: 8,

  /** Etiquetas de calidad del score total. */
  niveles: [
    { desde: 75, etiqueta: 'Excelente', clase: 'ok' },
    { desde: 55, etiqueta: 'Bueno', clase: 'ok' },
    { desde: 35, etiqueta: 'Regular', clase: 'warn' },
    { desde: 0, etiqueta: 'Malo', clase: 'danger' },
  ],
} as const

export type Calibracion = typeof CALIBRACION

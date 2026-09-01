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
     *
     * ES LA PERILLA MÁS SENSIBLE DE TODAS, y NO está validada. Medido
     * el 1-sep-2026 sobre 180 días reales: pasarla a 0 cambia el mejor
     * día en 7 de 25 semanas y la etiqueta de 34 días; pasarla a 1
     * cambia 3 semanas y 42 etiquetas. Mueve más que cualquier peso.
     *
     * El 0.5 salió del criterio de Tommy, no de una medición: nadie ha
     * comprobado si un día que promedia 8 kt con pico de 14 se siente
     * como 11. Es lo primero que hay que confirmar cuando haya verdad de
     * campo (P1 en ACCURACY.md). No moverla a ojo.
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
    //
    // `rachaDeltaKt` es crítica y NO está validada: bajarla a 5 cambia
    // el mejor día en 6 de 25 semanas y la etiqueta de 35 de 180 días
    // (medido 1-sep-2026). El tamaño del castigo importa bastante menos
    // que el umbral: quitar `rachaPenal` entero mueve 2 semanas.
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
    // ELIMINADO el 1-sep-2026: el bono de "mar viejo, período largo"
    // (periodoLargoS 12 s → +3 pts). Se midió sobre 180 días reales del
    // corredor, 90 de seca y 90 de lluviosa: quitarlo cambia el score
    // 0.03 pts en promedio, no mueve NINGUNA de las 25 semanas y no
    // cambia NI UNA de las 180 etiquetas que ve el usuario.
    //
    // Por qué estaba muerto: `periodoS` es el período MÍNIMO de toda la
    // jornada, y pedir que el mínimo llegue a 12 s pasa en 2 de 90 días
    // por temporada. La regla estricta era deliberada —premiar solo si
    // el mar está largo TODO el día— pero termina no premiando nunca.
    //
    // Si alguna vez se quiere volver a premiar el mar cómodo, el
    // problema no es el tamaño del bono: es que habría que mirar el
    // período típico y no el mínimo. Detalle en ACCURACY.md.
  },

  marea: {
    // La marea pesa poco en el score (el CCX 40 entra a casi todo),
    // pero una bajamar extrema complica playas y bajos en Las Perlas.
    // Nivel relativo al rango del día: 0 = bajamar plena, 1 = pleamar.
    //
    // SE QUEDA, y no por inercia: medido el 1-sep-2026 sobre 180 días
    // reales, quitar el término entero mueve el score 5.81 pts en
    // promedio, cambia el día ganador en 4 de 25 semanas y cambia la
    // etiqueta de 52 de los 180 días. Es el tercer término que más pesa.
    //
    // AHORA, LOS VALORES DE ABAJO NO ESTÁN VALIDADOS. Que el término
    // importe no quiere decir que 0.15, 6, 3 y 2 sean los números
    // correctos: salieron del criterio de Tommy, no de una medición.
    // `bajaExtremaFrac` es la más sensible de las cuatro —moverla a 0.30
    // cambia el mejor día de la semana en 5 de 25 y cambia el top-1
    // absoluto— así que es la primera que habría que confirmar cuando
    // haya verdad de campo (P1 en ACCURACY.md). Hasta entonces: no
    // afinarlas a ojo.
    //
    // Nota de forma: este término reparte por CAJONES (0.3 / 0.6 / 0.8
    // del peso) mientras viento, sol y ola usan curvas interpoladas. Es
    // una inconsistencia consciente: convertirlo en curva sería inventar
    // valores intermedios sin nada que los respalde.
    bajaExtremaFrac: 0.15, // por debajo de esto en destino → penal
    bajaExtremaPenal: 6,
    vaciandoPenal: 3, // llegando con marea vaciando: pequeña resta
    llenandoBono: 2, // llegando con marea llenando: pequeño bono

    /**
     * Minutos que hay que SUMARLE a la hora de cada muestra de CMEMS.
     * El modelo adelanta la marea, y no es poco.
     *
     * Medido el 1-sep-2026 contra las predicciones armónicas oficiales
     * de NOAA (`scripts/medir-marea.mjs`), jun-ago 2026:
     *
     *   Balboa (Panamá)      n=356  −27.0 min  (p10 −35.0, p90 −19.4)
     *   Puntarenas (CR)      n=356  −33.7
     *   La Libertad (EC)     n=356  −33.3
     *   San Cristóbal (GAL)  n=356  −29.9
     *
     * Los 356 extremos de Balboa dieron TODOS negativos, de −40.6 a
     * −3.5 min. Que el mismo sesgo salga a 1900 km, en Galápagos y en
     * océano abierto, descarta que sea la geografía del Golfo: es fase
     * del modelo. El valor de ~30 min sugiere una convención de
     * etiquetado (la muestra de la hora H sería en realidad el promedio
     * de H a H+1, o sea centrada en H+30 min).
     *
     * Se usa el número medido en Panamá, que es donde se navega.
     * Efecto: el error típico del instante de pleamar/bajamar baja de
     * 27.0 a 3.6 min, y el p90 de 35.0 a 10.5.
     *
     * SI OPEN-METEO ARREGLA LA CONVENCIÓN, esto queda sobrando y habría
     * que ponerlo en 0. La forma de saberlo es volver a correr
     * `scripts/medir-marea.mjs`. Ver ACCURACY.md.
     */
    desfaseModeloMin: 27,
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
    tormentaPeligroFrac: 0.35, // medido: marca 1 % de los días de lluviosa
    /**
     * Viento sostenido a partir del cual el día se marca PELIGRO, sin
     * depender de la curva de puntaje. La curva reparte puntos; esto
     * es una raya dura, para que "no salgas" no sea el resultado de
     * una interpolación. 22 kt es donde tu propia escala dice
     * "mala idea".
     */
    vientoPeligrosoKt: 22,
    /**
     * Atmósfera muy cargada SIN tormenta declarada: el proxy para
     * cuando el modelo no marca 95/96/99 pero las condiciones están
     * puestas. Solo aplica si no hay tormenta declarada.
     *
     * CORRIGE la conclusión del 31-ago-2026, que decía que 2500 era el
     * percentil 93 y estaba bien puesto. Esa medición salió de 8 días
     * de una semana inusualmente calmada. Con 86 días reales de
     * pronóstico histórico (jun-ago 2026), el CAPE típico de jornada
     * en el corredor da p10=1755, p50=3062, p90=4188: 2500 disparaba en
     * el 44 % de los días sin tormenta. Papel tapiz.
     *
     * El trópico corre CAPE alto de rutina — 3000 J/kg es un martes
     * cualquiera en Panamá en agosto, no una señal. Umbrales medidos
     * sobre esos 86 días (% de días sin tormenta que dispararían):
     *   2500 → 44 % · 3000 → 35 % · 3500 → 24 % · 3800 → 17 % · 4000 → 9 %
     *
     * 3800 deja el aviso en una minoría real. En temporada seca el CAPE
     * típico es p50=1016 con máximo 3266 y CERO tormentas en 60 días,
     * así que el término queda dormido ahí — que es lo correcto: sin
     * convección no hay nada que avisar.
     */
    capeAltoJkg: 3800,
    capeAltoPenal: 20,
    lluviaFuerteMmH: 4, // medido: 5 % de los días de lluviosa
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
   * Desacuerdo entre modelos a partir del cual el día se marca como
   * "no confiable", medido en puntos del score de viento + sol (de 75).
   *
   * No es cosmético. El 1-sep-2026, para el 2-sep —el día que la app
   * estaba recomendando— los tres modelos veían: viento parecido, pero
   * ECMWF 28 % de nubes, GFS 95 % e ICON 46 %. O sea 21.6 de los 30
   * puntos que pesa el sol, en juego, sin que la app dijera nada.
   *
   * Escala: la primera versión miraba SOLO viento (de 45) con umbral 8.
   * Al sumar el sol la escala pasó a 75 y hubo que recalibrar. Medido
   * sobre los 8 días de esa semana, el desacuerdo combinado dio
   * 3.8 · 6.4 · 7.6 · 13.8 · 15.5 · 19.1 · 21.4 · 33.0.
   * Con 20 se marcan 2 de 8 días. Con 15 se marcarían 4 de 8 y el aviso
   * se vuelve papel tapiz: si sale la mitad de las veces, deja de
   * querer decir algo.
   *
   * OJO: el umbral está puesto sobre n=8 días. Es poco. Si al mirarlo
   * en otra época marca casi todo o casi nada, hay que remedirlo — la
   * receta está en ACCURACY.md.
   */
  desacuerdoModelosPts: 20,

  /**
   * Último día de anticipación en que el pronóstico le gana de verdad al
   * simple promedio de la temporada. Más allá, la app lo dice.
   *
   * Medido el 31-ago-2026 (`scripts/medir-skill.mjs`): corredor
   * marina+Contadora, horas 9-16, verdad = ERA5, ventana 1-jun a
   * 20-ago-2026, n≈600 por horizonte, climatología de 2019-2025.
   * Comparación PAREADA del MAE contra climatología, en nudos:
   *
   *   -1d −0.838 ±0.111   -2d −0.558 ±0.099   -3d −0.429 ±0.087
   *   -4d −0.213 ±0.092   -5d −0.195 ±0.085   ← hasta acá gana el modelo
   *   -6d +0.049 ±0.081   -7d +0.146 ±0.085   ← empate estadístico
   *
   * O sea: del día 6 en adelante el pronóstico no aporta nada por
   * encima de "así viene esta época del año". Los días se siguen
   * mostrando —Tommy pidió ver el domingo que viene— pero sin fingir
   * una precisión que la medición no respalda.
   *
   * OJO: medido en temporada LLUVIOSA. En seca los nortes son forzados
   * por sinóptica y la predictibilidad podría llegar más lejos. Ver
   * ACCURACY.md antes de mover este número.
   */
  skillHorizonteDias: 5,

  /** Etiquetas de calidad del score total. */
  niveles: [
    { desde: 75, etiqueta: 'Excelente', clase: 'ok' },
    { desde: 55, etiqueta: 'Bueno', clase: 'ok' },
    { desde: 35, etiqueta: 'Regular', clase: 'warn' },
    { desde: 0, etiqueta: 'Malo', clase: 'danger' },
  ],
} as const

export type Calibracion = typeof CALIBRACION

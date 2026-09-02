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
export type AnclajeIdx = Anclaje & { idx: number }

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
    /**
     * ÍNDICE DE SOL (radiación recibida / máximo teórico de esa hora)
     * → fracción del peso de sol. Es el insumo PRINCIPAL; la nubosidad
     * quedó de respaldo y para el texto que se lee en pantalla.
     *
     * POR QUÉ SE CAMBIÓ (medido 1-sep-2026, 90 días, 4 ubicaciones).
     * Se comparó qué variable predice mejor las horas de sol que
     * realmente hubo, con correlación de rangos:
     *
     *            -1d     -3d     -7d
     *   nubosidad        0.555   0.349   0.100
     *   RADIACIÓN        0.689   0.491   0.231   ← gana en los tres
     *   horas de sol     0.620   0.426   0.191
     *
     * A 7 días la radiación es 2.3 veces mejor. Y tiene sentido: en el
     * trópico la nubosidad lee alto (cirros finos, cúmulos sueltos) y
     * aun así pasa mucha luz. Es el mismo problema que producía
     * "despejado · lluvia 69 %".
     *
     * POR QUÉ ESTA CURVA Y NO UNA "FÍSICA". Una curva fiel a la física
     * (índice 0.55 → 0.79 del peso) subiría el score medio +9.2 puntos
     * y dejaría inválidos los umbrales de `niveles` y la calibración de
     * la probabilidad. Esta conserva el nivel (+2.1 pts de media) y NO
     * pierde nada de exactitud: la correlación de rangos es invariante
     * a transformaciones monótonas, así que la mejora del predictor se
     * conserva con cualquier curva creciente. El corrimiento se eligió
     * chico a propósito; la curva "física" queda documentada acá por si
     * algún día se decide recalibrar todo junto.
     *
     * Rango observado del índice en el corredor: 0.13 a 0.72 (el techo
     * de cielo despejado en el trópico ronda 0.70-0.75).
     */
    indiceCurva: [
      { idx: 0.15, frac: 0.2 }, //  oscuro de verdad
      { idx: 0.4, frac: 0.25 }, //  pasa poca luz
      { idx: 0.55, frac: 0.32 }, // día promedio de lluviosa
      { idx: 0.65, frac: 0.75 }, // buena luz
      { idx: 0.7, frac: 1.0 }, //   cielo abierto
    ] as AnclajeIdx[],

    // Nubosidad media (%) → fracción del peso de sol.
    // RESPALDO: se usa solo si no llegó la radiación. Se conserva
    // porque la nubosidad sigue siendo lo que se dice en palabras
    // ("nublado", "sol y chubascos") y porque sin ella el término
    // quedaría sin red si la API cambia.
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
   * REMEDIDO el 1-sep-2026 sobre 137 días, no 8: la API de pronóstico
   * histórico acepta `models=`, así que hay meses de multimodelo. El
   * número puesto a ojo aguantó.
   *
   *   LLUVIOSA (72 d): p50=12.6 p90=22.1 → con 20 marca el 19 %
   *   SECA     (65 d): p50=14.1 p90=33.4 → con 20 marca el 26 %
   *
   * Con 10 marcaría dos de cada tres días y el aviso se volvería papel
   * tapiz. En seca los modelos discrepan más en la cola (p90 33.4 vs
   * 22.1): los nortes se pronostican bien de media, pero cuando fallan,
   * fallan feo. Hay test de regresión con fixture.
   */
  desacuerdoModelosPts: 20,

  /**
   * Último día de anticipación en que el pronóstico le gana de verdad
   * al simple promedio de la temporada. Más allá, la app lo dice.
   *
   * ES ESTACIONAL, y no por gusto: se midió en las dos temporadas y dan
   * distinto. Corredor marina+Contadora, horas 9-16, verdad = ERA5,
   * n≈600 por horizonte, climatología 2019-2025, comparación PAREADA
   * del MAE contra climatología en nudos (`scripts/medir-skill.mjs`):
   *
   *   LLUVIOSA (1-jun a 20-ago-2026)
   *     -1d −0.838 ±0.111 · -3d −0.429 ±0.087 · -5d −0.195 ±0.085
   *     -6d +0.049 ±0.081 ← EMPATE · -7d +0.146 ±0.085 ← EMPATE
   *
   *   SECA (5-ene a 25-mar-2026)
   *     -1d −1.354 ±0.121 · -3d −1.154 ±0.126 · -5d −0.760 ±0.129
   *     -6d −0.773 ±0.127 · -7d −0.564 ±0.142 ← gana en TODOS
   *
   * En seca los nortes vienen forzados por sinóptica y se pronostican
   * bien hasta el día 7; en lluviosa manda la convección local, que a
   * partir del día 6 no se distingue del promedio de la época.
   *
   * Poner 5 todo el año castigaba de más justo en la temporada en que
   * más se sale. Poner 7 todo el año prometería precisión que en
   * lluviosa no existe.
   */
  skillHorizonteDias: { seca: 7, lluviosa: 5 },

  /**
   * Diferencia de score por debajo de la cual los destinos del día se
   * consideran EMPATADOS y la app dice "parejo en todos los puntos" en
   * vez de vender un ganador.
   *
   * Vivía escondida en ventanas.ts. Se movió acá el 1-sep-2026 porque
   * cambia lo que se lee en pantalla, y este archivo es la superficie
   * del producto: lo que decide el comportamiento se edita en un solo
   * lugar. Sin validar contra realidad.
   */
  umbralParejo: 3,

  /**
   * Diferencia entre la mañana y la tarde por debajo de la cual el día
   * se declara parejo y no se sugiere hora. Más chico que esto es ruido
   * del modelo, no una razón para cambiar la hora de salida.
   *
   * Está haciendo su trabajo: medido el 1-sep-2026, con este umbral los
   * tres modelos coinciden en la forma del día en 6 de 8 días, y los 2
   * que fallan son exactamente los que ya salen marcados por
   * desacuerdo. Bajarlo haría que la app afirme formas que los modelos
   * no sostienen.
   */
  umbralForma: 6,

  /**
   * Meses de temporada seca en Panamá (1 = enero). Se usa solo para
   * elegir el horizonte de skill. Mayo y noviembre son de transición y
   * quedan del lado LLUVIOSO a propósito: ante la duda, el valor
   * conservador.
   */
  mesesSecos: [12, 1, 2, 3, 4],

  /** Etiquetas de calidad del score total. */
  niveles: [
    { desde: 75, etiqueta: 'Excelente', clase: 'ok' },
    { desde: 55, etiqueta: 'Bueno', clase: 'ok' },
    { desde: 35, etiqueta: 'Regular', clase: 'warn' },
    { desde: 0, etiqueta: 'Malo', clase: 'danger' },
  ],
} as const

export type Calibracion = typeof CALIBRACION

// VIENTO CONTRA CORRIENTE — el caso que arruina el cruce aunque el
// viento sea bajo.
//
// Cuando el viento sopla en contra de la corriente, las olas se paran:
// se acortan, se empinan y rompen. Ocho nudos a favor son un paseo;
// ocho nudos en contra de un par de nudos de corriente es un mar
// desagradable y mojado en un center console.
//
// HASTA DÓNDE LLEGA ESTO, Y HASTA DÓNDE NO
// Medido el 1-sep-2026 sobre 90 días y 2160 horas-punto del corredor:
// la corriente que el modelo ve es DÉBIL — p50 0.49 kt, p90 0.81 kt,
// máximo 1.24 kt. Con el viento opuesto (>135°), corriente ≥0.5 kt y
// viento ≥8 kt, la condición aparece en el 1.5 % de las horas de
// jornada: raro, que es el perfil correcto de un aviso.
//
// Lo que este aviso NO ve: los PASOS entre islas de Las Perlas, donde
// la corriente acelera a varios nudos y es donde el viento en contra de
// verdad revuelve. El modelo tiene celdas de ~11 km y no resuelve esos
// canales. O sea que esto cubre el mar abierto del cruce y es
// estructuralmente ciego a lo peor. Va dicho en el UI, no escondido.

import { parsePanama } from './time'
import type { PuntoMarine, PuntoForecast } from './types'

export const KMH_A_KT = 0.539957

/**
 * Umbrales, elegidos con la distribución medida y no a ojo:
 *  · `corrienteMinKt` 0.5 es la mediana del corredor. Por debajo, la
 *    corriente no alcanza a parar el mar por más opuesta que venga.
 *  · `vientoMinKt` 6 deja entrar el caso que importa —viento bajo que
 *    igual arruina el cruce— sin marcar la calma chicha.
 *  · `anguloMin` 135° es "claramente en contra", no "de costado".
 */
export const CORRIENTE = {
  corrienteMinKt: 0.5,
  vientoMinKt: 6,
  anguloMin: 135,
  /** Horas opuestas dentro de la jornada para que valga avisar. */
  horasMin: 2,
}

/** Diferencia angular 0..180 entre dos rumbos. */
export function difAngulo(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360
  return d > 180 ? 360 - d : d
}

/**
 * ¿El viento va en contra de la corriente en esta hora?
 *
 * Ojo con la convención: el viento se nombra por DONDE VIENE, así que
 * sopla hacia `wind_direction + 180`. La corriente se nombra por DONDE
 * VA. Comparar los dos crudos daría el resultado invertido — es el
 * error clásico de este cálculo.
 */
export function enContra(
  vientoDesdeGrados: number,
  corrienteHaciaGrados: number,
): boolean {
  const vientoHacia = (vientoDesdeGrados + 180) % 360
  return difAngulo(vientoHacia, corrienteHaciaGrados) > CORRIENTE.anguloMin
}

export interface VentanaContra {
  desde: Date
  hasta: Date
  /** Corriente máxima de la ventana, en nudos. */
  corrienteKt: number
}

/**
 * Las horas de la jornada donde el viento va en contra de la corriente
 * con fuerza suficiente para que se note, agrupadas en tramos
 * contiguos. Vacío si no pasa, que es lo normal.
 */
export function ventanasEnContra(
  f: PuntoForecast,
  m: PuntoMarine | null,
  inicio: Date,
  horas: number,
): VentanaContra[] {
  if (!m) return []
  const t0 = inicio.getTime()
  const t1 = t0 + horas * 3600_000
  const iMar = new Map(m.hourly.time.map((t, i) => [t, i]))

  const marcadas: { t: Date; corrKt: number }[] = []
  for (let i = 0; i < f.hourly.time.length; i++) {
    const cuando = parsePanama(f.hourly.time[i])
    const ms = cuando.getTime()
    if (ms < t0 || ms >= t1) continue
    const j = iMar.get(f.hourly.time[i])
    if (j == null) continue
    const vKt = f.hourly.wind_speed_10m[i]
    const vDir = f.hourly.wind_direction_10m[i]
    const cKmh = m.hourly.ocean_current_velocity?.[j]
    const cDir = m.hourly.ocean_current_direction?.[j]
    if (vKt == null || vDir == null || cKmh == null || cDir == null) continue
    const cKt = cKmh * KMH_A_KT
    if (vKt < CORRIENTE.vientoMinKt) continue
    if (cKt < CORRIENTE.corrienteMinKt) continue
    if (!enContra(vDir, cDir)) continue
    marcadas.push({ t: cuando, corrKt: cKt })
  }
  if (marcadas.length < CORRIENTE.horasMin) return []

  // Agrupar horas contiguas en tramos.
  const out: VentanaContra[] = []
  let ini = 0
  for (let k = 1; k <= marcadas.length; k++) {
    const corta =
      k === marcadas.length ||
      marcadas[k].t.getTime() - marcadas[k - 1].t.getTime() > 3600_000
    if (!corta) continue
    const tramo = marcadas.slice(ini, k)
    if (tramo.length >= CORRIENTE.horasMin) {
      out.push({
        desde: tramo[0].t,
        hasta: new Date(tramo[tramo.length - 1].t.getTime() + 3600_000),
        corrienteKt: Math.max(...tramo.map((x) => x.corrKt)),
      })
    }
    ini = k
  }
  return out
}

// Línea de tiempo horaria deslizable: las próximas horas de un punto.

import type { PuntoForecast, PuntoMarine } from '../lib/types'
import { parsePanama, horaMuyCorta, esHoy, diaCorto, ahoraPanama } from '../lib/time'
import { cieloDeCodigo } from '../lib/wmo'
import { Icono } from './Icono'
import { fmtOla, fmtViento, type Unidades } from '../lib/units'

interface Props {
  forecast: PuntoForecast
  marine: PuntoMarine | null
  unidades: Unidades
  /** cuántas horas hacia adelante mostrar */
  horas?: number
  conOla?: boolean
}

export function Timeline({ forecast, marine, unidades, horas = 30, conOla = true }: Props) {
  // incluye la hora en curso
  const ahora = ahoraPanama().getTime() - 3600_000
  const items: {
    t: Date
    code: number | null
    viento: number | null
    prob: number | null
    ola: number | null
  }[] = []

  for (let i = 0; i < forecast.hourly.time.length && items.length < horas; i++) {
    const t = parsePanama(forecast.hourly.time[i])
    if (t.getTime() < ahora) continue
    let ola: number | null = null
    if (marine) {
      const j = marine.hourly.time.indexOf(forecast.hourly.time[i])
      if (j >= 0) ola = marine.hourly.wave_height[j]
    }
    items.push({
      t,
      code: forecast.hourly.weather_code[i],
      viento: forecast.hourly.wind_speed_10m[i],
      prob: forecast.hourly.precipitation_probability[i],
      ola,
    })
  }

  return (
    <div className="timeline" role="list" aria-label="Pronóstico por hora">
      {items.map((it, i) => {
        const cielo = cieloDeCodigo(it.code)
        return (
          <div className="tl-hora" role="listitem" key={i}>
            <span className="tl-cuando">
              {esHoy(it.t) ? horaMuyCorta(it.t) : `${diaCorto(it.t).split(' ')[0]} ${horaMuyCorta(it.t)}`}
            </span>
            <span className={`tl-icono cielo-${cielo.icono}`} title={cielo.texto}>
              <Icono nombre={cielo.icono} size={26} />
            </span>
            <span className="tl-viento">{fmtViento(it.viento, unidades)}</span>
            {conOla && <span className="tl-ola">{fmtOla(it.ola, unidades)}</span>}
            <span className={`tl-prob ${it.prob != null && it.prob > 40 ? 'alta' : ''}`}>
              {it.prob != null ? `${Math.round(it.prob)} %` : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

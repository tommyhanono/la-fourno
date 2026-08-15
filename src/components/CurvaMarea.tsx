// Curva de marea del día (SVG). Marca pleamares y bajamares con hora
// y altura, la línea de "ahora" y siempre la etiqueta ESTIMADO:
// el nivel sale de un modelo, no de una tabla oficial.

import { useMemo } from 'react'
import type { SerieMarea } from '../lib/tide'
import { extremos, nivelEn } from '../lib/tide'
import { horaCorta } from '../lib/time'

interface Props {
  serie: SerieMarea
  /** medianoche (Panamá) del día a dibujar */
  dia: Date
}

const W = 640
const H = 236
const PAD_X = 34
const PAD_TOP = 42
/** Banda inferior reservada: caben las etiquetas de bajamar Y el eje,
    que antes se pisaban entre sí. */
const PAD_BOT = 54
/** Alto de las dos líneas de etiqueta (hora + nivel) desde el punto. */
const ETIQ_ALTO = 34
const EJE_Y = H - 10

export function CurvaMarea({ serie, dia }: Props) {
  const t0 = dia.getTime()
  const t1 = t0 + 24 * 3600_000

  const modelo = useMemo(() => {
    const puntos: { t: number; v: number }[] = []
    // muestreo cada 15 min con interpolación para curva suave
    for (let t = t0; t <= t1; t += 15 * 60_000) {
      const v = nivelEn(serie, new Date(t))
      if (v != null) puntos.push({ t, v })
    }
    const ext = extremos(serie, new Date(t0), new Date(t1))
    return { puntos, ext }
  }, [serie, t0, t1])

  if (modelo.puntos.length < 8) {
    return (
      <p className="sin-dato" role="status">
        Sin dato de marea para este día.
      </p>
    )
  }

  const vs = modelo.puntos.map((p) => p.v)
  const vMin = Math.min(...vs) - 0.35
  const vMax = Math.max(...vs) + 0.35
  const x = (t: number) => PAD_X + ((t - t0) / (t1 - t0)) * (W - 2 * PAD_X)
  const y = (v: number) =>
    PAD_TOP + (1 - (v - vMin) / (vMax - vMin)) * (H - PAD_TOP - PAD_BOT)

  const d = modelo.puntos
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join(' ')
  const area = `${d} L${x(modelo.puntos[modelo.puntos.length - 1].t).toFixed(1)},${H - PAD_BOT} L${x(modelo.puntos[0].t).toFixed(1)},${H - PAD_BOT} Z`

  const ahora = Date.now()
  const mostrarAhora = ahora >= t0 && ahora <= t1

  return (
    <figure className="curva-marea">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Curva de marea estimada del día, con ${modelo.ext.length} extremos`}
      >
        {/* nivel 0 (MSL) de referencia */}
        {vMin < 0 && vMax > 0 && (
          <line x1={PAD_X} x2={W - PAD_X} y1={y(0)} y2={y(0)} className="cm-cero" />
        )}
        <path d={area} className="cm-area" />
        <path d={d} className="cm-linea" />
        {mostrarAhora && (
          <line x1={x(ahora)} x2={x(ahora)} y1={PAD_TOP - 12} y2={H - PAD_BOT} className="cm-ahora" />
        )}
        {modelo.ext.map((e, i) => {
          const ex = x(e.time.getTime())
          const ey = y(e.nivel)
          // Las etiquetas van del lado que corresponde, salvo que ahí no
          // quepan: entonces se voltean, en vez de salirse del gráfico.
          let debajo = e.tipo === 'bajamar'
          if (debajo && ey + ETIQ_ALTO > H - PAD_BOT + 20) debajo = false
          if (!debajo && ey - ETIQ_ALTO < 8) debajo = true
          // Cerca de los bordes se ancla al filo para no salirse.
          const ancla = ex < PAD_X + 40 ? 'start' : ex > W - PAD_X - 40 ? 'end' : 'middle'
          const tx = ancla === 'start' ? ex - 6 : ancla === 'end' ? ex + 6 : ex
          return (
            <g key={i}>
              <circle cx={ex} cy={ey} r="5" className={`cm-ext ${e.tipo}`} />
              <text
                x={tx}
                y={debajo ? ey + 18 : ey - 22}
                textAnchor={ancla}
                className="cm-ext-hora"
              >
                {horaCorta(e.time)}
              </text>
              <text
                x={tx}
                y={debajo ? ey + 31 : ey - 9}
                textAnchor={ancla}
                className="cm-ext-nivel"
              >
                {e.nivel.toFixed(1)} m
              </text>
            </g>
          )
        })}
        {/* eje de horas, en su banda propia */}
        {[0, 6, 12, 18, 24].map((h) => (
          <text
            key={h}
            x={x(t0 + h * 3600_000)}
            y={EJE_Y}
            textAnchor={h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}
            className="cm-eje"
          >
            {h === 0 || h === 24 ? '12 am' : h === 12 ? '12 pm' : h < 12 ? `${h} am` : `${h - 12} pm`}
          </text>
        ))}
      </svg>
      <figcaption className="cm-nota">
        Marea <strong>estimada</strong> (modelo, no tabla oficial) · pleamares y
        bajamares con hora local · alturas sobre el nivel medio del mar
      </figcaption>
    </figure>
  )
}

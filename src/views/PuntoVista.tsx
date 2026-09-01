// Vista por punto. Navegación: ahora + curva de marea + sol + timeline
// + semana. Playa: sol, lluvia, viento, UV, marea y horas de sol.

import { useMemo } from 'react'
import { PUNTOS, puntoPorId } from '../config/puntos'
import { CALIBRACION } from '../config/calibracion'
import type { EstadoDatos } from '../state/hooks'
import type { Unidades } from '../lib/units'
import { fmtViento, fmtOla, fmtTemp, fmtMarea, refMarea, procedencia } from '../lib/units'
import { Header, AvisoSeguridad } from '../components/Marco'
import { CurvaMarea } from '../components/CurvaMarea'
import { Timeline } from '../components/Timeline'
import { BadgeScore, Desglose } from '../components/Desglose'
import { Icono } from '../components/Icono'
import { cieloDeCodigo, textoCieloDia } from '../lib/wmo'
import { serieMarea, nivelEn, tendenciaEn } from '../lib/tide'
import { diasPlaya } from '../lib/ventanas'
import {
  parsePanama,
  horaCorta,
  claveDia,
  ahoraPanama,
  nombreDia,
} from '../lib/time'

export function PuntoVista({
  id,
  estado,
  unidades,
}: {
  id: string
  estado: EstadoDatos
  unidades: Unidades
}) {
  const punto = puntoPorId(id)
  const i = PUNTOS.findIndex((p) => p.id === id)
  const datos = estado.datos
  const f = datos?.forecast[i]
  const m = datos?.marine[i] ?? null

  const marea = useMemo(
    () => (m ? serieMarea(m.hourly.time, m.hourly.sea_level_height_msl) : null),
    [m],
  )

  if (!punto) {
    return (
      <div className="pantalla">
        <Header estado={estado} atras titulo="Punto no encontrado" />
        <main>
          <p className="sin-dato">Ese punto no existe. Vuelve al inicio.</p>
        </main>
        <AvisoSeguridad />
      </div>
    )
  }

  const ahora = ahoraPanama()
  const nowIdx = f ? indiceHoraActual(f.hourly.time) : 0

  return (
    <div className="pantalla">
      <Header estado={estado} atras titulo={punto.nombre} />
      <main>
        <p className="punto-desc">
          {punto.descripcion}
          {punto.estimado && ' · ubicación estimada (ver puntos.ts)'}
        </p>

        {!f ? (
          <div className="tarjeta vacio" role="status">
            <Icono nombre="alerta" size={28} />
            <p>
              <strong>Sin datos para este punto.</strong> Revisa tu conexión y
              toca actualizar.
            </p>
          </div>
        ) : punto.tipo === 'nav' ? (
          <VistaNav
            f={f}
            m={m}
            marea={marea}
            unidades={unidades}
            nowIdx={nowIdx}
            ahora={ahora}
          />
        ) : (
          <VistaPlaya
            id={punto.id}
            estado={estado}
            f={f}
            marea={marea}
            unidades={unidades}
            nowIdx={nowIdx}
            ahora={ahora}
          />
        )}
      </main>
      <AvisoSeguridad />
    </div>
  )
}

type F = NonNullable<EstadoDatos['datos']>['forecast'][number]
type M = NonNullable<EstadoDatos['datos']>['marine'][number]

function VistaNav({
  f,
  m,
  marea,
  unidades,
  nowIdx,
  ahora,
}: {
  f: F
  m: M
  marea: ReturnType<typeof serieMarea> | null
  unidades: Unidades
  nowIdx: number
  ahora: Date
}) {
  const code = f.hourly.weather_code[nowIdx]
  const cielo = cieloDeCodigo(code)
  const nivel = marea ? nivelEn(marea, ahora) : null
  const tendencia = marea ? tendenciaEn(marea, ahora) : null
  const olaIdx = m ? m.hourly.time.indexOf(f.hourly.time[nowIdx]) : -1

  return (
    <>
      <section className="tarjeta ahora" aria-label="Condiciones ahora">
        <h2>Ahora</h2>
        <div className="ahora-grid">
          <Dato
            icono="viento"
            titulo="Viento"
            valor={fmtViento(f.hourly.wind_speed_10m[nowIdx], unidades)}
            extra={`rachas ${fmtViento(f.hourly.wind_gusts_10m[nowIdx], unidades)} · ${procedencia(f.hourly.wind_direction_10m[nowIdx])}`}
          />
          <Dato
            icono={cielo.icono}
            titulo="Cielo"
            valor={cielo.texto}
            extra={
              f.hourly.precipitation_probability[nowIdx] != null
                ? `${Math.round(f.hourly.precipitation_probability[nowIdx]!)} % prob. de lluvia`
                : undefined
            }
          />
          <Dato
            icono="ola"
            titulo="Ola"
            valor={fmtOla(m && olaIdx >= 0 ? m.hourly.wave_height[olaIdx] : null, unidades)}
            extra={
              m && olaIdx >= 0 && m.hourly.wave_period[olaIdx] != null
                ? `cada ${Math.round(m.hourly.wave_period[olaIdx]!)} s ${procedencia(m.hourly.wave_direction[olaIdx])}`
                : undefined
            }
          />
          <Dato
            icono={tendencia === 'vaciando' ? 'marea-baja' : 'marea-sube'}
            titulo="Marea (estimada)"
            valor={fmtMarea(nivel)}
            extra={[refMarea(nivel), tendencia].filter(Boolean).join(' · ') || undefined}
          />
          <Dato
            icono="sol"
            titulo="Temperatura"
            valor={fmtTemp(f.hourly.temperature_2m[nowIdx], unidades)}
            extra={
              f.hourly.uv_index[nowIdx] != null
                ? `UV ${Math.round(f.hourly.uv_index[nowIdx]!)}`
                : undefined
            }
          />
          <SolHoy f={f} />
        </div>
      </section>

      {marea && (
        <section className="tarjeta" aria-label="Curva de marea del día">
          <h2>Marea del día</h2>
          <CurvaMarea serie={marea} dia={medianoche(ahora)} />
        </section>
      )}

      <section className="tarjeta" aria-label="Próximas horas">
        <h2>Próximas horas</h2>
        <Timeline forecast={f} marine={m} unidades={unidades} />
      </section>

      <SemanaNav f={f} m={m} unidades={unidades} />
    </>
  )
}

function VistaPlaya({
  id,
  estado,
  f,
  marea,
  unidades,
  nowIdx,
  ahora,
}: {
  id: string
  estado: EstadoDatos
  f: F
  marea: ReturnType<typeof serieMarea> | null
  unidades: Unidades
  nowIdx: number
  ahora: Date
}) {
  const code = f.hourly.weather_code[nowIdx]
  const cielo = cieloDeCodigo(code)
  const nivel = marea ? nivelEn(marea, ahora) : null
  const tendencia = marea ? tendenciaEn(marea, ahora) : null
  const dias = estado.datos ? diasPlaya(estado.datos, id) : []

  return (
    <>
      <section className="tarjeta ahora" aria-label="Condiciones ahora">
        <h2>Ahora</h2>
        <div className="ahora-grid">
          <Dato icono={cielo.icono} titulo="Cielo" valor={cielo.texto} />
          <Dato
            icono="viento"
            titulo="Viento"
            valor={fmtViento(f.hourly.wind_speed_10m[nowIdx], unidades)}
          />
          <Dato
            icono="uv"
            titulo="UV"
            valor={
              f.hourly.uv_index[nowIdx] != null
                ? `${Math.round(f.hourly.uv_index[nowIdx]!)}`
                : '—'
            }
            extra={etiquetaUv(f.hourly.uv_index[nowIdx])}
          />
          <Dato
            icono="gota"
            titulo="Lluvia"
            valor={
              f.hourly.precipitation_probability[nowIdx] != null
                ? `${Math.round(f.hourly.precipitation_probability[nowIdx]!)} %`
                : '—'
            }
          />
          <Dato
            icono={tendencia === 'vaciando' ? 'marea-baja' : 'marea-sube'}
            titulo="Marea (estimada)"
            valor={fmtMarea(nivel)}
            extra={[refMarea(nivel), tendencia].filter(Boolean).join(' · ') || undefined}
          />
          <SolHoy f={f} />
        </div>
      </section>

      {marea && (
        <section className="tarjeta" aria-label="Curva de marea del día">
          <h2>Marea del día</h2>
          <CurvaMarea serie={marea} dia={medianoche(ahora)} />
        </section>
      )}

      <section className="tarjeta" aria-label="Próximas horas">
        <h2>Próximas horas</h2>
        <Timeline forecast={f} marine={null} unidades={unidades} conOla={false} />
      </section>

      <section className="tarjeta" aria-label="Días de playa esta semana">
        <h2>¿Qué día de playa?</h2>
        <p className="sub-seccion">
          Puntuado sobre las horas de playa: {hora12(CALIBRACION.jornada.desdeHora)}{' '}
          a {hora12(CALIBRACION.jornada.hastaHora)}.
        </p>
        <ul className="semana">
          {dias.map((d) => (
            <li key={d.clave} className="semana-fila">
              <span className="semana-dia">{nombreDia(d.dia)}</span>
              <span className="semana-datos">
                {d.tempMax != null ? fmtTemp(d.tempMax, unidades) : '—'}
                {d.uvMax != null ? ` · UV ${Math.round(d.uvMax)}` : ''}
              </span>
              <BadgeScore score={d.score} />
              <Desglose score={d.score} id={`playa-${d.clave}`} />
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function SemanaNav({ f, m, unidades }: { f: F; m: M; unidades: Unidades }) {
  // Resumen por día en la MISMA franja que el "Día por día" del inicio
  // (la jornada de calibracion.ts). Antes esto iba de 6 am a 6 pm y el
  // mismo día daba dos números distintos según dónde lo miraras.
  const { desdeHora, hastaHora } = CALIBRACION.jornada
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`
  const dias = f.daily.time.map((dia) => {
    const desde = parsePanama(`${dia}T${hh(desdeHora)}`).getTime()
    const hasta = parsePanama(`${dia}T${hh(hastaHora)}`).getTime()
    let vientoMax: number | null = null
    let probMax: number | null = null
    let nubes: number[] = []
    let olaMax: number | null = null
    for (let i = 0; i < f.hourly.time.length; i++) {
      const t = parsePanama(f.hourly.time[i]).getTime()
      if (t < desde || t > hasta) continue
      const v = f.hourly.wind_speed_10m[i]
      if (v != null) vientoMax = vientoMax == null ? v : Math.max(vientoMax, v)
      const pr = f.hourly.precipitation_probability[i]
      if (pr != null) probMax = probMax == null ? pr : Math.max(probMax, pr)
      const n = f.hourly.cloud_cover[i]
      if (n != null) nubes.push(n)
    }
    if (m) {
      for (let i = 0; i < m.hourly.time.length; i++) {
        const t = parsePanama(m.hourly.time[i]).getTime()
        if (t < desde || t > hasta) continue
        const o = m.hourly.wave_height[i]
        if (o != null) olaMax = olaMax == null ? o : Math.max(olaMax, o)
      }
    }
    const nubesMedia = nubes.length
      ? nubes.reduce((a, b) => a + b, 0) / nubes.length
      : null
    return { dia, vientoMax, probMax, nubesMedia, olaMax }
  })

  return (
    <section className="tarjeta" aria-label="Resumen semanal">
      <h2>La semana</h2>
      {/* Qué es cada número, dicho tal cual: mezclar máximos y promedios
          sin avisar es lo que hacía dudar del dato. */}
      <p className="sub-seccion">
        Solo este punto, en tu jornada ({hora12(desdeHora)} a{' '}
        {hora12(hastaHora)}). Viento y ola son el máximo del día; el cielo,
        el promedio. El inicio suma además el punto de salida.
      </p>
      <ul className="semana">
        {dias.map((d) => (
          <li key={d.dia} className="semana-fila">
            <span className="semana-dia">{nombreDia(parsePanama(`${d.dia}T12:00`))}</span>
            <span className="semana-datos">
              <Icono nombre="viento" size={18} /> {fmtViento(d.vientoMax, unidades)}
              {' · '}
              <Icono nombre="ola" size={18} /> {fmtOla(d.olaMax, unidades)}
            </span>
            <span className="semana-cielo">
              {textoCieloDia(d.nubesMedia, d.probMax)}
              {d.probMax != null && d.probMax > 30
                ? ` · lluvia ${Math.round(d.probMax)} %`
                : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Dato({
  icono,
  titulo,
  valor,
  extra,
}: {
  icono: Parameters<typeof Icono>[0]['nombre']
  titulo: string
  valor: string
  extra?: string
}) {
  return (
    <div className="dato">
      <span className="dato-icono">
        <Icono nombre={icono} size={26} />
      </span>
      <span className="dato-titulo">{titulo}</span>
      <span className="dato-valor">{valor}</span>
      {extra && <span className="dato-extra">{extra}</span>}
    </div>
  )
}

function SolHoy({ f }: { f: F }) {
  const hoy = claveDia(ahoraPanama())
  const idx = f.daily.time.indexOf(hoy)
  const sunrise = idx >= 0 ? parsePanama(f.daily.sunrise[idx]) : null
  const sunset = idx >= 0 ? parsePanama(f.daily.sunset[idx]) : null
  return (
    <div className="dato">
      <span className="dato-icono">
        <Icono nombre="amanecer" size={26} />
      </span>
      <span className="dato-titulo">Sol</span>
      <span className="dato-valor">
        {sunrise ? horaCorta(sunrise) : '—'} / {sunset ? horaCorta(sunset) : '—'}
      </span>
      <span className="dato-extra">sale / se pone</span>
    </div>
  )
}

function etiquetaUv(uv: number | null | undefined): string | undefined {
  if (uv == null) return undefined
  if (uv >= 11) return 'extremo — sombra sí o sí'
  if (uv >= 8) return 'muy alto'
  if (uv >= 6) return 'alto'
  if (uv >= 3) return 'moderado'
  return 'bajo'
}

function indiceHoraActual(times: string[]): number {
  const ahora = Date.now()
  let mejor = 0
  for (let i = 0; i < times.length; i++) {
    if (parsePanama(times[i]).getTime() <= ahora) mejor = i
    else break
  }
  return mejor
}

/** "9 am" a partir de la hora entera de la calibración. */
function hora12(h: number): string {
  const ampm = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12} ${ampm}`
}

function medianoche(d: Date): Date {
  return parsePanama(`${claveDia(d)}T00:00`)
}

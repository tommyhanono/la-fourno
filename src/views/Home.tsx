// Pantalla principal = la respuesta: "¿cuándo salgo esta semana?"
// Las 3 mejores ventanas arriba, entendibles en 3 segundos, y la
// lista de puntos abajo.

import { useMemo } from 'react'
import { PUNTOS } from '../config/puntos'
import type { EstadoDatos } from '../state/hooks'
import type { Unidades } from '../lib/units'
import { fmtViento, fmtOla } from '../lib/units'
import {
  bloquesCorredor,
  mejoresVentanas,
  jornadasSemana,
  diasPlaya,
  type RangoDia,
} from '../lib/ventanas'
import { nombreDia, horaCorta, horaMuyCorta, claveDia, parsePanama } from '../lib/time'
import { Header, AvisoSeguridad } from '../components/Marco'
import { BadgeScore, Desglose } from '../components/Desglose'
import { Icono } from '../components/Icono'
import { cieloDeCodigo } from '../lib/wmo'

export function Home({ estado, unidades }: { estado: EstadoDatos; unidades: Unidades }) {
  const { datos } = estado

  const bloques = useMemo(() => (datos ? bloquesCorredor(datos) : []), [datos])
  const ventanas = useMemo(() => mejoresVentanas(bloques), [bloques])
  const semana = useMemo(() => (datos ? jornadasSemana(datos) : []), [datos])

  // El mejor día de la semana se marca: si no, ocho tarjetas iguales
  // obligan a comparar ocho números a mano. Solo si es salible.
  const mejorDiaClave = useMemo(() => {
    const salibles = semana.filter((d) => !d.score.peligro)
    if (salibles.length === 0) return null
    return salibles.reduce((a, b) => (b.score.total > a.score.total ? b : a)).clave
  }, [semana])

  // El mejor bloque de 2 h de cada día. Sin esto, la pantalla parece
  // contradecirse: arriba "mañana 8–10 am, 65" y abajo "mañana, 11".
  // Son dos preguntas distintas (el mejor MOMENTO vs. el día entero) y
  // mostrarlas juntas es lo que las vuelve legibles.
  const mejorMomento = useMemo(() => {
    const m = new Map<string, (typeof bloques)[number]>()
    for (const b of bloques) {
      if (b.score.peligro) continue
      const k = claveDia(b.inicio)
      const previo = m.get(k)
      if (!previo || b.score.total > previo.score.total) m.set(k, b)
    }
    return m
  }, [bloques])

  return (
    <div className="pantalla">
      <Header estado={estado} />
      <main>
        <section className="seccion-ventanas" aria-labelledby="titulo-semana">
          <h2 id="titulo-semana" className="titulo-hero">
            ¿Cuándo salgo esta semana?
          </h2>
          <p className="sub-hero">
            Corredor Marina Ocean Reef → Las Perlas · calibrado para el CCX 40
          </p>
          {!datos ? (
            <CargandoOFallo estado={estado} />
          ) : ventanas.length === 0 ? (
            <div className="tarjeta vacio" role="status">
              <Icono nombre="alerta" size={28} />
              <p>
                <strong>Esta semana no pinta.</strong> Ningún bloque de luz pasa
                el filtro de seguridad o de datos. Abre un punto para ver el
                detalle, o vuelve a mirar cuando se actualice el pronóstico.
              </p>
            </div>
          ) : (
            <ol className="ventanas">
              {ventanas.map((v, i) => (
                <li
                  key={i}
                  className={`tarjeta ventana ${
                    v.score.total === Math.max(...ventanas.map((x) => x.score.total))
                      ? 'mejor'
                      : ''
                  }`}
                >
                  <div className="ventana-cabeza">
                    <span className="ventana-dia">{nombreDia(v.inicio)}</span>
                    <span className="ventana-horas">
                      {horaMuyCorta(v.inicio)} – {horaMuyCorta(v.fin)}
                    </span>
                    <BadgeScore score={v.score} />
                  </div>
                  <p className="ventana-resumen">
                    {resumenVentana(v.entrada.vientoKt, v.entrada.olaM, v.entrada.nubosidadPct, unidades)}
                  </p>
                  <Desglose score={v.score} id={`desglose-${i}`} />
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* La sección se renderiza siempre: el esqueleto reserva su
            altura y evita el salto de layout cuando llegan los datos. */}
        <section aria-labelledby="titulo-dias" className="seccion-dias">
            <h2 id="titulo-dias">Día por día</h2>
            <p className="sub-seccion">
              Cada día completo en tu jornada de siempre (sales 9–10 am,
              vuelves 3–4 pm), con el mejor destino según el clima de ese día.
            </p>
            <ul className="dias">
              {semana.map((d) => (
                <li
                  key={d.clave}
                  className={`tarjeta dia ${d.clave === mejorDiaClave ? 'mejor-dia' : ''}`}
                >
                  <div className="dia-cabeza">
                    <span className="dia-nombre">{nombreDia(d.dia)}</span>
                    {d.clave === mejorDiaClave && (
                      <span className="dia-sello">El mejor de la semana</span>
                    )}
                    <BadgeScore score={d.score} />
                  </div>

                  {d.score.peligro && (
                    <p className="dia-peligro">
                      <Icono nombre="alerta" size={18} />
                      <span>No recomendado para salir</span>
                    </p>
                  )}

                  <dl className="dia-datos">
                    <div>
                      <dt>Viento</dt>
                      <dd>{rangoViento(d.rango, unidades)}</dd>
                    </div>
                    <div>
                      <dt>Ola</dt>
                      <dd>{rangoOla(d.rango, unidades)}</dd>
                    </div>
                    <div>
                      <dt>Cielo</dt>
                      <dd>{textoCielo(d.entrada.nubosidadPct)}</dd>
                    </div>
                    <div>
                      <dt>Lluvia</dt>
                      <dd>
                        {d.entrada.probLluviaPct != null
                          ? `${Math.round(d.entrada.probLluviaPct)} %`
                          : '—'}
                      </dd>
                    </div>
                  </dl>

                  <p className="dia-destino">
                    {d.parejo ? 'Parejo en todos los puntos · sugerido' : 'Mejor destino'}{' '}
                    <a href={`#/punto/${d.mejorDestino.id}`}>{d.mejorDestino.nombre}</a>
                  </p>

                  {mejorMomento.get(d.clave) && (
                    <p className="dia-momento">
                      Mejor momento del día:{' '}
                      <strong>
                        {horaMuyCorta(mejorMomento.get(d.clave)!.inicio)} –{' '}
                        {horaMuyCorta(mejorMomento.get(d.clave)!.fin)}
                      </strong>{' '}
                      ({mejorMomento.get(d.clave)!.score.total}/100 en ese rato)
                    </p>
                  )}

                  <p className="dia-extra">
                    {d.tormentaDesde && (
                      <span className="dia-tormenta">
                        Tormenta desde {horaMuyCorta(d.tormentaDesde)}
                        {' · '}
                      </span>
                    )}
                    {/* Con minutos: a qué hora exacta se hace de noche
                        decide si vuelves con luz. */}
                    {d.sol && (
                      <>
                        sol {horaCorta(d.sol.sale)} – {horaCorta(d.sol.sePone)}
                      </>
                    )}
                  </p>

                  <Desglose score={d.score} id={`dia-${d.clave}`} />
                </li>
              ))}
              {semana.length === 0 &&
                Array.from({ length: 7 }, (_, i) => (
                  <li key={`hueco-${i}`} className="tarjeta dia hueco" aria-hidden>
                    <div className="dia-cabeza">
                      <span className="dia-nombre">—</span>
                    </div>
                    <dl className="dia-datos">
                      {['Viento', 'Ola', 'Cielo', 'Lluvia'].map((t) => (
                        <div key={t}>
                          <dt>{t}</dt>
                          <dd>—</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="dia-destino">—</p>
                    <p className="dia-momento">—</p>
                    <p className="dia-extra">—</p>
                    <span className="hueco-desglose">—</span>
                  </li>
                ))}
            </ul>
          </section>

        <section aria-labelledby="titulo-puntos" className="seccion-puntos">
          <h2 id="titulo-puntos">Mis puntos</h2>
          <h3 className="grupo-titulo">
            <Icono nombre="ancla" size={20} /> Navegación
          </h3>
          <ul className="lista-puntos">
            {PUNTOS.filter((p) => p.tipo === 'nav').map((p) => (
              <FilaPunto key={p.id} id={p.id} estado={estado} unidades={unidades} />
            ))}
          </ul>
          <h3 className="grupo-titulo">
            <Icono nombre="playa" size={20} /> Playa
          </h3>
          <ul className="lista-puntos">
            {PUNTOS.filter((p) => p.tipo === 'playa').map((p) => (
              <FilaPunto key={p.id} id={p.id} estado={estado} unidades={unidades} />
            ))}
          </ul>
        </section>
      </main>
      <AvisoSeguridad />
    </div>
  )
}

function resumenVentana(
  vientoKt: number | null,
  olaM: number | null,
  nubes: number | null,
  u: Unidades,
): string {
  const partes: string[] = []
  if (vientoKt != null) partes.push(`viento ${fmtViento(vientoKt, u)}`)
  if (olaM != null) partes.push(`ola ${fmtOla(olaM, u)}`)
  if (nubes != null)
    partes.push(nubes <= 25 ? 'despejado' : nubes <= 50 ? 'sol parcial' : 'nublado')
  return partes.join(' · ') || 'sin resumen'
}

/**
 * Rango medido del día, no un promedio inventado: "5–14 kt" es un dato
 * que existe en el pronóstico y le dice al capitán cuánto puede picar.
 * Si el día es parejo, un solo número.
 */
function rangoViento(r: RangoDia, u: Unidades): string {
  if (r.vientoMax == null) return '—'
  if (r.vientoMin == null || Math.round(r.vientoMax) - Math.round(r.vientoMin) < 2) {
    return fmtViento(r.vientoMax, u)
  }
  return `${Math.round(u.viento === 'kt' ? r.vientoMin : r.vientoMin * 1.852)}–${fmtViento(r.vientoMax, u)}`
}

function rangoOla(r: RangoDia, u: Unidades): string {
  if (r.olaMax == null) return '—'
  const conv = (m: number) => (u.ola === 'ft' ? m * 3.28084 : m)
  if (r.olaMin == null || conv(r.olaMax) - conv(r.olaMin) < 0.4) {
    return fmtOla(r.olaMax, u)
  }
  return `${conv(r.olaMin).toFixed(1)}–${fmtOla(r.olaMax, u)}`
}

function textoCielo(nubes: number | null): string {
  if (nubes == null) return '—'
  return nubes <= 25 ? 'Despejado' : nubes <= 50 ? 'Sol parcial' : 'Nublado'
}

function CargandoOFallo({ estado }: { estado: EstadoDatos }) {
  // .alto reserva la altura de las 3 tarjetas: sin salto de layout
  // cuando llegan los datos.
  return (
    <div className="tarjeta vacio alto" role="status">
      {estado.cargando ? (
        <p>Bajando el pronóstico de la semana…</p>
      ) : (
        <>
          <Icono nombre="alerta" size={28} />
          <p>
            <strong>No hay datos todavía.</strong> Revisa tu conexión y toca
            actualizar (la flecha de arriba).
          </p>
        </>
      )}
    </div>
  )
}

function FilaPunto({
  id,
  estado,
  unidades,
}: {
  id: string
  estado: EstadoDatos
  unidades: Unidades
}) {
  const { datos } = estado
  const i = PUNTOS.findIndex((p) => p.id === id)
  const p = PUNTOS[i]
  const f = datos?.forecast[i]
  const m = datos?.marine[i] ?? null

  let ahoraTxt = 'sin datos'
  let icono: ReturnType<typeof cieloDeCodigo>['icono'] = 'nube'
  let playaScore: number | null = null

  if (f) {
    const nowIdx = indiceHoraActual(f.hourly.time)
    const code = f.hourly.weather_code[nowIdx]
    icono = cieloDeCodigo(code).icono
    const viento = f.hourly.wind_speed_10m[nowIdx]
    if (p.tipo === 'nav') {
      const ola = m ? m.hourly.wave_height[nowIdx] ?? null : null
      ahoraTxt = `${fmtViento(viento, unidades)} · ola ${fmtOla(ola, unidades)}`
    } else {
      ahoraTxt = `${fmtViento(viento, unidades)} · ${cieloDeCodigo(code).texto}`
      if (datos) {
        const hoy = diasPlaya(datos, p.id)[0]
        if (hoy) playaScore = hoy.score.total
      }
    }
  }

  return (
    <li>
      <a className="fila-punto" href={`#/punto/${p.id}`}>
        <span className={`fila-icono cielo-${icono}`}>
          <Icono nombre={icono} size={28} />
        </span>
        <span className="fila-textos">
          <span className="fila-nombre">{p.nombre}</span>
          <span className="fila-ahora">{ahoraTxt}</span>
        </span>
        {/* Un número pelado ("0") se lee como error. Va con su etiqueta:
            qué mide y de cuándo. */}
        {playaScore != null && (
          <span className="fila-score" aria-label={`Día de playa hoy: ${playaScore} de 100`}>
            <span className="fila-score-num" aria-hidden>
              {playaScore}
            </span>
            <span className="fila-score-tag" aria-hidden>
              playa hoy
            </span>
          </span>
        )}
      </a>
    </li>
  )
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

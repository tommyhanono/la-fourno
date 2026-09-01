// Pantalla principal. Una sola pregunta, una sola respuesta, en este
// orden: el veredicto de la semana arriba, la semana completa día por
// día debajo, y los puntos al final.
//
// A propósito NO hay bloques de horas con su propio puntaje: antes la
// pantalla contestaba dos veces la misma pregunta con números
// distintos ("mañana 8–10 am, 65" arriba y "mañana, 11" abajo) y eso
// era justo lo que la volvía confusa. El detalle por hora vive en la
// vista de cada punto ("Próximas horas").

import { useMemo, useState, useEffect } from 'react'
import { PUNTOS } from '../config/puntos'
import { CALIBRACION } from '../config/calibracion'
import type { EstadoDatos } from '../state/hooks'
import type { Unidades } from '../lib/units'
import { fmtViento, fmtOla, KT_A_KMH, M_A_FT } from '../lib/units'
import { jornadasSemana, diasPlaya, type RangoDia, type DiaJornada, type FormaDia } from '../lib/ventanas'
import { nombreDia, horaCorta, horaMuyCorta, parsePanama } from '../lib/time'
import { Header, AvisoSeguridad } from '../components/Marco'
import { BadgeScore, Desglose } from '../components/Desglose'
import { Icono } from '../components/Icono'
import { cieloDeCodigo } from '../lib/wmo'
import { FilaVerdad } from '../components/FilaVerdad'
import { archivarSemana, subirArchivo, diaAPreguntar, sincronizar } from '../lib/verdad'

const { desdeHora, hastaHora } = CALIBRACION.jornada

export function Home({ estado, unidades }: { estado: EstadoDatos; unidades: Unidades }) {
  const { datos } = estado
  const semana = useMemo(() => (datos ? jornadasSemana(datos) : []), [datos])

  // El mejor día salible de la semana: es el veredicto de arriba y el
  // sello de la tarjeta de abajo. La MISMA respuesta en los dos
  // lugares, nunca dos números distintos.
  const mejor = useMemo(() => {
    const salibles = semana.filter((d) => !d.score.peligro)
    if (salibles.length === 0) return null
    // Un día al que le faltan datos NO compite contra días completos:
    // sin el dato de mar pierde 25 puntos de arranque (ola 15 + marea
    // 10), así que perdería siempre por una razón que no tiene nada que
    // ver con el clima. Si hay días completos, el veredicto sale de
    // ellos; si NINGUNO está completo, se compara entre parciales, que
    // al menos están todos igual de mancos.
    const completos = salibles.filter((d) => d.score.pesoFaltante === 0)
    const candidatos = completos.length > 0 ? completos : salibles
    return candidatos.reduce((a, b) => (b.score.total > a.score.total ? b : a))
  }, [semana])

  // Qué día toca preguntar. Es estado y no memo a propósito: después de
  // contestar hay que volver a preguntárselo a localStorage, y un memo
  // con una dependencia falsa para forzarlo es justo el olor que el
  // linter marca.
  const [diaPregunta, setDiaPregunta] = useState<string | null>(null)
  useEffect(() => {
    setDiaPregunta(semana.length > 0 ? diaAPreguntar() : null)
  }, [semana])

  // El archivo de pronósticos: se guarda una vez por día, salga o no
  // salga a navegar. Sin esto, cuando conteste el domingo el pronóstico
  // del sábado ya no existe y el registro no sirve para calibrar nada.
  useEffect(() => {
    if (semana.length === 0) return
    const nuevos = archivarSemana(semana)
    void subirArchivo(nuevos)
    void sincronizar()
  }, [semana])

  return (
    <div className="pantalla">
      <Header estado={estado} />
      <main>
        <section className="seccion-veredicto" aria-labelledby="titulo-semana">
          <h2 id="titulo-semana" className="titulo-hero">
            ¿Cuándo salgo esta semana?
          </h2>
          <p className="sub-hero">
            Corredor Marina Ocean Reef → Las Perlas · CCX 40 · jornada de{' '}
            {hora12(desdeHora)} a {hora12(hastaHora)}
          </p>
          {!datos ? (
            <CargandoOFallo estado={estado} />
          ) : mejor ? (
            <Veredicto dia={mejor} unidades={unidades} />
          ) : (
            <div className="tarjeta vacio alto" role="status">
              <Icono nombre="alerta" size={28} />
              <p>
                <strong>Esta semana no pinta.</strong> Todos los días del
                pronóstico salen con bandera de seguridad. Mira el detalle día
                por día aquí abajo antes de decidir nada.
              </p>
            </div>
          )}
        </section>

        {diaPregunta && (
          <FilaVerdad
            key={diaPregunta}
            dia={diaPregunta}
            onListo={() => setDiaPregunta(diaAPreguntar())}
          />
        )}

        {/* La sección se renderiza siempre: el esqueleto reserva su
            altura y evita el salto de layout cuando llegan los datos. */}
        <section aria-labelledby="titulo-dias" className="seccion-dias">
          <h2 id="titulo-dias">Día por día</h2>
          <p className="sub-seccion">
            Cada día completo en tu jornada de siempre, con el mejor destino
            según el clima de ese día.
          </p>
          <ul className="dias">
            {semana.map((d) => (
              <TarjetaDia
                key={d.clave}
                dia={d}
                unidades={unidades}
                esMejor={mejor?.clave === d.clave}
              />
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
                  <p className="dia-forma">—</p>
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

/** El veredicto: el día, el destino y por qué, sin hacer cuentas. */
function Veredicto({ dia, unidades }: { dia: DiaJornada; unidades: Unidades }) {
  return (
    <div className="tarjeta veredicto">
      <p className="veredicto-kicker">Tu mejor día</p>
      <div className="veredicto-cabeza">
        <p className="veredicto-dia">{nombreDia(dia.dia)}</p>
        <BadgeScore score={dia.score} />
      </div>
      <p className="veredicto-destino">
        {dia.parejo ? 'Parejo en todos los puntos, sugerido' : 'Mejor destino'}:{' '}
        <a href={`#/punto/${dia.mejorDestino.id}`}>{dia.mejorDestino.nombre}</a>
      </p>
      <p className="veredicto-cond">
        Viento {rangoViento(dia.rango, unidades)} · ola{' '}
        {rangoOla(dia.rango, unidades)} · {textoCielo(dia.entrada.nubosidadPct).toLowerCase()}
      </p>
      {/* Misma regla que la tarjeta, sin excepciones: el veredicto no
          puede afirmar algo que la tarjeta de abajo se calla. */}
      {diceForma(dia) && <p className="veredicto-forma">{fraseForma(dia.forma)}</p>}
      {(() => {
        const s = salvedad(dia)
        return s && (
          <p className="veredicto-dudoso" data-motivo={s.motivo}>
            {s.texto}
          </p>
        )
      })()}
      <Desglose score={dia.score} id="desglose-veredicto" />
    </div>
  )
}

function TarjetaDia({
  dia: d,
  unidades,
  esMejor,
}: {
  dia: DiaJornada
  unidades: Unidades
  esMejor: boolean
}) {
  return (
    <li className={`tarjeta dia ${esMejor ? 'mejor-dia' : ''}`}>
      <div className="dia-cabeza">
        <span className="dia-nombre">{nombreDia(d.dia)}</span>
        {esMejor && <span className="dia-sello">El mejor de la semana</span>}
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

      {/* En un día con bandera no se "recomienda un destino": se dice de
          dónde salen los números. Recomendar un punto debajo de "no
          recomendado para salir" se lee como permiso. */}
      <p className="dia-destino">
        {d.score.peligro
          ? 'Números del corredor a'
          : d.parejo
            ? 'Parejo en todos los puntos, sugerido'
            : 'Mejor destino'}
        : <a href={`#/punto/${d.mejorDestino.id}`}>{d.mejorDestino.nombre}</a>
      </p>

      {diceForma(d) && <p className="dia-forma">{fraseForma(d.forma)}</p>}

      {(() => {
        const s = salvedad(d)
        return s && (
          <p className="dia-dudoso" data-motivo={s.motivo}>
            {s.texto}
          </p>
        )
      })()}

      <p className="dia-extra">
        {d.tormentaDesde && (
          <span className="dia-tormenta">
            Tormenta desde {horaMuyCorta(d.tormentaDesde)}
            {' · '}
          </span>
        )}
        {/* Con minutos: a qué hora exacta se hace de noche decide si
            vuelves con luz. */}
        {d.sol && (
          <>
            sol {horaCorta(d.sol.sale)} – {horaCorta(d.sol.sePone)}
          </>
        )}
      </p>

      <Desglose score={d.score} id={`dia-${d.clave}`} />
    </li>
  )
}

/**
 * Un día es dudoso cuando los tres modelos globales no coinciden lo
 * suficiente como para cambiar la respuesta. No dice que el día sea
 * malo: dice que el número todavía no está firme.
 */
function dudoso(d: DiaJornada): boolean {
  return d.desacuerdo != null && d.desacuerdo >= CALIBRACION.desacuerdoModelosPts
}

/**
 * Cuándo la app se anima a decir si el día está mejor temprano o por
 * la tarde. Se calla en tres casos, y los tres por la misma razón: no
 * dar un consejo más fino de lo que el dato aguanta.
 *
 *  · con bandera de seguridad, porque "conviene temprano" debajo de
 *    "no recomendado para salir" se lee como permiso;
 *  · con la jornada ya empezada, porque a las 2 pm "está mejor
 *    temprano" habla de una mañana que ya pasó;
 *  · en un día dudoso, porque si los modelos no coinciden ni en cómo
 *    va a estar el día entero, menos van a coincidir en qué mitad es
 *    mejor. Medido el 31-ago-2026 sobre la semana: los tres modelos
 *    coincidieron en la forma en 6 de 8 días, y los 2 que fallaron
 *    fueron exactamente los 2 marcados como dudosos.
 */
function diceForma(d: DiaJornada): boolean {
  return !d.score.peligro && !d.enCurso && !dudoso(d) && !d.fueraDeSkill
}

export const TEXTO_DUDOSO = 'Los modelos todavía no coinciden en este día.'
export const TEXTO_FUERA_SKILL =
  'A esta distancia el pronóstico ya no le gana al promedio de la época. Tómalo como una idea, no como un dato.'

/**
 * La salvedad que corresponde mostrar, o null si el día está firme.
 *
 * Solo UNA por tarjeta. Las dos son ciertas a la vez en algunos días,
 * pero apilarlas convierte la tarjeta en un descargo legal. Manda la de
 * horizonte porque es estructural —a 6+ días no hay skill medible, sin
 * importar si los modelos coinciden— mientras que el desacuerdo es una
 * propiedad de ese día puntual.
 */
function salvedad(d: DiaJornada): { motivo: 'horizonte' | 'desacuerdo'; texto: string } | null {
  if (d.fueraDeSkill) return { motivo: 'horizonte', texto: TEXTO_FUERA_SKILL }
  if (dudoso(d)) return { motivo: 'desacuerdo', texto: TEXTO_DUDOSO }
  return null
}

function fraseForma(f: FormaDia): string {
  if (f === 'temprano') return 'Está mejor temprano: la tarde se pone peor.'
  if (f === 'tarde') return 'Está mejor por la tarde: la mañana viene más fea.'
  return 'Mañana y tarde, igual de buenas.'
}

/** "9 am" a partir de la hora entera de la calibración. */
function hora12(h: number): string {
  const ampm = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12} ${ampm}`
}

/**
 * Rango medido del día, no un promedio inventado: "5–14 kt" es un dato
 * que existe en el pronóstico y le dice al capitán cuánto puede picar.
 * Se compara YA CONVERTIDO a las unidades que se muestran, para que el
 * criterio de "esto es un solo número" no cambie según la unidad.
 */
function rangoViento(r: RangoDia, u: Unidades): string {
  if (r.vientoMax == null) return '—'
  if (r.vientoMin == null) return fmtViento(r.vientoMax, u)
  const conv = (kt: number) => (u.viento === 'kt' ? kt : kt * KT_A_KMH)
  const lo = Math.round(conv(r.vientoMin))
  const hi = Math.round(conv(r.vientoMax))
  if (hi - lo < 2) return fmtViento(r.vientoMax, u)
  return `${lo}–${fmtViento(r.vientoMax, u)}`
}

function rangoOla(r: RangoDia, u: Unidades): string {
  if (r.olaMax == null) return '—'
  if (r.olaMin == null) return fmtOla(r.olaMax, u)
  const conv = (m: number) => (u.ola === 'ft' ? m * M_A_FT : m)
  if (conv(r.olaMax) - conv(r.olaMin) < 0.4) return fmtOla(r.olaMax, u)
  return `${conv(r.olaMin).toFixed(1)}–${fmtOla(r.olaMax, u)}`
}

function textoCielo(nubes: number | null): string {
  if (nubes == null) return '—'
  return nubes <= 25 ? 'Despejado' : nubes <= 50 ? 'Sol parcial' : 'Nublado'
}

function CargandoOFallo({ estado }: { estado: EstadoDatos }) {
  // .alto reserva la altura del veredicto: sin salto de layout cuando
  // llegan los datos.
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
            qué mide y de cuándo. role="img" para que el lector de
            pantalla lea la etiqueta y no dos trozos sueltos. */}
        {playaScore != null && (
          <span
            className="fila-score"
            role="img"
            aria-label={`Día de playa hoy: ${playaScore} de 100`}
          >
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

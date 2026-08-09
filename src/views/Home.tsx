// Pantalla principal = la respuesta: "¿cuándo salgo esta semana?"
// Las 3 mejores ventanas arriba, entendibles en 3 segundos, y la
// lista de puntos abajo.

import { useMemo } from 'react'
import { PUNTOS } from '../config/puntos'
import type { EstadoDatos } from '../state/hooks'
import type { Unidades } from '../lib/units'
import { fmtViento, fmtOla } from '../lib/units'
import { bloquesCorredor, mejoresVentanas, diasPlaya } from '../lib/ventanas'
import { nombreDia, horaMuyCorta, parsePanama } from '../lib/time'
import { Header, AvisoSeguridad } from '../components/Marco'
import { BadgeScore, Desglose } from '../components/Desglose'
import { Icono } from '../components/Icono'
import { cieloDeCodigo } from '../lib/wmo'

export function Home({ estado, unidades }: { estado: EstadoDatos; unidades: Unidades }) {
  const { datos } = estado

  const ventanas = useMemo(() => {
    if (!datos) return []
    return mejoresVentanas(bloquesCorredor(datos))
  }, [datos])

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

function CargandoOFallo({ estado }: { estado: EstadoDatos }) {
  return (
    <div className="tarjeta vacio" role="status">
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
        {playaScore != null && (
          <span className="fila-score" aria-label={`Score de playa hoy: ${playaScore}`}>
            {playaScore}
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

// Marco común: header con estado del dato, y el aviso de seguridad
// marítima — permanente, en todas las vistas, sin opción de quitarlo.

import { useEffect, useRef } from 'react'
import type { EstadoDatos } from '../state/hooks'
import { irA } from '../state/hooks'
import { haceCuanto } from '../lib/time'
import { Icono } from './Icono'

export function Header({
  estado,
  titulo,
  atras,
}: {
  estado: EstadoDatos
  titulo?: string
  atras?: boolean
}) {
  return (
    <header className="cabecera">
      <div className="cabecera-fila">
        {atras ? (
          <button className="btn-icono" onClick={() => irA('#/')} aria-label="Volver al inicio">
            <Icono nombre="volver" size={26} />
          </button>
        ) : (
          <a className="marca" href="#/" aria-label="La Fourno, inicio">
            LA FOURNO
          </a>
        )}
        {titulo && <h1 className="cabecera-titulo">{titulo}</h1>}
        <div className="cabecera-acciones">
          <button
            className="btn-icono"
            onClick={estado.recargar}
            aria-label="Actualizar datos"
            disabled={estado.cargando}
          >
            <Icono nombre="recargar" size={24} className={estado.cargando ? 'girando' : ''} />
          </button>
          <a className="btn-icono" href="#/ajustes" aria-label="Ajustes">
            <Icono nombre="ajustes" size={24} />
          </a>
        </div>
      </div>
      <EstadoDato estado={estado} />
    </header>
  )
}

export function EstadoDato({ estado }: { estado: EstadoDatos }) {
  const { datos, errorRed, cargando } = estado
  if (!datos) {
    return (
      <p className="estado-dato sin-datos" role="status">
        {cargando
          ? 'Bajando el pronóstico…'
          : errorRed
            ? 'Sin conexión y sin datos guardados. Revisa tu señal y actualiza.'
            : 'Todavía no hay datos.'}
      </p>
    )
  }
  return (
    <p className="estado-dato" role="status">
      Datos de {haceCuanto(datos.fetchedAt)}
      {errorRed && ' · sin conexión: mostrando lo último que llegó'}
      {!errorRed && datos.fallas.length > 0 && ` · falló ${datos.fallas.join(' y ')}`}
      {cargando && ' · actualizando…'}
    </p>
  )
}

/**
 * Aviso de seguridad: fijo, visible, sin letra chiquita y sin opción
 * de apagarlo. La app informa; el capitán decide.
 */
export function AvisoSeguridad() {
  const ref = useRef<HTMLElement>(null)

  // El aviso es fijo, así que el contenido necesita reservar SU altura
  // real: cambia con el ancho y, sobre todo, con el tamaño de letra del
  // teléfono (a 200 % mide el triple). Un padding fijo lo tapaba.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => {
      document.documentElement.style.setProperty(
        '--aviso-alto',
        `${Math.ceil(el.getBoundingClientRect().height)}px`,
      )
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    window.addEventListener('resize', medir)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', medir)
    }
  }, [])

  return (
    <aside
      ref={ref}
      className="aviso-seguridad"
      role="note"
      aria-label="Aviso de seguridad marítima"
    >
      <Icono nombre="alerta" size={22} />
      <p>
        Esta app es informativa: trabaja con pronósticos y estimados que pueden
        fallar. <strong>No sustituye los avisos oficiales ni tu juicio como
        capitán.</strong> Antes de zarpar, verifica las fuentes oficiales y mira
        el cielo.
      </p>
    </aside>
  )
}

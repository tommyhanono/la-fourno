// Ajustes: solo unidades. El aviso de seguridad no se puede apagar
// (a propósito) y las coordenadas se editan en src/config/puntos.ts.

import type { EstadoDatos } from '../state/hooks'
import type { Unidades } from '../lib/units'
import { Header, AvisoSeguridad } from '../components/Marco'
import { estadoRespaldo } from '../lib/verdad'

export function Ajustes({
  estado,
  unidades,
  setUnidades,
}: {
  estado: EstadoDatos
  unidades: Unidades
  setUnidades: (u: Partial<Unidades>) => void
}) {
  return (
    <div className="pantalla">
      <Header estado={estado} atras titulo="Ajustes" />
      <main>
        <section className="tarjeta" aria-labelledby="tit-unidades">
          <h2 id="tit-unidades">Unidades</h2>

          <Selector
            titulo="Viento"
            opciones={[
              { valor: 'kt', texto: 'nudos (kt)' },
              { valor: 'kmh', texto: 'km/h' },
            ]}
            actual={unidades.viento}
            onCambio={(v) => setUnidades({ viento: v as Unidades['viento'] })}
          />
          <Selector
            titulo="Olas"
            opciones={[
              { valor: 'ft', texto: 'pies (ft)' },
              { valor: 'm', texto: 'metros (m)' },
            ]}
            actual={unidades.ola}
            onCambio={(v) => setUnidades({ ola: v as Unidades['ola'] })}
          />
          <Selector
            titulo="Temperatura"
            opciones={[
              { valor: 'c', texto: '°C' },
              { valor: 'f', texto: '°F' },
            ]}
            actual={unidades.temp}
            onCambio={(v) => setUnidades({ temp: v as Unidades['temp'] })}
          />
          <p className="nota-ajustes">
            La marea siempre se muestra en metros, como en las tablas de
            Panamá.
          </p>
        </section>

        <section className="tarjeta" aria-labelledby="tit-verdad">
          <h2 id="tit-verdad">Lo que has contestado</h2>
          <RespaldoVerdad />
        </section>

        <section className="tarjeta" aria-labelledby="tit-config">
          <h2 id="tit-config">Para ajustar más</h2>
          <p className="nota-ajustes">
            Los puntos (coordenadas, nombres) viven en{' '}
            <code>src/config/puntos.ts</code> y la calibración del recomendador
            (pesos, umbrales del CCX 40) en <code>src/config/calibracion.ts</code>.
            Edita, guarda y la app se reconstruye.
          </p>
          <p className="nota-ajustes">
            El aviso de seguridad no se puede quitar desde aquí, a propósito.
          </p>
        </section>
      </main>
      <AvisoSeguridad />
    </div>
  )
}

/**
 * Cuánto se ha juntado y si está respaldado.
 *
 * No es una pantalla de estadísticas: es la única forma de notar que el
 * respaldo dejó de funcionar. Sin esto, la sincronización puede fallar
 * en silencio durante meses y los registros que Tommy cree estar
 * juntando no existirían en ningún lado consultable.
 */
function RespaldoVerdad() {
  const e = estadoRespaldo()
  if (e.registros === 0 && e.archivo === 0) {
    return (
      <p className="nota-ajustes">
        Todavía no hay nada. La app va a preguntarte cómo salió el viaje en
        una fila del inicio, y guarda cada día su propio pronóstico.
      </p>
    )
  }
  const pendientes = e.registros - e.sincronizados
  return (
    <>
      <p className="nota-ajustes">
        {e.registros === 0 ? (
          <>
            Todavía no has contestado ningún día, pero la app ya está
            archivando: <strong>{e.archivo}</strong> pronósticos guardados.
          </>
        ) : (
          <>
            <strong>{e.registros}</strong>{' '}
            {e.registros === 1 ? 'día contestado' : 'días contestados'} ·{' '}
            <strong>{e.archivo}</strong> pronósticos archivados.
          </>
        )}
      </p>
      {!e.activo ? (
        <p className="nota-ajustes">
          El respaldo en la nube está <strong>apagado</strong> en esta versión:
          todo vive solo en este teléfono. Si lo borras o cambias de equipo, se
          pierde.
        </p>
      ) : pendientes > 0 ? (
        <p className="nota-ajustes">
          Faltan <strong>{pendientes}</strong> por respaldar. Se suben solos
          cuando haya señal.
        </p>
      ) : e.registros > 0 ? (
        <p className="nota-ajustes">Todo respaldado.</p>
      ) : null}
    </>
  )
}

function Selector({
  titulo,
  opciones,
  actual,
  onCambio,
}: {
  titulo: string
  opciones: { valor: string; texto: string }[]
  actual: string
  onCambio: (v: string) => void
}) {
  return (
    <fieldset className="selector">
      <legend>{titulo}</legend>
      <div className="selector-opciones" role="radiogroup" aria-label={titulo}>
        {opciones.map((o) => (
          <button
            key={o.valor}
            role="radio"
            aria-checked={actual === o.valor}
            className={`selector-btn ${actual === o.valor ? 'activo' : ''}`}
            onClick={() => onCambio(o.valor)}
          >
            {o.texto}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

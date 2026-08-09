// Ajustes: solo unidades. El aviso de seguridad no se puede apagar
// (a propósito) y las coordenadas se editan en src/config/puntos.ts.

import type { EstadoDatos } from '../state/hooks'
import type { Unidades } from '../lib/units'
import { Header, AvisoSeguridad } from '../components/Marco'

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

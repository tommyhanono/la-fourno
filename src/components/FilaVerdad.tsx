// La única fila que le pregunta algo a Tommy.
//
// Regla de diseño: NUNCA insiste, nunca notifica, nunca bloquea. Si no
// hay nada que preguntar, la fila no existe. Dos toques y se va.
//
// No es una bitácora de pesca ni una pantalla nueva: eso está fuera de
// alcance a propósito. Es una fila, y su único trabajo es hacer que la
// calibración deje de ser infalsificable.

import { useState } from 'react'
import { nombreDia, parsePanama } from '../lib/time'
import { guardarRegistro, type Resultado } from '../lib/verdad'

export function FilaVerdad({ dia, onListo }: { dia: string; onListo: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const [viento, setViento] = useState('')
  const [nota, setNota] = useState('')

  const cuando = nombreDia(parsePanama(`${dia}T12:00`))

  function responder(r: Resultado) {
    const kt = Number.parseFloat(viento.replace(',', '.'))
    guardarRegistro(dia, r, {
      ...(Number.isFinite(kt) && kt >= 0 && kt < 100 ? { vientoRealKt: kt } : {}),
      ...(nota.trim() ? { nota: nota.trim() } : {}),
    })
    onListo()
  }

  if (!abierto) {
    return (
      <section className="verdad" aria-label={`¿Saliste el ${cuando}?`}>
        <p className="verdad-pregunta">¿Saliste el {cuando}?</p>
        <div className="verdad-botones">
          <button type="button" className="btn-verdad" onClick={() => responder('no-sali')}>
            No salí
          </button>
          <button
            type="button"
            className="btn-verdad primario"
            onClick={() => setAbierto(true)}
          >
            Sí
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="verdad abierta" aria-label={`Cómo estuvo el ${cuando}`}>
      <p className="verdad-pregunta">
        ¿Cómo estuvo, comparado con lo que decía la app?
      </p>
      <div className="verdad-botones">
        <button type="button" className="btn-verdad" onClick={() => responder('peor')}>
          Peor
        </button>
        <button type="button" className="btn-verdad" onClick={() => responder('igual')}>
          Igual
        </button>
        <button type="button" className="btn-verdad" onClick={() => responder('mejor')}>
          Mejor
        </button>
      </div>
      <div className="verdad-extra">
        <label className="verdad-campo">
          <span>Viento real (kt)</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={99}
            value={viento}
            onChange={(e) => setViento(e.target.value)}
            placeholder="opcional"
          />
        </label>
        <label className="verdad-campo ancho">
          <span>Nota</span>
          <input
            type="text"
            maxLength={280}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="opcional"
          />
        </label>
      </div>
    </section>
  )
}

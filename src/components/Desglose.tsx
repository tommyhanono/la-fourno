// El score abierto: cada punto del total con su número.
// "viento 8 kt: +25 · despejado: +20 · …" — nada de caja negra.

import type { ResultadoScore } from '../lib/score'
import { nivelScore, faltaDatoCritico } from '../lib/score'
import { textoBanda, BACKTEST_INFO } from '../lib/incertidumbre'

export function BadgeScore({ score }: { score: ResultadoScore }) {
  if (faltaDatoCritico(score)) {
    return (
      <span className="badge-score nivel-sindato">
        <strong aria-hidden="true">—</strong>
        <span className="badge-etiqueta">Sin dato</span>
      </span>
    )
  }
  const nivel = nivelScore(score.total)
  return (
    <span className={`badge-score nivel-${nivel.clase}`}>
      <strong>{score.total}</strong>
      <span className="badge-etiqueta">{nivel.etiqueta}</span>
    </span>
  )
}

/** "viento", "ola y marea", "viento, ola y marea" */
function listar(xs: string[]): string {
  if (xs.length === 0) return 'un dato'
  if (xs.length === 1) return xs[0]
  return `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`
}

export function Desglose({
  score,
  id,
  anticipacionDias,
}: {
  score: ResultadoScore
  id: string
  /** Si viene, el desglose dice cuánto se equivoca el número a esa distancia. */
  anticipacionDias?: number
}) {
  const banda = anticipacionDias == null ? null : textoBanda(anticipacionDias)
  return (
    <details className="desglose">
      <summary>
        {faltaDatoCritico(score) ? '¿Por qué sin dato?' : `¿Por qué ${score.total}?`}
      </summary>
      <ul id={id} className="desglose-lista">
        {score.contribuciones.map((c, i) => (
          <li
            key={i}
            className={
              c.tipo === 'bandera' ? 'bandera' : c.puntos < 0 ? 'resta' : 'suma'
            }
          >
            <span>{c.etiqueta}</span>
            {/* Una bandera no suma ni resta: marca peligro. Mostrarla
                como "+0" la haría parecer un dato irrelevante. */}
            <span className="pts">
              {c.tipo === 'bandera' ? (
                'no salir'
              ) : (
                <>
                  {c.puntos >= 0 ? '+' : '−'}
                  {Math.abs(c.puntos) % 1 === 0
                    ? Math.abs(c.puntos)
                    : Math.abs(c.puntos).toFixed(1)}
                </>
              )}
            </span>
          </li>
        ))}
        {banda && (
          <li className="nota-banda">
            {/* La incertidumbre va DENTRO del desglose, que es donde el
                usuario viene a preguntar de dónde sale el número. Y va
                con su procedencia: sin eso, "±8" sería otro número
                inventado más. */}
            A {anticipacionDias === 0 ? 'un día' : `${anticipacionDias} día${anticipacionDias === 1 ? '' : 's'}`} de
            distancia este puntaje se equivoca <strong>{banda} pts</strong> en
            promedio. Medido sobre {BACKTEST_INFO.ventanaDias} días reales en{' '}
            {BACKTEST_INFO.ubicaciones} puntos ({BACKTEST_INFO.generado}).
          </li>
        )}
        {score.parcial && (
          <li className="nota-parcial">
            {/* Decir QUÉ faltó, no solo que faltó algo: no es lo mismo
                quedarse sin marea que sin viento. */}
            No llegó {listar(score.faltan)} de la API
            {faltaDatoCritico(score)
              ? ': sin eso no se puede puntuar el día.'
              : `: el puntaje va sobre ${100 - score.pesoFaltante} y no sobre 100.`}
          </li>
        )}
      </ul>
    </details>
  )
}

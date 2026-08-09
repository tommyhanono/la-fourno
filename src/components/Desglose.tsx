// El score abierto: cada punto del total con su número.
// "viento 8 kt: +25 · despejado: +20 · …" — nada de caja negra.

import type { ResultadoScore } from '../lib/score'
import { nivelScore } from '../lib/score'

export function BadgeScore({ score }: { score: ResultadoScore }) {
  const nivel = nivelScore(score.total)
  return (
    <span className={`badge-score nivel-${nivel.clase}`}>
      <strong>{score.total}</strong>
      <span className="badge-etiqueta">{nivel.etiqueta}</span>
    </span>
  )
}

export function Desglose({ score, id }: { score: ResultadoScore; id: string }) {
  return (
    <details className="desglose">
      <summary aria-label={`Abrir desglose del score ${score.total}`}>
        ¿Por qué {score.total}?
      </summary>
      <ul id={id} className="desglose-lista">
        {score.contribuciones.map((c, i) => (
          <li key={i} className={c.puntos < 0 ? 'resta' : 'suma'}>
            <span>{c.etiqueta}</span>
            <span className="pts">
              {c.puntos >= 0 ? '+' : '−'}
              {Math.abs(c.puntos) % 1 === 0
                ? Math.abs(c.puntos)
                : Math.abs(c.puntos).toFixed(1)}
            </span>
          </li>
        ))}
        {score.parcial && (
          <li className="nota-parcial">
            Faltó algún dato de la API: score parcial con lo disponible.
          </li>
        )}
      </ul>
    </details>
  )
}

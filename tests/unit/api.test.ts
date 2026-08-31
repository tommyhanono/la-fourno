import { describe, it, expect } from 'vitest'
import { urlForecast, urlMarine } from '../../src/lib/api'
import { PUNTOS } from '../../src/config/puntos'

describe('las URLs piden exactamente lo que la app asume', () => {
  it('el clima se pide sobre la celda de MAR, no la de tierra', () => {
    // Open-Meteo por defecto prefiere la celda de tierra más cercana, y
    // ahí el viento sale frenado por la rugosidad del suelo. Medido el
    // 31-ago-2026: Las Sirenas máx 8.6 → 11.0 kt y Coronado 6.1 → 8.8 kt
    // al pedir la celda de mar. Si alguien borra este flag, la app
    // vuelve a subestimar el viento justo en los puntos de playa.
    expect(urlForecast()).toContain('cell_selection=sea')
  })

  it('el viento viene en nudos, que es la unidad interna', () => {
    expect(urlForecast()).toContain('wind_speed_unit=kn')
  })

  it('las dos APIs piden los 9 puntos en el mismo orden que PUNTOS', () => {
    const lats = PUNTOS.map((p) => p.lat).join(',')
    const lons = PUNTOS.map((p) => p.lon).join(',')
    for (const url of [urlForecast(), urlMarine()]) {
      expect(url).toContain(`latitude=${lats}`)
      expect(url).toContain(`longitude=${lons}`)
    }
    // El código indexa las respuestas por posición: si el orden se
    // rompe, cada punto muestra el clima de otro y nada falla ruidoso.
    expect(PUNTOS.length).toBe(9)
  })

  it('ambas APIs cubren el mismo horizonte y la misma zona horaria', () => {
    // Si una trae 8 días y la otra 7, los últimos días quedan sin mar y
    // el score los compara contra días completos: ranking inválido.
    for (const url of [urlForecast(), urlMarine()]) {
      expect(url).toContain('forecast_days=8')
      expect(url).toContain('timezone=America%2FPanama')
    }
  })

  it('no se piden wind_wave ni swell: se evaluaron y no aportan', () => {
    // Ver la nota larga en score.ts ('mar-corto'). wave_period ya es
    // media ponderada por energía. Pedirlos sería payload muerto.
    expect(urlMarine()).not.toContain('wind_wave')
    expect(urlMarine()).not.toContain('swell_wave')
  })
})

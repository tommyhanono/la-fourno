# MEGA-RONDA — Acta de auditoría

Fecha: 2026-08-09 · Auditoría completa "como si no confiaras en quien lo construyó".

## Resultado: ✅ APROBADA — dos corridas completas seguidas limpias

| | Corrida 1 (17:50) | Corrida 2 (17:52) |
|---|---|---|
| Unit (Vitest) | 39/39 ✅ | 39/39 ✅ |
| E2E (Playwright, WebKit iPhone 13) | 10/10 ✅ | 10/10 ✅ |
| Lighthouse performance | 99 ✅ | 99 ✅ |
| Lighthouse accesibilidad | 100 ✅ | 100 ✅ |
| Lighthouse best practices | 100 ✅ | 100 ✅ |

## Qué se probó

### Unit tests (39) — `tests/unit/`
- **Score, casos borde**: calma total (≥85), viento fuerte con sol (el
  viento manda), tormenta eléctrica con mar plano (bandera de peligro),
  TODOS los datos faltantes (0 sin reventar, marcado parcial), sin dato
  de marea (score parcial utilizable), mar corto y picado, ola peligrosa,
  rachas, marea vaciando/bajamar extrema, desglose que siempre suma el
  total, total acotado 0–100.
- **Marea estimada**: interpolación, extremos con error < 25 min contra
  una marea sintética semidiurna tipo Balboa, alternancia
  pleamar/bajamar, tendencia, huecos de datos (null) sin inventar
  extremos.
- **Hora de Panamá**: parseo UTC-5 sin depender de la zona del
  dispositivo, formato 12 h.
- **Unidades**: kt/km-h, ft/m, °C/°F, marea siempre en metros, datos
  faltantes muestran raya (nunca NaN).
- **Ventanas**: solo bloques con luz, sin bloques pasados, tormenta
  excluida por peligro, prefiere mañanas calmas, evita el día ventoso,
  máx. 2 por día y separadas ≥ 4 h, funciona sin marea.

### E2E (10) — `tests/e2e/app.spec.ts` (fixtures deterministas)
1. Abre y muestra las 3 mejores ventanas.
2. El desglose se abre y muestra números con signo ("viento N kt").
3. Navega a los 9 puntos (nav completa / playa sin datos de navegación,
   marea siempre "estimada").
4. Aviso de seguridad en todas las vistas, sin control para quitarlo.
5. Cambio de unidades persiste tras reload (localStorage).
6. **Red cortada sin caché**: mensaje claro, nada roto.
7. **Red cortada con caché viejo**: muestra lo último, dice "sin
   conexión" y "hace 2 h".
8. Solo falla la API marina: lo dice y muestra el clima igual.
9. 375 px sin scroll horizontal en las 4 vistas.
10. PWA: manifest válido (standalone, iconos) y service worker publicado.

### Coordenadas (verificación 1×1, reverse geocoding OSM)
| Punto | Resultado |
|---|---|
| Marina Ocean Reef | ✅ San Francisco (Punta Pacífica), Panamá |
| Contadora | ✅ Saboga, Balboa (corregimiento de Las Perlas) |
| Chapera | ✅ Saboga, Balboa |
| Ocean Reef (islas) | ✅ San Francisco, Panamá |
| Pearl Island | ✅ Pedro de Cocal, Pedro González |
| Mogo Mogo | ✅ mar de Las Perlas (islote, sin corregimiento) |
| Caracoles | ⚠️ estimado declarado (islotes NE de Contadora) — DECISIONES.md |
| Las Sirenas | ✅ Santa Clara, Antón, Coclé |
| Coronado | ✅ **corregido en la ronda**: el punto inicial caía en Nueva Gorgona; reubicado a 8.512, -79.888 (Coronado, Chame) |

### Hallazgos corregidos en la ronda
1. **Coronado mal ubicado** (Nueva Gorgona) → reubicado y re-verificado.
2. **CLS 0.40** por el salto de layout al llegar los datos → altura
   reservada; CLS final 0.013.
3. **Google Fonts render-blocking (~600 ms)** → fuentes autoalojadas
   (subset latin, OFL); además el PWA queda entero sin red externa.
4. **Performance 80 → 99.**
5. **`aria-label` que no calzaba con el texto visible** en el desglose
   (auditoría label-content-name-mismatch) → eliminado.
6. **Destacado "mejor ventana"** marcaba la primera por fecha, no la de
   mayor score → corregido.
7. **Relleno de la curva de marea en tinte rojizo** (parecía alerta) →
   tinte neutro.

### Piso de calidad (TOMMY-DESIGN)
- Responsive 375 px sin scroll horizontal: **probado por E2E**.
- Toques ≥ 44 px (botones 48 px, selectores 52 px, filas 64 px).
- Foco de teclado visible (outline 3 px del acento).
- Contraste AA: tokens `tokens-brutal` ya verificados en la nota
  (4.83:1–5.42:1 los semánticos; texto principal ~15:1).
- Significado nunca solo por color (score con etiqueta, prob. con %).
- `prefers-reduced-motion` respetado.
- Estados vacíos escritos (sin datos, sin ventanas, punto inexistente).
- PWA instalable: manifest standalone + iconos 192/512/maskable +
  apple-touch-icon + SW con shell cacheado (verificado por E2E y a mano).

### Cómo reproducir
```bash
npm test          # unit
npm run test:e2e  # E2E (levanta build + preview solo)
```

---

## Ronda de "Día por día" (2026-08-14)

Cambio: la sección Día por día pasó de bloques de horas a **jornada
completa** (9 am – 4 pm) con **mejor destino del día**, a pedido de
Tommy. Ver DECISIONES.md §10.

**Dos corridas limpias seguidas** (23:24 y 23:25):
- 47/47 unit (5 nuevas de jornada + 1 de `tormentaFrac`)
- 11/11 E2E (WebKit iPhone 13)
- Lighthouse desktop: **performance 100 · a11y 100 · best-practices 100**
  (SEO 91, sin cambios), **CLS 0.002**

### Hallazgos de la ronda (los 4 corregidos)
1. **Peor caso de 7 h daba 0/MALO todos los días.** En agosto (temporada
   lluviosa) siempre hay chubasco de tarde, así que ningún día se podía
   comparar con otro. → promedio ponderado al pico (`jornada.pesoPico`),
   con el pico visible aparte en el resumen.
2. **La tormenta mataba el día entero.** → penal proporcional a las horas
   (`tormentaFrac`), PELIGRO solo desde 35 % de la jornada. Los bloques de
   2 h NO cambiaron: verificado por test dedicado.
3. **"Ocean Reef islas" ganaba siempre como mejor destino** (está a minutos
   de la dársena: el corredor es trivial). → marcado `soloReferencia` en
   `puntos.ts`; se sigue consultando su clima, no se propone como destino.
   Además, si todos los destinos entran en 3 puntos, la fila dice "parejo
   en todos los puntos" en vez de inventar un ganador.
4. **CLS subió a 0.117 y performance bajó a 90** porque la sección aparecía
   al llegar los datos y empujaba el layout. → esqueleto de 7 filas que
   reserva la altura; CLS 0.002 y performance 100.

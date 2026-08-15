# DECISIONES — La Fourno

Decisiones tomadas en solitario durante la misión (2026-08-09), con el
porqué y las fuentes. Todo lo de aquí es ajustable después.

## 1. Mareas: modelo CMEMS vía Open-Meteo, SIEMPRE "estimado"

**Decisión**: la marea sale de `sea_level_height_msl` de la API marine
de Open-Meteo (modelo global de Copernicus/CMEMS), con los extremos
afinados por interpolación parabólica. El UI la marca **siempre** como
"estimada".

**Por qué**:
- NOAA CO-OPS ya no publica predicciones para Balboa (la estación
  histórica no responde en su API; solo quedan estaciones de EE. UU.).
- No existe otra fuente armónica gratuita y confiable con API para el
  Golfo de Panamá; las tablas comerciales (tide-forecast, tides4fishing)
  no tienen API gratuita y su scraping es frágil.
- **Validación hecha el 2026-08-09** contra la tabla armónica de Balboa
  de tide-forecast.com: mismo ciclo semidiurno, rango del ciclo casi
  idéntico (3.23 m modelo vs 3.18 m tabla) y extremos con **desfase
  ~30 min** (bajamar 5:25 vs 6:01 am; pleamar ~11:45 vs 12:17 pm).
- Para decidir "¿salgo o no?" ese error es aceptable; para entrar a un
  bajo con la quilla justa NO — por eso el "estimado" es permanente y
  el aviso de seguridad manda a las fuentes oficiales.

**Nota técnica**: el nivel viene referido al nivel medio del mar (MSL),
no al datum de cartas (MLLW): se ven valores negativos en bajamar. Es
coherente para leer curva y tendencia, que es lo que la app necesita.

**Upgrade pagable** (README): WorldTides API (~$5/mes) da extremos
armónicos reales por coordenada.

## 2. Caracoles: islotes al NE de Contadora (estimado declarado)

"Caracoles" no existe con ese nombre en OSM, en GeoNames/NGA ni en las
guías náuticas consultadas. Lo más cercano documentado es un
"Caracoles/Majagua" **en el sur del archipiélago** (cerca de San
Miguel), pero la misión lo define como "los islotes cerca de
Contadora", así que esa lectura manda: quedó en **8.635, -79.031**, los
islotes/rocas entre Contadora y Bartolomé. El pronóstico usa la misma
celda de modelo que Contadora (~9 km), así que si la ubicación fina
difiere unos cientos de metros, el dato meteorológico no cambia. Se
ajusta en `src/config/puntos.ts` (marcado `estimado: true`).

## 3. Tormenta eléctrica: weather_code + CAPE como proxy

Open-Meteo no publica densidad de rayos. Se usa el código WMO de
tormenta (95/96/99) como bandera dura (−60 pts) y CAPE > 2500 J/kg como
señal blanda (−20 pts) de atmósfera cargada típica del golfo en tarde
de agosto. Umbrales editables en `calibracion.ts`.

## 4. Stack: Vite + React estático, sin backend

- Fetch directo del cliente a Open-Meteo (CORS abierto, sin key).
- 2 requests por refresco para los 9 puntos (lat/lon en lote).
- Caché en localStorage: fresco < 30 min; si la red falla se sirve lo
  último con aviso; la hora del dato siempre visible.
- Router por hash (sin dependencia), PWA con service worker propio
  (shell cache-first; las APIs NUNCA se cachean en el SW para no
  duplicar la lógica de expiración).
- Fuentes autoalojadas (subset latin de Archivo/Archivo Black, licencia
  OFL): sin llamadas a Google en runtime y PWA completa sin señal.

## 5. Diseño: tokens-brutal

Variante elegida por la tabla de decisión de TOMMY-DESIGN (proyecto
personal con carácter) y porque su contraste extremo (papel cálido +
casi-negro) es lo que mejor se lee **a pleno sol en un bote**, que es
el caso de uso real. Concepto: **"instrumento de puente"**. `glass` se
descartó por ser oscuro (ilegible al sol) y `calm` por ser para
terceros no técnicos.

## 6. Calibración CCX 40 (defaults)

Jerarquía de Tommy como pesos: **viento 45 > sol 30 > ola 15 > marea
10**, y la seguridad como penalizaciones que matan el bloque (tormenta
−60, mar grueso −40). Supuestos para un center console de 40 pies
rápido en el corredor Ocean Reef→Contadora (~35 mn):
- ≤5 kt perfecto; 12 kt cómodo; 15+ molesto; 22+ no vale la pena.
- Ola: 0.5 m ni se siente; 1 m se navega; 1.8+ se reconsiderar; el
  ratio altura/período castiga el mar corto del golfo.
- Marea: factor menor (el bote entra a casi todo), pero bajamar extrema
  en destino penaliza (playas y bajos de Las Perlas) y llegar llenando
  da un bono chico.
Todo editable en `src/config/calibracion.ts`.

## 7. Ventanas: bloques de 2 h, solo luz de día

Bloques pares de 6 am a 6 pm (con margen de 45 min sobre
amanecer/atardecer), máximo 2 ventanas por día y separadas ≥ 4 h para
que las "3 mejores" no sean tres bloques pegados de la misma mañana.
El score del corredor toma el **peor caso** entre salida y destino
(el corredor se navega entero) y la marea se evalúa a la llegada.

## 8. Coordenadas

Verificadas contra OSM/Nominatim y OurAirports (2026-08-09); Coronado
se corrigió en la mega ronda (el punto de OSM "Playa Coronado (oeste)"
caía en Nueva Gorgona). Detalle punto por punto en MEGA-RONDA.md y
comentarios en `puntos.ts`.

## 9. Alcance

Sin bitácora, sin checklist, sin cuentas — la misión lo cierra. Ideas
que surgieron y NO se implementaron (van al README como futuras):
rosa de viento por hora, alertas push, radar de lluvia, AIS.

## 10. Día por día = jornada completa, no bloques (2026-08-14)

Pedido de Tommy: ver cada día de la semana "en general", sin bloques
de horas — él sale 9–10 am y vuelve 3–4 pm. La sección "Día por día"
evalúa el día COMPLETO sobre esa jornada (9 am – 4 pm, editable en
`calibracion.ts → jornada`) y puntúa el corredor contra CADA destino
de navegación: el de mejor score es "el mejor destino según el clima
de ese día". La marea se evalúa a la llegada (salida + 2 h). Las 3
ventanas de arriba siguen siendo bloques de 2 h: son otra pregunta
("¿cuál es el MEJOR momento?"), esta responde "¿cómo viene el día?".

Tres decisiones que salieron de probarlo con datos reales de agosto:

1. **Promedio ponderado al pico, no peor caso.** El peor caso puro
   sobre 7 h daba 0/MALO en casi todos los días (en temporada
   lluviosa siempre hay un chubasco a las 3 pm) y no se podía
   comparar nada. Ahora viento y ola se resumen como
   `promedio*(1-w) + pico*w` con `w = jornada.pesoPico` (0.5), y el
   resumen muestra el pico aparte ("viento 8 kt (hasta 14 kt)").
2. **La tormenta penaliza en proporción a las horas que ocupa.**
   `EntradaBloque.tormentaFrac` escala el castigo y solo marca
   PELIGRO si tapa ≥ `seguridad.tormentaPeligroFrac` (35 %) de la
   jornada. En los bloques de 2 h no aplica: ahí cualquier tormenta
   sigue siendo peligro sin negociar. La fila del día igual avisa la
   hora ("tormenta prevista desde 1 pm").
3. **`soloReferencia` en puntos.ts.** Ocean Reef islas está a minutos
   de la dársena, así que siempre ganaba como "mejor destino" — cierto
   pero inútil. Marcado como punto de consulta: se sigue viendo su
   clima, no se propone como destino de jornada. Y si todos los
   destinos quedan dentro de 3 puntos, la fila dice "parejo en todos
   los puntos" en vez de vender un ganador que el pronóstico no
   distingue.

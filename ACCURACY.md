# ACCURACY — seguimiento de exactitud

Archivo vivo para quien siga mejorando qué tan cierto es lo que dice La
Fourno. **Léelo antes de tocar el score, la calibración o la capa de
datos.** El historial completo con los números está en `DECISIONES.md`
§13; acá está lo accionable.

---

## Cómo trabajar esto

Una regla, y sale de haberla aprendido caro en la auditoría del
31-ago-2026:

> **Medir primero, implementar después. Y estar dispuesto a botar lo ya
> implementado si el dato no lo respalda.**

En esa sesión una mejora sonaba obvia (medir el picado con el chop del
viento en vez del período combinado), se implementó completa, y al
medirla resultó que **empeoraba** el score por dos vías distintas. Se
botó. Si hubiera ido al revés —implementar y confiar— hoy la app
cobraría el viento dos veces sin que nadie lo notara.

Corolario práctico: casi todo se decide con una request a Open-Meteo y
20 líneas de `node -e`. Es barato. No supongas.

Segunda regla: **el aviso que sale siempre no informa.** Cada umbral
nuevo se elige mirando en cuántos días dispara. Si marca más o menos la
mitad, está mal puesto.

---

## Ya verificado — no lo repitas

Fecha de la medición entre paréntesis. Si vas a revisar algo de acá,
que sea porque sospechas **deriva**, no porque no se hizo.

| Tema | Veredicto | Dónde |
|---|---|---|
| Celda de mar vs tierra para el viento (31-ago-2026) | Arreglado con `cell_selection=sea`. Cambiaba 4 de 9 puntos, hasta +44 % en el máximo de Coronado | `api.ts`, test en `tests/unit/api.test.ts` |
| Medir el picado con `wind_wave_*` (31-ago-2026) | **Probado y descartado.** `wave_period` ya es media ponderada por energía | nota larga en `score.ts`, contribución `mar-corto` |
| Física de la marea CMEMS (31-ago-2026) | Sana: M2 a 12.48 h vs 12.42 h teóricos, sicigia 4.5–4.7 m, ciclo correcto. Ojo: el contraste **externo** sigue abierto | `tide.ts` |
| Umbral CAPE 2500 J/kg (31-ago-2026) | Bien puesto: percentil ~93, dispara en 6.3 % de las horas | `calibracion.ts` |
| Error del pronóstico por anticipación (31-ago-2026) | **No crece con los días**: MAE ~2.7 kt igual a 1 que a 7 días | ver §Frente 2 |
| Resolución real de los 9 puntos (31-ago-2026) | 7 celdas de clima, 6 de mar. Contadora/Chapera/Caracoles comparten viento | `api.ts` |

---

## Frentes abiertos, por prioridad

### P1 — No hay ninguna verdad de campo

**El problema.** Todo el score está calibrado contra el criterio de
Tommy, no contra cómo salió el viaje. Ni un solo número de
`calibracion.ts` ha sido confrontado con la realidad. Eso significa que
hoy la calibración es **infalsificable**: si estuviera mal, nada en el
repo se enteraría.

Es el techo de todo lo demás. Se pueden seguir puliendo las fuentes,
pero sin verdad de campo no hay forma de saber si `viento.curva` refleja
lo que se siente en un CCX 40 o si es una opinión bien comentada.

**Qué hacer.** Lo más chico que sirva: al volver de un viaje, registrar
el día, el destino, y una nota de una línea sobre cómo estuvo. Con
15–20 salidas ya se puede comparar el score contra la experiencia y
mover anclajes con fundamento.

**Ojo con el alcance.** Esto toca producto, no solo código, y agrega
una pantalla a una app que se limpió a propósito para no estar
enredada. **Preguntarle a Tommy antes de construirlo.** No es una
decisión técnica.

**Criterio de éxito.** Poder responder: "cuando la app dijo 70+, ¿el
viaje estuvo bueno?" con datos, no con intuición.

---

### P2 — El error se midió solo en temporada de lluvia

**Lo medido (31-ago-2026).** Error real del pronóstico contra lo que
después pasó, corredor marina+Contadora, horas 9–16, últimos 14 días:

| anticipación | MAE | sesgo | en puntos de viento (de 45) |
|---|---|---|---|
| 1 día | 2.71 kt | +0.80 | 3.0 |
| 2 días | 2.51 kt | −0.22 | 2.5 |
| 3 días | 2.70 kt | −0.22 | 2.9 |
| 5 días | 2.69 kt | −0.62 | 2.6 |
| 7 días | 2.62 kt | −0.62 | 2.6 |

**Plano.** El domingo que viene se pronostica tan bien como mañana, lo
cual respalda mostrar la semana completa con la misma cara. Y el piso de
ruido (~3 pts) queda muy por debajo del umbral de desacuerdo entre
modelos (8 pts), así que ese aviso no está marcando ruido.

**Por qué no cerrarlo todavía.** Son 14 días de **temporada lluviosa**,
donde el viento es flojo y parejo. Justo por eso el error casi no
depende de la anticipación: no hay mucho que errar. En temporada seca,
con nortes de 15–20 kt, la habilidad del modelo probablemente sí decaiga
con los días — y esa es la temporada en que más se sale.

**Cómo cerrarlo.** Repetir la misma medición entre enero y marzo. Si el
MAE a 7 días se despega del de 1 día, hay que decirlo en la app: los
días lejanos dejarían de valer lo mismo.

---

### P2 — El contraste externo de la marea es de n=2

**Lo que hay.** Dos comprobaciones distintas, que conviene no mezclar:

1. **Contraste externo (9-ago-2026)** contra la tabla armónica de Balboa
   de tide-forecast.com — fuente **comercial, no oficial**. Rango del
   ciclo 3.23 m modelo vs 3.18 m tabla, desfase ~30 min en bajamar
   (5:25 vs 6:01 am) y en pleamar (11:45 vs 12:17 pm).
2. **Consistencia física (31-ago-2026)**, 8 días: período M2, ciclo
   sicigia-cuadratura y amplitud, todo en su sitio.

**Lo que falta.** El punto 1 son **dos extremos de un solo día contra una
fuente comercial**. Alcanza para descartar que el modelo esté
groseramente corrido; no para afirmar un "error típico de ±30 min", que
es lo que el código llegó a decir. Y el punto 2 es autoconsistencia: si
CMEMS tuviera un sesgo sistemático de 20–30 min, saldría igual de bien.

**Cómo cerrarlo.** Predicciones de un puerto de referencia del Pacífico
panameño, preferible fuente **oficial** (AMP / IGN), sobre varias semanas
que incluyan sicigia y cuadratura. Comparar los instantes contra
`extremos()` y reportar el **sesgo medio con su dispersión**, no un
ejemplo. Si el sesgo es sistemático, se puede corregir; si es disperso,
hay que decir el margen en la app.

**Importante:** pase lo que pase, **la etiqueta "estimada" no se quita**
— es decisión de producto, está en `CLAUDE.md`.

---

### P2 — El modelo no sabe que las islas tapan

Las Perlas son islas, y una isla protege su lado de sotavento. El modelo
de oleaje no resuelve eso a esta escala: Contadora, Chapera y Caracoles
salen con **la misma ola** porque comparten celda.

En la práctica el destino se elige, entre otras cosas, por dónde va a
estar más calmado — y ahí la app hoy no distingue. Puede estar
recomendando la cara equivocada de la isla.

**Cómo abordarlo.** Cruzar dirección de ola y viento con la geometría de
cada punto: un destino al abrigo del rumbo de donde viene el mar debería
puntuar mejor. `wave_direction` y `wind_direction_10m` ya se bajan y
**hoy no se usan para nada en el score**.

**Cuidado.** Es fácil inventar un modelo de sombra que suene físico y no
prediga nada. Antes de ponerlo en el score, verificar que cambie el
destino elegido en días reales y que el cambio tenga sentido en el mapa.

---

### P3 — Perillas que nadie ha validado

Números puestos a criterio, nunca confrontados. Ninguno es urgente;
todos se vuelven medibles el día que exista verdad de campo (P1).

| Perilla | Valor | Qué se asume sin probar |
|---|---|---|
| `jornada.pesoPico` | 0.5 | Que el día se resume mitad promedio, mitad peor momento |
| `viento.rachaDeltaKt` / `rachaPenal` | 7 kt / −8 | Que una racha 7 kt sobre el sostenido molesta tanto |
| `marea.bajaExtremaFrac` | 0.15 | Que ese nivel relativo complica de verdad en Las Perlas (depende de la batimetría, nunca se miró) |
| `ola.periodoLargoS` / bono | 12 s / +3 | Que ahí empieza el mar cómodo |
| `UMBRAL_PAREJO` / `UMBRAL_FORMA` | 3 / 6 pts | Que por debajo de eso es ruido del modelo |

---

### P3 — El término de marea quedó en cajones

Viento, sol y ola usan **curvas** con anclajes interpolados. La marea
sigue con cajones duros: 0.3, 0.6 u 0.8 del peso según el caso
(`score.ts`, sección Marea). Es justo lo que se corrigió en todo lo
demás porque colapsaba días distintos en el mismo número.

Pesa 10 de 100, así que el daño es acotado — pero es una inconsistencia
real con la filosofía declarada en `calibracion.ts`. Efecto lateral: un
día perfecto solo llega a 100 si además la marea está llenando.

---

### P4 — Un día con datos parciales compite de igual a igual

Si falta el dato de mar, `scoreBloque` marca `parcial: true` pero el
total simplemente sale ~25 puntos más bajo, y ese día se compara y se
ordena contra días completos como si nada.

Hoy el riesgo es bajo: la API marina falla entera o llega entera, así
que dentro de una misma corrida o todos los días tienen mar o ninguno.
Pero si alguna vez llega recortada al final del horizonte, los últimos
días perderían el ranking por falta de dato, no por mal clima.

**Cómo cerrarlo.** No dejar que un día `parcial` gane el veredicto, o
comparar sobre el máximo alcanzable en vez del absoluto.

---

## Recetas de medición

Lo que funcionó. Guardar los JSON en `$CLAUDE_JOB_DIR/tmp` y analizarlos
con `node -e`.

**Error real por anticipación** — la API de corridas anteriores devuelve,
para las mismas horas, lo que se pronosticaba N días antes:

```
https://previous-runs-api.open-meteo.com/v1/forecast
  ?latitude=8.9652,8.6269&longitude=-79.5047,-79.037
  &hourly=wind_speed_10m,wind_speed_10m_previous_day1,wind_speed_10m_previous_day3,wind_speed_10m_previous_day7
  &past_days=14&forecast_days=1
  &timezone=America%2FPanama&wind_speed_unit=kn&cell_selection=sea
```

**Temporada seca (nortes de verdad)** — el histórico llega mucho más
atrás que el pronóstico, y son APIs distintas: clima en
`archive-api.open-meteo.com/v1/archive`, mar en
`marine-api.open-meteo.com/v1/marine` con `start_date`/`end_date`. El
`/v1/forecast` normal **rechaza** fechas viejas.

**Desacuerdo entre modelos** — `&models=ecmwf_ifs025,gfs_seamless,icon_seamless`.
Las claves vuelven con el modelo pegado (`wind_speed_10m_ecmwf_ifs025`).
ICON llega más corto que los otros: siempre tolerar nulos al final.

**Ver la app con datos reales** — levantar `npm run preview -- --port 4330`
y manejarla con Playwright. Los auditores (`scripts/audita-layout.mjs`,
`scripts/audita-contraste.mjs`) usan la API real, no fixtures. Y **mirar
las capturas**: en las dos últimas auditorías, mirar la pantalla encontró
incoherencias que ningún test agarró.

**Trampa conocida al escribir E2E:** las filas del día existen vacías
desde el primer render. Contar antes de que lleguen los datos da cero sin
que nada esté roto. Esperar `.badge-score strong` con dígitos primero.

---

## Números base (para detectar deriva)

Medidos el 31-ago-2026. Si vuelves a medir y algo se movió mucho, es
señal de que cambió el modelo de Open-Meteo, no de que estuviera mal
antes.

- Viento medio de jornada en el corredor, temporada lluviosa: **4–6 kt**
- Chop del viento por rango: 0–5 kt → 0.04 m · 8–12 kt → 0.25 m · 15+ kt → 0.62 m
- Rango de marea: **4.5–4.7 m** en sicigia, **2.7 m** en cuadratura
- CAPE en Panamá, agosto: mediana **1740**, p90 2360 J/kg
- MAE del viento, cualquier anticipación: **~2.7 kt ≈ 3 puntos de score**
- Desacuerdo entre modelos: marca **2 de 7 días** con umbral 8 pts

---

## Cómo verificar que no rompiste nada

```
npm run typecheck     # incluye los tests (tsc solo miraba src hasta ago-2026)
npm run lint
npm test              # 63 unit
npm run test:e2e      # 16 E2E
node scripts/audita-layout.mjs      # requiere preview en :4330
node scripts/audita-contraste.mjs   # requiere preview en :4339
```

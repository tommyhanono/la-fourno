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
| Umbral CAPE (1-sep-2026) | **CORREGIDO**: 2500 disparaba en el 44 % de los días de lluviosa. Subido a 3800 (17 %). La medición del 31-ago que lo daba por bueno salía de 8 días calmados | `tests/unit/umbrales-seguridad.test.ts` |
| Error del pronóstico por anticipación (1-sep-2026) | SÍ crece: 2.38 kt a 1 día → 3.48 a 7. Empata con climatología en los días 6-7. **Corrige la medición del 31-ago** | `scripts/medir-skill.mjs` |
| Contraste externo de la marea (1-sep-2026) | n=356 contra NOAA Balboa. Sesgo de −27 min **corregido**; error típico 27.0 → 3.6 min | `scripts/medir-marea.mjs`, test de regresión |
| Estacionalidad de la calibración (1-sep-2026) | No hace falta: separa días en seca y en lluviosa | `scripts/medir-estaciones.mjs` |
| Sensibilidad de las perillas (1-sep-2026) | 1 eliminada (bono mar viejo), 3 marcadas críticas | `tests/unit/sensibilidad.test.ts` |
| Resolución real de los 9 puntos (31-ago-2026) | 7 celdas de clima, 6 de mar. Contadora/Chapera/Caracoles comparten viento | `api.ts` |

---

## Frentes abiertos, por prioridad

### P1 — Verdad de campo: la tubería ya está, faltan los datos

**Sigue siendo el techo de todo lo demás**, pero cambió de naturaleza:
antes faltaba construirla, ahora falta que se llene.

**El problema.** Ningún número de `calibracion.ts` se ha comparado nunca
con cómo salió un viaje. La calibración es **infalsificable**: si
estuviera mal, nada en el repo se enteraría. Por eso las perillas
críticas están marcadas como "sin validar" y no se afinan a ojo.

**Lo que se construyó el 1-sep-2026:**

- Una **fila** en el home, y nada más — no hay pantalla nueva ni
  bitácora. Sale solo si hay un día de los últimos 3 sin registro.
  "¿Saliste el sábado?" → No salí / Sí → Peor / Igual / Mejor, más
  viento real y una nota, los dos opcionales. Nunca insiste, nunca
  notifica, nunca bloquea.
- El **archivo de pronósticos**, que es la mitad que de verdad importa:
  la app guarda cada día lo que estaba pronosticando, salga él o no.
  Sin esto el registro no serviría, porque el pronóstico se recalcula y
  para cuando contesta el domingo el del sábado ya no existe.
- Persistencia: localStorage manda (funciona sin señal); Supabase es
  respaldo best-effort en las tablas `fourno_registros` y
  `fourno_pronosticos` del proyecto compartido. Escrituras solo por RPC
  SECURITY DEFINER con token, igual que `cc_*`.

**Qué falta.** Que se acumulen ~15-20 salidas. Ahí recién se puede:

1. Confirmar o mover `pesoPico` (la más sensible de todas).
2. Confirmar `rachaDeltaKt` y `marea.bajaExtremaFrac`.
3. Desbloquear la sombra de islas, hoy imposible de validar.
4. Responder la pregunta de fondo: *cuando la app dijo 70+, ¿el viaje
   estuvo bueno?*

**Cómo leer los datos después.** Las dos tablas están en el Supabase
compartido (proyecto tres-leches), y **no se leen con la anon key**: la
RLS las cierra y solo los RPC de escritura entran. Para analizarlas se
consulta con el MCP de Supabase o desde el panel.

```sql
-- ¿Acertó el score? Cada respuesta con lo que la app había dicho.
select r.dia, r.resultado, r.viento_real_kt, r.nota,
       (r.pronostico->>'score')::int        as score_dicho,
       (r.pronostico->>'vientoMaxKt')::real as viento_dicho,
       r.pronostico->'entrada'              as insumos
from public.fourno_registros r
order by r.dia desc;
```

La clave está en `pronostico->'entrada'`: son **los insumos crudos** con
los que se calculó el score ese día. Con eso se puede volver a correr
`scoreBloque` con otras perillas sobre los días reales y preguntarse
*"¿con `pesoPico` en 0.35 habría acertado?"*. Sin la entrada solo se
sabría que la app dijo 72 y que el viaje estuvo peor, que no alcanza
para mover nada. Hay un test que verifica que el score archivado es
reproducible desde su entrada.

`fourno_pronosticos` trae el archivo diario con `dia` y `emitido_el`:
la diferencia es la anticipación, así que sirve para medir error real
por horizonte **salga o no salga a navegar**.

Con ~15-20 respuestas ya se puede empezar. El orden sugerido: primero
`pesoPico` (la más sensible), después `rachaDeltaKt` y
`marea.bajaExtremaFrac`.

**Ojo con el token.** `VITE_FOURNO_TOKEN` viaja en el bundle: cualquiera
que abra la app lo puede leer. No es un secreto, es una molestia para el
que pase por ahí. Si algún día aparece basura en las tablas, se rota el
valor en `fourno_config` y en Vercel.

### CERRADO — El pronóstico tiene skill: hasta el día 5 en lluviosa, hasta el 7 en seca

**Medido el 1-sep-2026** (`scripts/medir-skill.mjs`). Verdad = ERA5,
corredor marina+Contadora, horas 9-16, ventana 1-jun a 20-ago-2026,
n≈600 por horizonte, climatología de 2019-2025. MAE en nudos:

| lead | modelo | persistencia | climatología | pareado vs clima |
|---|---|---|---|---|
| −1d | 2.38 | 2.98 | 3.22 | −0.838 ±0.111 ✔ |
| −2d | 2.68 | 3.36 | 3.23 | −0.558 ±0.099 ✔ |
| −3d | 2.82 | 3.74 | 3.25 | −0.429 ±0.087 ✔ |
| −4d | 3.07 | 4.08 | 3.28 | −0.213 ±0.092 ✔ |
| −5d | 3.10 | 3.83 | 3.30 | −0.195 ±0.085 ✔ |
| −6d | 3.36 | 4.00 | 3.31 | +0.049 ±0.081 ✖ empate |
| −7d | 3.48 | 3.69 | 3.33 | +0.146 ±0.085 ✖ empate |

**Tres cosas quedaron claras.** (1) El error SÍ crece con el horizonte:
+46 % del día 1 al 7. (2) Le gana a persistencia en 7/7, así que el
pipeline de medición está sano — descarta que el día 1 no tenga skill.
(3) A partir del día 6 **empata con la climatología**: el pronóstico ya
no aporta nada sobre "así viene esta época del año".

Consecuencia en el producto: los días se siguen mostrando —fue un
pedido explícito— pero del 6 en adelante la app lo dice, y no afirma la
forma del día. Perilla: `skillHorizonteDias: 5`.

**Corrige la medición del 31-ago**, que decía que el error no crecía.
Aquella metía horas futuras dentro de la "verdad" y tenía n=240.

Verificado de paso: la columna `wind_speed_10m` que devuelve
previous-runs-api para fechas pasadas es **idénticamente ERA5** (MAE
0.00 kt sobre 1944 h). O sea que no era el modelo comparándose consigo
mismo — pero ERA5 sigue siendo un reanálisis, no una boya, y no hay
observación directa de viento en el Golfo que sea gratis.

**Y en temporada seca llega hasta el día 7.** Se creía imposible de
medir porque `past_days` solo cubre 92 días — pero la API acepta
`start_date`/`end_date` explícitas y responde para enero-marzo. Misma
medición, 5-ene a 25-mar-2026, n≈600 por horizonte:

| lead | modelo | persistencia | climatología | pareado vs clima |
|---|---|---|---|---|
| −1d | 1.86 | 4.32 | 3.35 | −1.354 ±0.121 ✔ |
| −3d | 2.20 | 4.41 | 3.36 | −1.154 ±0.126 ✔ |
| −5d | 2.63 | 4.15 | 3.39 | −0.760 ±0.129 ✔ |
| −6d | 2.64 | 3.81 | 3.41 | −0.773 ±0.127 ✔ |
| −7d | 2.84 | 3.97 | 3.40 | −0.564 ±0.142 ✔ |

Le gana a climatología en **7 de 7**, todos concluyentes. En seca los
nortes vienen forzados por sinóptica y se pronostican bien toda la
semana; en lluviosa manda la convección local, que se vuelve
indistinguible del promedio a partir del día 6.

Por eso `skillHorizonteDias` es **estacional**: 7 en seca (dic-abr),
5 en lluviosa. Mayo y noviembre son transición y van del lado
conservador. Poner 5 todo el año castigaba de más justo en la temporada
en que más se sale.

---

### CERRADO — No hace falta estacionalizar la calibración

**Medido el 1-sep-2026** (`scripts/medir-estaciones.mjs`), 451 días de
seca y 460 de lluviosa, ERA5 2021-2025:

| | seca (ene-mar) | lluviosa (jun-ago) |
|---|---|---|
| viento típico de jornada | 10.7 kt (p90 15.0) | 7.5 kt (p90 10.4) |
| días con lluvia en la jornada | 10 % | 68 % |
| dispersión del score (p90−p10) | 36.5 | 29.2 |

El score separa días en las dos temporadas, así que no hace falta
estacionalizarlo. La seca es más ventosa y ahí la curva de viento
trabaja en su parte empinada, que es justo donde discrimina mejor.

**Límite del método, importante:** el archivo de ERA5 **no trae CAPE**
(0 de 2208 h) y su `weather_code` nunca da tormenta (95/96/99) — cero
tormentas en 460 días de lluviosa, que es imposible en Panamá. Así que
la dispersión de lluviosa es un PISO: el score real, que sí ve tormentas
en el pronóstico en vivo, separa más de lo que se pudo medir.

---

### BLOQUEADO por P1 — Sombra de islas: medido y NO implementado

Se evaluó y **no se hizo**, con números:

1. Contadora, Chapera y Caracoles caen en la **misma celda marina** y
   devuelven el número idéntico (0.6 m, dirección 205°). Un factor de
   exposición entre ellos sería ficción pura.
2. Entre celdas distintas, la razón de altura de ola varía apenas
   **0.068** según el cuadrante del viento (mogo/contadora, 0.973 a
   1.041). El modelo no lleva señal direccional de sombra.
3. En temporada seca el viento viene del N/NO en ~90 % de las horas: no
   hay variedad direccional que explotar aunque la hubiera.

`wave_direction` y `wind_direction_10m` se bajan y **siguen sin usarse
en el score**, a propósito. Retomarlo cuando haya verdad de campo: sin
ella, una tabla de exposición escrita a mano no se puede validar.

### CERRADO — La marea venía adelantada 27 min, y ya está corregida

**Medido el 1-sep-2026** (`scripts/medir-marea.mjs`). Se encontró la
estación **9812501 de NOAA — "BALBOA, CANAL ZONE (PACIFIC)"**, que
publica predicciones armónicas oficiales en datum **MSL**, el mismo que
devuelve CMEMS, para cualquier rango de fechas y en dominio público.
Balboa está a ~7 km de Marina Ocean Reef. El contraste externo pasa de
n=2 a **n=356**.

| | valor |
|---|---|
| sesgo medio | **−27.0 min** (el modelo adelanta) |
| mediana / p10 / p90 | −27.0 / −35.0 / −19.4 |
| rango | −40.6 a −3.5 · **los 356 del mismo signo** |
| pleamar vs bajamar | −26.4 vs −27.6 (iguales) |

**Se descartó que fuera geografía.** El mismo sesgo aparece lejísimos:
Puntarenas −33.7, La Libertad (Ecuador) −33.3 y **San Cristóbal
(Galápagos) −29.9**, en océano abierto a 1900 km. Es fase del modelo
CMEMS, no que la celda caiga al sur de la estación. Los ~30 min sugieren
una convención de etiquetado (la muestra de la hora H sería el promedio
de H a H+1, o sea centrada en H+30 min).

**Corregido** con `marea.desfaseModeloMin: 27`, aplicado una sola vez
sobre los tiempos de la serie para que nivel, tendencia y extremos
queden corridos igual. Efecto: el error típico del instante de
pleamar/bajamar baja de **27.0 a 3.6 min** y el p90 de 35.0 a 10.5.

Queda como **test de regresión permanente**
(`tests/unit/marea-validacion.test.ts`) contra un fixture de 355
extremos oficiales, no como script suelto: si alguien pone el desfase en
0, el test cae.

**Lo que queda abierto:** el nivel. El modelo lee +0.38 m en pleamar y
+0.61 m en bajamar respecto al MSL de NOAA, o sea que además comprime el
rango ~0.27 m. NO se corrigió, y a propósito: parte de esa diferencia es
espacial (la celda está 10 km al sur, donde el rango es menor) y no se
puede separar del sesgo de datum sin más estaciones. El score usa nivel
RELATIVO al rango del día, así que no lo afecta; lo que quedaría corrido
son los metros que se muestran. **Y la etiqueta "estimada" no se quita.**

**Si Open-Meteo arregla la convención**, este desfase sobra y habría que
ponerlo en 0. La forma de saberlo es volver a correr
`scripts/medir-marea.mjs`.

---

### CERRADO — Perillas: una eliminada, tres marcadas como críticas

**Medido el 1-sep-2026** (`tests/unit/sensibilidad.test.ts`) sobre **180
días reales** del corredor, 90 de seca y 90 de lluviosa, moviendo cada
perilla y mirando si cambia el ranking o la etiqueta que ve el usuario:

| perilla | Δscore | semanas | etiquetas | veredicto |
|---|---|---|---|---|
| `pesoPico` 0.5→0 | 4.43 | 7/25 | 33 | **crítica, sin validar** |
| `rachaDeltaKt` 7→5 | 3.87 | 6/25 | 35 | **crítica, sin validar** |
| término de marea completo | 5.81 | 4/25 | 52 | **se queda: sí pesa** |
| `marea.bajaExtremaFrac` 0.15→0.30 | 1.34 | 5/25 | 9 | crítica (cambia top-1) |
| pesos viento/sol ±5 | ~1.7 | 0-2/25 | ~14 | poco sensible |
| **bono "mar viejo"** | **0.03** | **0/25** | **0** | **ELIMINADO** |

**Eliminado:** el bono de mar viejo (`periodoLargoS`/`periodoLargoBono`).
No cambiaba ni una etiqueta en 180 días. Estaba muerto porque `periodoS`
es el período MÍNIMO de la jornada, y pedir que el mínimo llegue a 12 s
pasa en 2 de 90 días por temporada. Si alguna vez se quiere premiar el
mar cómodo, el problema no es el tamaño del bono: hay que mirar el
período típico y no el mínimo.

**El término de marea SE QUEDA**, y ahora con respaldo: es el tercero
que más pesa. Pero sus VALORES (0.15, 6, 3, 2) siguen sin validar, y
`bajaExtremaFrac` es la más sensible. Sigue repartiendo por cajones
mientras el resto usa curvas: es una inconsistencia consciente,
convertirla en curva sería inventar valores intermedios.

**NO medibles con ERA5** (no trae los insumos): `probLluviaPenalMax`,
`capeAltoPenal`, `tormentaPenal`.

Hay una guardia permanente: si alguien agrega una perilla que no mueve
nada, el test `ninguna perilla de puntaje es decoración pura` falla. Las
rayas de seguridad quedan fuera de esa guardia a propósito — deben estar
dormidas en días buenos, y eso también se prueba.

---

### CERRADO — El umbral de CAPE era papel tapiz en temporada lluviosa

**Corrige la conclusión del 31-ago-2026**, que decía que 2500 J/kg era
el percentil 93 y estaba bien puesto. Esa medición salía de **8 días**
de una semana inusualmente calmada.

Para medirlo de verdad hacía falta un dataset que ERA5 no da: el
archivo de reanálisis **no trae CAPE ni códigos de tormenta**. La
solución fue `historical-forecast-api.open-meteo.com`, que guarda las
corridas de pronóstico pasadas y sí los trae. Con 86 días reales de
lluviosa y 60 de seca:

| | lluviosa (86 d) | seca (60 d) |
|---|---|---|
| CAPE típico de jornada (p50) | **3062** | 1016 |
| p90 | 4188 | 2093 |
| días con alguna tormenta | 35 % | **0 %** |

El trópico corre CAPE alto de rutina: 3000 J/kg es un martes cualquiera
en agosto, no una señal. Con 2500 el aviso salía en el **44 %** de los
días sin tormenta.

Umbrales medidos (% de días de lluviosa sin tormenta que dispararían):
2500 → 44 % · 3000 → 35 % · 3500 → 24 % · **3800 → 17 %** · 4000 → 9 %.

Subido a **3800**. Queda dormido en seca (0 %), que es lo correcto: sin
convección no hay nada que avisar.

De paso quedaron medidos los otros dos umbrales que tampoco se podían
probar: la bandera de tormenta marca **1 %** de los días de lluviosa
(raya dura bien dormida, aunque el 35 % de los días tenga algo de
tormenta y penalice en proporción) y la lluvia fuerte, **5 %**.

La probabilidad de lluvia dispara en el 92 % de los días, y **está
bien**: no es una raya dura, el castigo es proporcional (12 pts ×
prob/100), así que discrimina por magnitud. Si algún día se convierte
en umbral, hay que remedirlo.

Todo esto quedó como test de regresión con fixture: si alguien vuelve a
bajar el CAPE a 2500, el test falla diciendo "44.19 %".

---

### CERRADO — El aviso de desacuerdo ahora también mira el sol

**Medido el 1-sep-2026.** El aviso miraba solo el viento, por ser el
45 % del score. Era un error: los modelos se contradicen **más en las
nubes**. Desacuerdo entre ECMWF, GFS e ICON en la jornada, en puntos:

| | mediana | máximo |
|---|---|---|
| viento (de 45) | ~5 | 11.4 |
| **nubosidad (de 30)** | **10.5** | **21.6** |

El caso que lo decidió: para el 2-sep —el día que la app estaba
recomendando— ECMWF veía 28 % de nubes, GFS 95 % e ICON 46 %. La app
enseñaba ese número sin decir nada, y el sol es el segundo criterio de
Tommy.

Ahora el desacuerdo suma viento + sol en la misma moneda (de 75) y el
umbral se recalibró a **20** (antes 8 sobre 45). Verificado en vivo:
marca **1 de 8 días**, y ese día es el veredicto — o sea que la app
marca su propia recomendación como no firme cuando corresponde.

**Remedido sobre 137 días**, no 8: la API de pronóstico histórico
acepta `models=`, así que hay meses de multimodelo. El número puesto a
ojo aguantó — lluviosa (72 d) p50=12.6, marca 19 %; seca (65 d)
p50=14.1, marca 26 %. Con 10 marcaría dos de cada tres días. En seca
los modelos discrepan más en la cola (p90 33.4 contra 22.1): los nortes
se pronostican bien de media, pero cuando fallan, fallan feo.

---

### CERRADO — El copy se contradecía a sí mismo

Encontrado mirando la pantalla, no los tests: la vista de punto mostraba
**"despejado · lluvia 69 %"**. Los dos datos ciertos —la nubosidad es el
PROMEDIO de la jornada y la lluvia el MÁXIMO— pero juntos sin matiz se
desmienten, y es justo lo que no hay que decirle a alguien decidiendo si
sale al mar.

No era un error de dato: en temporada lluviosa el patrón real ES sol de
mañana y chubasco de tarde, y el promedio de nubes queda bajo. Ahora la
app lo llama por su nombre: con cielo abierto en promedio y lluvia más
probable que no, dice **"sol y chubascos"**. Un solo helper compartido
para que el home y la vista de punto digan lo mismo, con un test que
recorre las 441 combinaciones y verifica que si dice "despejado" la
lluvia nunca es probable.

---

### CERRADO — Guard de datos parciales

`ResultadoScore` ahora trae `faltan[]` y `pesoFaltante`, no solo un
booleano. Con eso:

- **Un día incompleto ya no compite** por el veredicto contra días
  completos. Sin dato de mar perdía 25 puntos de arranque (ola 15 +
  marea 10) y perdía siempre por una razón que no era el clima. Si
  ninguno está completo, se comparan entre ellos.
- **Sin viento o sin cielo no se muestra número**: sale "Sin dato" en
  gris (nunca en rojo: falta de dato no es mala condición). Sin ola ni
  marea sí se muestra, porque lo que queda —viento y sol— es de lo que
  Tommy decide; el desglose aclara que el puntaje va sobre 75.
- El desglose dice **QUÉ** faltó, no solo que faltó algo.

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

**Baselines tontos (persistencia y climatología)** — sin esto no se
sabe si el modelo tiene skill o solo es consistente consigo mismo. Ya
está hecho en `scripts/medir-skill.mjs`; reusarlo cambiando la ventana.

**Marea contra fuente oficial** — NOAA publica predicciones armónicas
para Balboa (estación **9812501**), datum MSL, métrico, dominio público:

```
https://api.tidesandcurrents.noaa.gov/api/prod/datagetter
  ?product=predictions&station=9812501&datum=MSL&interval=hilo
  &begin_date=20260601&end_date=20260831&time_zone=lst&units=metric&format=json
```

Las constantes armónicas están en el endpoint `mdapi/.../harcon.json`,
por si alguna vez hace falta generarlas localmente. Otras estaciones del
Pacífico para contrastar: Puntarenas 9684403, La Libertad 9991474, San
Cristóbal (Galápagos) 9992401.

**Tormentas, CAPE y probabilidad de lluvia** — ERA5 NO los trae. Hay
que usar el archivo de PRONÓSTICOS, que guarda las corridas pasadas:

```
https://historical-forecast-api.open-meteo.com/v1/forecast
  ?latitude=...&longitude=...
  &hourly=weather_code,cape,precipitation_probability,cloud_cover
  &start_date=2026-06-01&end_date=2026-08-25
  &timezone=America%2FPanama&cell_selection=sea
```

Es la única forma de verificar `capeAltoJkg`, `tormentaPeligroFrac` y
`lluviaFuerteMmH`. Fue justo por no tenerla que el CAPE pasó meses mal
puesto.

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
- CAPE típico de jornada: lluviosa p50 **3062** / seca p50 **1016**
- Días con tormenta en la jornada: lluviosa **35 %** / seca **0 %**
- MAE del viento en lluviosa: **2.38 kt a 1 día**, **3.48 a 7 días**
- MAE del viento en seca: **1.86 kt a 1 día**, **2.84 a 7 días** (mejor)
- Desfase de la marea CMEMS antes de corregir: **−27 min** en Panamá
- Desacuerdo entre modelos (viento+sol, de 75): marca **1 de 8 días** con umbral 20
- Desacuerdo en nubosidad: mediana **10.5 pts de 30** — el doble que el de viento

---

## Cómo verificar que no rompiste nada

```
npm run typecheck     # incluye los tests (tsc solo miraba src hasta ago-2026)
npm run lint
npm test              # 128 unit
npm run test:e2e      # 19 E2E
node scripts/audita-layout.mjs      # requiere preview en :4330
node scripts/audita-contraste.mjs   # requiere preview en :4339
```

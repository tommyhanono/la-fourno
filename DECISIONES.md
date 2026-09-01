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

## 7. La unidad de respuesta es el DÍA, no la hora

~~Bloques de 2 h, 3 mejores ventanas~~ — retirado en la ronda 12 (§12).
La app responde por días completos sobre la jornada de
`calibracion.jornada` (9 am – 4 pm). El score del corredor toma el
**peor caso hora a hora** entre salida y destino (el corredor se navega
entero) y la marea se evalúa a la llegada. Lo más fino que sale al UI
es la *forma* del día en palabras ("está mejor temprano"), nunca un
segundo puntaje por franja.

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

## 11. Revisión de exactitud y estilo (2026-08-15)

Pasada completa a pedido de Tommy ("que la información esté exacta y el
estilo como debe ser"). Lo que se corrigió y por qué:

**Exactitud**

1. **Las horas de sol se truncaban.** "sol 6 am – 6 pm" cuando en
   realidad amanece 6:10 y se pone 6:35 pm. Para volver con luz, esos
   35 minutos importan: ahora van con minutos (`horaCorta`).
2. **La marea era un número sin referencia.** "−1.9 m" no dice nada por
   sí solo; el dato es altura sobre el nivel medio del mar. Ahora lo
   declara (`refMarea`) y la curva lo repite al pie.
3. **El rumbo del viento no decía "del".** Viento y oleaje se nombran
   por DONDE VIENEN; sin la preposición se puede leer al revés
   (`procedencia`). El oleaje ya lo decía; ahora los dos.
4. **El resumen del día mostraba un promedio ponderado** como si fuera
   una medición. Ahora muestra el **rango medido** ("2–9 kt"), que sí
   existe en el pronóstico. El score sigue usando su número interno, y
   el desglose lo explica.
5. **Dos pantallas daban cifras distintas del mismo día** sin decir por
   qué: "Día por día" usa la jornada 9 am – 4 pm del corredor y "La
   semana" del punto usa máximos de 6 am – 6 pm en ese punto. Cada una
   declara ahora su franja.
6. **"Ocean Reef" se confundía con la marina de salida** → "Islas Ocean
   Reef".
7. **El score saturaba**: seis días seguidos daban exactamente 40
   porque los tramos de la calibración eran escalones. Se pasó a
   interpolar entre ellos. ⚠️ **Corregido en la ronda 12**: la frase
   original decía que "los valores exactos no se movieron", y era
   falsa — solo se cumplía justo en los umbrales. Ver §12.
8. **La pantalla parecía contradecirse**: arriba "mañana 8–10 am, 65" y
   abajo "mañana, 11". El intento de esta ronda fue mostrar el mejor
   momento dentro de cada día. ⚠️ **Revertido en la ronda 12**: no
   resolvía la contradicción, la duplicaba. Ver §12.

**Estilo y layout** (medidos con `scripts/audita-layout.mjs`)

9. **El aviso fijo tapaba contenido.** `main` reservaba 96 px fijos pero
   el aviso mide 90 px a 390 px, 107 px a 320 px y **302 px con el texto
   del teléfono al 200 %**. Ahora el propio aviso publica su altura en
   `--aviso-alto` (ResizeObserver) y el contenido reserva esa.
10. **La curva de marea encimaba las etiquetas de bajamar con el eje de
    horas.** Banda inferior reservada, etiquetas que se voltean si no
    caben y anclaje al filo en los bordes.
11. **WebKit le daba caja a los desgloses cerrados** (por el `display`
    explícito de sus items) y quedaban tapados: se ocultan a mano.
12. Scroll horizontal con el texto al 200 % (badges y rutas de archivo),
    "Temperatura" desbordando a 320 px, el título "Santa Clara — Las
    Sirenas" cortado con puntos suspensivos, y el "0" pelado del score
    de playa que se leía como error (ahora dice "playa hoy").
13. **Jerarquía**: ocho tarjetas idénticas obligaban a comparar ocho
    números a mano. El mejor día lleva sello, en bloque sólido — el
    acento como texto chico no llega a AA (lo cazó Lighthouse).

## 12. Revamp: una sola respuesta por pantalla (2026-08-25)

Pedido de Tommy: *"revisa tus sources y haz un overview de todo para que
haga sentido… actualmente lo siento enredado, dale un buen revamp"*.

### Qué estaba enredado

La pantalla principal contestaba **dos veces la misma pregunta con
números distintos**: arriba las "3 mejores ventanas" (bloques de 2 h) y
abajo, dentro de cada día, otra vez "mejor momento del día: 8–10 am
(68/100)". Peor: un día con bandera **"No recomendado para salir"**
mostraba igual un "mejor momento" con buen puntaje debajo — en una app
de mar eso se lee como permiso.

Además contradecía un pedido explícito suyo de la ronda anterior: *"no
me des horas específicas, quiero info de todo el día"*.

### Qué se hizo

- **Fuera los bloques de horas de la pantalla principal.** Se eliminaron
  `bloquesCorredor` y `mejoresVentanas`. El detalle por hora sigue
  existiendo, pero donde corresponde: "Próximas horas" en la vista de
  cada punto.
- **Un veredicto arriba**: el mejor día salible de la semana, con su
  destino y sus condiciones. Es el **mismo objeto** que la tarjeta
  sellada abajo, así que es imposible que muestren números distintos
  (hay un E2E que lo verifica).
- **La forma del día en palabras, no en puntaje**: "está mejor
  temprano", "está mejor por la tarde", "mañana y tarde, igual de
  buenas". Se calcula con la misma vara (mitad contra mitad de la
  jornada) pero no saca un segundo número a la pantalla, y **no aparece
  en días con bandera de peligro**.
- **Una sola franja horaria en toda la app.** "La semana" de cada punto
  usaba 6 am – 6 pm mientras el inicio usaba 9 am – 4 pm: el mismo día
  daba dos cifras. Ahora todo sale de `calibracion.jornada`, y el
  subtítulo dice qué es cada número (viento y ola son máximos, el cielo
  es promedio — antes decía "máximos" a secas).
- Los días se nombran igual en todas partes (`nombreDia`: "hoy",
  "mañana", "jueves 27"); antes la vista de punto decía "Jue 27".

### La calibración: qué se movió de verdad

Los `hastaKt` de `calibracion.ts` eran **cajones** ("de 8 a 12 kt →
0.65") y la interpolación de la ronda 11 los leyó como **puntos de una
curva**, sin decirlo. Medido:

| viento | cajón (antes) | curva (ahora) | Δ sobre 45 pts |
|---|---|---|---|
| 5 kt | 1.000 | 1.000 | 0.0 |
| 8 kt | 0.900 | 0.900 | 0.0 |
| 8.1 kt | 0.650 | 0.894 | **+11.0** |
| 10 kt | 0.650 | 0.775 | +5.6 |
| 12 kt | 0.650 | 0.650 | 0.0 |
| 18.1 kt | 0.050 | 0.177 | +5.7 |
| 22 kt | 0.050 | 0.050 | 0.0 |

Desvío medio entre 0 y 25 kt: **+3.0 puntos**, siempre hacia arriba. O
sea: la app venía puntuando un poco más suelto que la calibración a
mano, y el comentario decía lo contrario.

Se resolvió **haciendo explícita la curva** en vez de esconderla:
`viento.tramos` → `viento.curva`, con campos `kt`/`frac` y un anclaje
en 0. Cada número que ajustó Tommy vale exactamente en su propio valor
(hay un test que recorre la curva y lo verifica anclaje por anclaje);
lo que cambia es solo el camino entre anclajes, y ahora está escrito.
Se mantuvo la curva y no los cajones porque el problema original es
real: con cajones, en el golfo casi todo el año cae en el mismo cajón y
el score deja de servir para comparar días.

Para compensar lo que la pesimismo de los cajones daba gratis, se
agregó una **raya dura de seguridad**: `seguridad.vientoPeligrosoKt`
(22 kt). A partir de ahí el día se marca peligro sin depender de
ninguna interpolación. Sale en el desglose como bandera ("no salir"),
no como puntos, para no falsear el total.

También se quitó el `Infinity` de las curvas (la última fila era un
salto seco) y se corrigió que la asignación de peligro por tormenta
**pisaba** un peligro ya marcado: un día de 25 kt con un chubasco corto
salía "sin peligro".

### Fuentes verificadas contra la API real (25-ago-2026)

`hourly_units` de Open-Meteo confirma lo que el código asume: viento en
`kn` (por `wind_speed_unit=kn`), ola y `sea_level_height_msl` en m,
período en s, lluvia en mm, CAPE en J/kg, nubosidad en %. Las dos APIs
devuelven 192 h (8 días) sin nulos para los 9 puntos. La marea de
Contadora oscila entre −1.63 y +2.87 m sobre el nivel medio, coherente
con el rango del golfo. Nada de lo que dicen los comentarios del código
está inventado.

### Lo demás de la revisión de código

`env(safe-area-inset-bottom)` se contaba dos veces (el aviso ya lo
incluye) y dejaba ~34 px muertos en iPhone con notch; el rango de viento
comparaba en nudos mientras mostraba en km/h; el rango del día mezclaba
el mínimo de un punto con el máximo de otro, así que "2–9 kt" podía no
darse en ningún punto real (ahora sale del corredor hora a hora, el peor
de salida y destino en cada hora); el `aria-label` del score de playa
colgaba de un `<span>` con los dos hijos en `aria-hidden` (ahora
`role="img"`); y un E2E decía "exactamente un sello" pero pasaba con
cero.

## 13. Auditoría de fuentes contra las APIs en vivo (2026-08-31)

Revisión de exactitud pedida así: *"revises tus sources… necesito que sea
MUY MUY acurate"*. Se midió todo contra Open-Meteo en vivo y contra el
archivo histórico de la temporada seca, no contra la intuición. Tres
hallazgos cambiaron código, dos cambiaron documentación, y una "mejora"
se probó y se **descartó**.

### 13.1 El clima se pedía sobre la celda de TIERRA (corregido)

Open-Meteo, por defecto, resuelve cada coordenada a la celda de **tierra**
más cercana. Sobre tierra el viento sale frenado por la rugosidad del
suelo, así que para una app de mar es el dato equivocado. Con
`cell_selection=sea`, medido el 31-ago-2026:

| punto | viento medio | máximo |
|---|---|---|
| Las Sirenas | 4.0 → 5.1 kt | 8.6 → **11.0 kt** (+28 %) |
| Coronado | 2.1 → 3.0 kt | 6.1 → **8.8 kt** (+44 %) |
| Islas Ocean Reef | 4.4 → 4.9 kt | 9.3 → 10.2 kt |
| Marina Ocean Reef | 4.9 → 4.9 kt | 8.8 → 10.2 kt |

Cambia la celda en 4 de los 9 puntos y **siempre hacia más viento**, o sea
hacia el lado seguro. Hay un test que falla si alguien borra el flag.

### 13.2 Medir el picado con el chop: probado y DESCARTADO

La idea sonaba bien: `wave_period` es el período del mar combinado, un
swell largo debería esconder el golpeteo corto del viento, así que habría
que medir el chop aparte con `wind_wave_*`. **Es falsa**, y llegó a estar
implementada antes de que los datos la tumbaran.

1. `wave_period` es media **ponderada por energía**: baja sola cuando el
   chop domina. Contadora, temporada seca, 1440 h — según la fracción de
   energía que aporta el chop: 0-10 % → 9.7 s · 25-50 % → 7.9 s ·
   50-75 % → 6.1 s · 75-100 % → **4.8 s**. Responde perfecto.
2. Cobraría dos veces el viento. El chop es casi función pura del viento
   local (0-5 kt → 0.04 m · 8-12 kt → 0.25 m · 15+ kt → 0.62 m) y
   **79-100 %** de las horas que castigaría ya tienen viento ≥12 kt, donde
   la curva ya quitó 16-27 puntos.
3. El "día trampa" (mar picado con el viento ya calmado) **no existe** en
   el Golfo: chop ≥0.4 m con viento <10 kt ocurrió **0 veces en 480 h**.
   Es una cuenca de fetch limitado; el mar de viento sube y baja con el
   viento y no queda picada vieja.

De paso: sin una reja de altura mínima, el cambio inventaba 16
penalizaciones de −15 pts en días de calma chicha, porque el modelo
devuelve chops de 0.02 m con período 0.1 s (ruido) y ese ratio cruza
cualquier umbral de steepness. Queda la nota larga en `score.ts` para que
nadie lo "arregle" de nuevo.

### 13.3 Los modelos se contradicen, y ahora se dice (nuevo)

Tercera request, opcional, solo viento, ~58 KB: ECMWF, GFS e ICON por
separado. El 1-sep-2026 el viento típico de jornada del corredor era
10.2 kt (ECMWF), 10.8 (GFS) y **5.8** (ICON): el mismo día valía 34 o 44
puntos de viento según a quién le creyeras.

El desacuerdo se mide **en puntos del score, no en nudos**, porque la
curva no es recta: 3 kt de diferencia no significan nada a 5 kt y lo
cambian todo a 13 kt. Umbral elegido midiendo — desacuerdos de la semana:
5.7 · 11.4 · 0.0 · 3.3 · 3.7 · 9.1 · 1.6 · 2.9. Con 8 se marcan 2 de 8
días; con 4 se marcarían 3 de 8 y el aviso se vuelve papel tapiz.
Verificado con datos reales en vivo: marca 2 de 7 días, y el día
recomendado **no** queda marcado (los tres modelos coinciden en él).

Si esa request falla, la app da el mismo pronóstico y solo pierde el
aviso. No se anota como falla visible: el multimodelo no es "el clima".

### 13.4 La forma del día se calla cuando el día es dudoso

Medido: con la vara real de la app (`UMBRAL_FORMA` = 6 puntos) los tres
modelos coinciden en la forma del día en **6 de 8 días**, y los 2 que
fallan son exactamente los 2 marcados como dudosos. Así que en un día
dudoso ya no se afirma "está mejor temprano": si no coinciden ni en cómo
viene el día entero, menos en qué mitad es mejor.

Se agregó también `enCurso`: con la jornada ya arrancada la forma del día
tampoco se muestra, porque a las 2 pm "está mejor temprano" habla de una
mañana que ya pasó. Antes se decía igual.

### 13.5 La marea: qué se verificó y hasta dónde

`tide.ts` afirmaba *"error típico validado: ~±30 min contra la tabla
armónica de Balboa"*. La frase decía de más, pero **no era inventada**:
sí existe el contraste del 9-ago-2026 (§1), contra la tabla de
tide-forecast.com — fuente **comercial, no oficial** — con rango 3.23 m
modelo vs 3.18 m tabla y ~30 min de desfase en **dos extremos de un
día**. Eso descarta que el modelo esté groseramente corrido; no alcanza
para llamarlo "error típico", que es lo que sugería la redacción.
Corregido en el comentario para que diga el alcance real.

Queda pendiente el contraste contra una fuente **oficial** panameña y
sobre más de un día: si CMEMS tuviera un sesgo sistemático de 20-30 min,
todo lo de abajo daría igual de bien. Ver `ACCURACY.md`.

Lo que sí se comprobó ahora (Contadora, 8 días):

- 30 extremos, 15 pleamares y 15 bajamares: semidiurna limpia.
- Pleamar→pleamar **12.48 h** contra 12.42 h teóricos de M2 (0.5 %).
- Ciclo sicigia→cuadratura correcto: el rango cae de 4.52 m a 2.70 m en
  seis días y vuelve a crecer.
- Rango de sicigia 4.5-4.7 m, del orden del de Balboa.

Período, fase y amplitud se comportan como una marea real del Golfo.
Sigue siendo modelo, y la etiqueta "estimada" no se quita.

### 13.6 Resolución real: 9 puntos NO son 9 pronósticos

Las celdas del modelo son de ~11 km y varios puntos caen en la misma.
Contadora, Chapera y Caracoles comparten celda **atmosférica** (viento y
cielo idénticos); Marina e Islas Ocean Reef comparten celda **marina**
(ola idéntica). De 9 puntos salen 7 celdas de clima y 6 de mar. Los 9
puntos existen porque son 9 destinos, no porque el modelo los distinga.
Documentado en `api.ts`. Los desvíos de la coordenada pedida a la celda
van de 0.6 km (Contadora) a 11.3 km (Islas Ocean Reef).

### 13.7 CAPE: bien calibrado, no se toca

`capeAltoJkg: 2500` dispara en 6.3 % de las horas (mediana de Panamá en
agosto: 1740 J/kg, p90 2360). Es el percentil ~93: justo lo que debe ser
un "atmósfera muy cargada".

### 13.8 Los tests no se typecheaban

`tsc` solo incluía `src`. Por eso un fixture al que le faltaba un campo de
`DatosApp` pasaba sin ruido, y el camino nuevo quedaba sin probar. Un
fixture que miente sobre la forma de los datos es peor que no tener test:
da confianza falsa. Se agregó `tsconfig.test.json` y `npm run typecheck`.

# DECISIONES — La Fourno

Decisiones tomadas en solitario durante la misión (2026-08-09), con el
porqué y las fuentes. Todo lo de aquí es ajustable después.

## 1. Mareas: modelo CMEMS vía Open-Meteo, SIEMPRE "estimado"

**Decisión**: la marea sale de `sea_level_height_msl` de la API marine
de Open-Meteo (modelo global de Copernicus/CMEMS), con los extremos
afinados por interpolación parabólica. El UI la marca **siempre** como
"estimada".

> ⚠️ **CORREGIDO el 1-sep-2026.** Lo de abajo dice que NOAA ya no
> publica Balboa. **Es falso**: la estación **9812501 "BALBOA, CANAL
> ZONE (PACIFIC)"** responde perfectamente y sirve predicciones
> armónicas en datum MSL para cualquier rango de fechas. Se usó para
> validar la marea con n=356 y para corregir un adelanto de 27 min que
> el modelo traía. Ver §14.4. La decisión de fondo NO cambia —el nivel
> se sigue tomando de CMEMS, porque NOAA solo cubre Balboa y no Las
> Perlas— pero la razón que se daba estaba equivocada.

**Por qué**:
- ~~NOAA CO-OPS ya no publica predicciones para Balboa~~ (ver la
  corrección de arriba: sí la publica). Lo cierto es que **no hay
  estación en Las Perlas**, que es a donde va, así que igual hace falta
  un modelo para el destino.
- No existe otra fuente armónica gratuita y confiable con API para el
  Golfo de Panamá; las tablas comerciales (tide-forecast, tides4fishing)
  no tienen API gratuita y su scraping es frágil.
- **Validación del 2026-08-09** contra tide-forecast.com (comercial):
  mismo ciclo semidiurno, rango casi idéntico (3.23 m modelo vs 3.18 m
  tabla) y **desfase ~30 min** en dos extremos de un día. Ese desfase
  resultó ser real y sistemático: n=356 contra NOAA lo confirmó en
  −27 min y ya está corregido (§14.4).
- Para decidir "¿salgo o no?" ese error es aceptable; para entrar a un
  bajo con la quilla justa NO — por eso el "estimado" es permanente y
  el aviso de seguridad manda a las fuentes oficiales.

**Nota técnica**: el nivel viene referido al nivel medio del mar (MSL),
no al datum de cartas (MLLW): se ven valores negativos en bajamar. Es
coherente para leer curva y tendencia, que es lo que la app necesita.

**Upgrade pagable**: WorldTides API (~$5/mes) daría extremos armónicos
por coordenada. Bajó de prioridad: para Balboa ya se tiene NOAA gratis,
y lo que falta es Las Perlas, donde no hay mareógrafo de nadie.

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

## 14. Misión de exactitud (2026-09-01)

Sesión larga dedicada a una sola cosa: que el score prediga bien la
realidad. Cero features salvo la verdad de campo. Regla de trabajo:
medir antes de implementar, y botar lo implementado si el dato no lo
respalda.

### 14.1 El pronóstico tiene skill, pero se acaba en el día 5

La medición del 31-ago decía que el error no crecía con el horizonte.
**Era falsa**: metía horas futuras dentro de la "verdad" y tenía n=240.
Rehecha con verdad ERA5 limpia, n≈600 por horizonte y dos baselines
tontos:

- El error **sí crece**: MAE 2.38 kt a 1 día → 3.48 a 7 (+46 %).
- Le gana a **persistencia** en 7/7 horizontes.
- Le gana a **climatología** en los días 1-5 (diferencia pareada
  concluyente a 2 EE), y **empata** en los días 6-7 (+0.049 ±0.081 y
  +0.146 ±0.085).

O sea: del día 6 en adelante no aporta nada sobre "así viene esta época
del año". Los días se siguen mostrando —fue un pedido explícito— pero la
app lo dice y deja de afirmar la forma del día. Perilla
`skillHorizonteDias: 5`.

Se verificó también que la "verdad" de previous-runs-api es
idénticamente ERA5 (MAE 0.00 kt sobre 1944 h): no era el modelo
comparándose consigo mismo, pero es un reanálisis, no una boya.

### 14.2 La calibración no necesita ser estacional

451 días de seca y 460 de lluviosa (ERA5 2021-2025). La seca es más
ventosa (10.7 vs 7.5 kt) y el score separa días en las dos (dispersión
36.5 vs 29.2). Límite del método, que hay que tener presente: el archivo
de ERA5 **no trae CAPE** y su weather_code nunca da tormenta, así que la
cifra de lluviosa es un piso.

### 14.3 Sombra de islas: medida y descartada

Contadora, Chapera y Caracoles caen en la misma celda marina y devuelven
el número idéntico. Entre celdas distintas, la razón de altura varía
0.068 según el cuadrante del viento. Y en seca el viento viene del N/NO
casi siempre. No hay señal direccional que usar: implementar una tabla
de exposición a mano sería inventar. Bloqueado por verdad de campo.

### 14.4 La marea venía adelantada 27 minutos

El hallazgo más concreto de la sesión. Se encontró la estación **9812501
de NOAA (Balboa, Pacífico)**, con predicciones armónicas oficiales en
datum MSL —el mismo de CMEMS— para cualquier rango y en dominio público.
Esto corrige de paso lo que el README venía diciendo: NOAA **sí** la
publica.

Contraste de n=2 a **n=356**: sesgo de **−27.0 min**, con los 356
extremos del mismo signo (−40.6 a −3.5). Se descartó que fuera
geografía comparando contra Puntarenas (−33.7), La Libertad (−33.3) y
Galápagos (−29.9, océano abierto a 1900 km): es fase del modelo CMEMS.
Los ~30 min sugieren una convención de etiquetado horario.

Corregido con `marea.desfaseModeloMin: 27` sobre los tiempos de la
serie, para que nivel, tendencia y extremos queden corridos igual. El
error típico del instante baja de **27.0 a 3.6 min**. Queda como test de
regresión permanente contra un fixture de 355 extremos oficiales.

El sesgo de NIVEL (~+0.5 m, con el rango comprimido ~0.27 m) **no** se
corrigió: parte es espacial y no se puede separar del datum sin más
estaciones. No afecta al score, que usa nivel relativo.

### 14.5 Perillas: una eliminada, tres declaradas críticas

Análisis de sensibilidad sobre **180 días reales** (90 de cada
temporada), moviendo cada perilla y midiendo si cambia el ranking o la
etiqueta que ve el usuario.

**Eliminado** el bono de "mar viejo": Δ0.03 pts, 0 de 25 semanas, 0 de
180 etiquetas. Estaba muerto porque pedía que el período MÍNIMO de la
jornada llegara a 12 s, y eso pasa 2 veces cada 90 días.

**El término de marea se queda**, con respaldo: quitarlo mueve 5.81 pts,
4 semanas y 52 etiquetas. Es el tercero que más pesa. Sus VALORES siguen
sin validar.

**Críticas y sin validar**: `pesoPico` (7/25 semanas), `rachaDeltaKt`
(6/25) y `marea.bajaExtremaFrac` (5/25, cambia el top-1). Quedan
marcadas en el código para que nadie las afine a ojo.

Hay una guardia permanente contra perillas muertas. Las rayas de
seguridad quedan fuera de ella a propósito: deben estar dormidas en días
buenos, y eso también se prueba.

### 14.6 Datos parciales: se acabó el número falso

`ResultadoScore` ahora trae `faltan[]` y `pesoFaltante`. Un día
incompleto ya no compite por el veredicto contra días completos —sin
dato de mar perdía 25 puntos de arranque y perdía siempre por una razón
que no era el clima— y sin viento o sin cielo no se muestra número: sale
"Sin dato" en gris, nunca en rojo.

### 14.7 Verdad de campo: la única forma de falsificar la calibración

Se construyó la tubería, que es lo que faltaba. Una fila en el home
—sin pantalla nueva, sin bitácora— y, sobre todo, **el archivo diario de
pronósticos**: sin él el registro no serviría, porque el pronóstico se
recalcula y el del sábado ya no existe cuando contesta el domingo.

Guardado en `fourno_registros` y `fourno_pronosticos` del Supabase
compartido, por RPC SECURITY DEFINER con token. localStorage manda; la
nube es respaldo, pero necesario: si los datos vivieran solo en el
teléfono, ninguna sesión futura podría leerlos para calibrar, que es el
punto entero.

Nota de seguridad: la primera versión del RPC comparaba el token contra
`current_setting(..., true)`, que devuelve NULL si no está seteado —y
`token <> NULL` es NULL, que en un IF de plpgsql no entra. O sea que sin
token configurado **dejaba pasar todo**. Se detectó antes de usarlo y se
reemplazó por una tabla de config cerrada con negación explícita.

El token viaja en el bundle: no es un secreto, es una molestia para el
que pase. Si aparece basura, se rota en `fourno_config` y en Vercel.

---

## 15. Del puntaje a la probabilidad (2026-09-01, ronda 11)

Un puntaje de 78 no le dice a nadie si sale o no. Una probabilidad sí,
**siempre que esté calibrada**. Toda esta ronda es eso: convertir el
score en un número que signifique lo que dice, y cerrar los dos huecos
de datos que quedaban declarados de la ronda anterior.

### 15.1 El ensemble no sirvió, y se dice

La idea obvia era sacar la probabilidad de la dispersión del ensemble
—51 miembros de ICON, la incertidumbre que el propio modelo declara—.
**No se puede.** La `ensemble-api` de Open-Meteo solo guarda ~4 días de
pasado: 101 horas contiguas, del 28-ago al 1-sep-2026. Sin histórico no
hay contra qué calibrar, y una probabilidad sin calibrar es exactamente
el número que parece preciso sin serlo.

Así que la probabilidad sale del backtest: 364 pares (pronosticado,
resultó) por horizonte, que sí existen porque `previous-runs-api` guarda
92 días.

### 15.2 La primera versión estaba mal, y el diagrama la tumbó

Versión 1: tomar la distribución de error MARGINAL del backtest y
preguntarle qué fracción de las veces el score real superaría 75.
Suena bien. El diagrama de confiabilidad —que es el test, no un
adorno— dijo que a 4 días el tramo alto prometía **89 %** y cumplía
**45 %**. Un desvío de 43.5 puntos.

El error del pronóstico **no es independiente del pronóstico**: los
puntajes altos regresan a la media más de lo que la distribución
marginal sugiere. La versión 2 condiciona: P(Excelente | score, lead)
contada sobre los vecinos históricos con puntaje parecido (±6, mínimo
25 vecinos, y si no alcanzan **se ensancha la ventana en vez de
inventar**). Error de calibración 6.1/9.0/9.1 → **4.0/4.2/4.0** pts.

El umbral "Excelente ≥75" no es una preferencia: con "Bueno ≥55" el
95 % de los días clasifica, y una probabilidad que dice 95 % siempre no
informa nada. Con 75, la tasa base es 46 %.

### 15.3 El sol se mide con radiación

`cloud_cover` tenía 19-26 % de MAE y pesaba casi tanto como el viento.
Se midió cuál de los seis candidatos predice mejor las horas de sol
reales (correlación de rangos, 90 días):

| | −1d | −3d | −7d |
|---|---|---|---|
| nubosidad | 0.555 | 0.349 | 0.100 |
| **radiación** | **0.689** | **0.491** | **0.231** |

A 7 días la radiación es 2.3× mejor. El insumo pasó a ser el **índice de
cielo despejado** (`shortwave_radiation / terrestrial_radiation`), que
es adimensional y no depende de la hora ni de la estación. Error del
score: 5.3/7.1/8.8 → **4.8/6.3/7.3**.

La curva nueva se eligió **para no mover la escala** (+2.1 pts de media
contra +9.2 de una curva "físicamente correcta"), y eso no cuesta
exactitud: la correlación de rangos es invariante a transformaciones
monótonas, así que cualquier curva creciente conserva la mejora del
predictor. La escala del score sí importa —hay umbrales calibrados con
él— y moverla habría invalidado la calibración de la 15.2.

### 15.4 La ola no tiene verdad, y ahora se sabe cuánto duele

Se buscó fuente independiente y **no existe**: cero boyas con oleaje en
el Pacífico panameño (NDBC tiene 3 en la región, todas en el Caribe y
sin dato de ola) y ninguna altimetría satelital abierta en ERDDAP.

Lo que sí se pudo medir: los cuatro modelos globales discrepan **0.30 m
de media** entre sí (p90 0.52, máximo 1.06) sobre olas que promedian
medio metro. El backtest reportaba 0.02 m a 1 día — porque comparaba el
modelo consigo mismo. **La incertidumbre real es ~15× la que decía la
ronda 10**, y eso corrige aquel número.

`best_match` sigue a **gwam** (|dif| 0.088 m), que es el atípico alto:
lee ~2× los otros tres. **No se cambió**, y es medido: la mediana de los
cuatro mueve el score **0.83 pts de 100**, muy por debajo del ruido
(MAE 4.8), y costaría una request más en un dato que ya pesa 15 %.
Cambiar la fuente por un efecto menor que el ruido es moverse sin
mejorar.

Se declara **en el UI, donde se muestra la ola**, no solo acá. Con un
E2E que falla si la nota desaparece: la primera vez el CSS quedó y el
JSX nunca llegó, y nada se enteró.

### 15.5 Los pasos entre islas: geometría sí, velocidad no

Verificado el 1-sep: cuatro puntos que abarcan 3.5 km a través del paso
Contadora–Chapera caen **todos en la misma celda** (8.625, −79.0416) y
devuelven idéntica corriente, con `best_match` y con
`meteofrance_currents`. A ~11 km de celda, un canal de 2 km no existe
para el modelo. No hay modelo de mayor resolución disponible.

Entonces no se inventan velocidades. Lo único honesto que la app puede
decir de los pasos —y lo dice— es **en qué horas la marea corre más
fuerte**, que sale de la curva validada a ±4 min por ciclo: el flujo es
proporcional a la velocidad de cambio del nivel, así que corre a media
marea, no en pleamar. La geometría vive en `src/config/pasos.ts` como
conocimiento local declarado, con un test que falla si alguien le
agrega un campo de velocidad.

### 15.6 El análisis de la verdad de campo existe ANTES que los datos

`npm run analizar-verdad`. Se probó con `--simular`, que avisa en su
propia salida que los datos son de mentira. La alternativa —escribirlo
el día que llegue el primer registro— es como se pierden los datos:
llegan, no hay con qué mirarlos, y para cuando hay herramienta ya nadie
se acuerda del contexto.

### 15.7 La app en red lenta

Nunca se había medido. Con caché, el primer dato aparece en **170 ms**.
El hallazgo: con un timeout único de 20 s, **cualquier** request colgada
dejaba la app 19.5 s en el esqueleto aunque el clima ya hubiera llegado
en 1 s, porque `Promise.allSettled` espera a todas. Ahora el timeout va
por criticidad —clima 20 s, mar 10 s, multimodelo 7 s— y el peor caso de
una request no esencial bajó a 7-10 s. Reproducible con
`npm run medir-red`.

### 15.8 Lo que NO se cambió, con números

- **Viento máximo (playa) vs típico (navegación)**: separa 2.18 pts y
  en 0 de 12 semanas cambia el día elegido. Se mantiene por claridad
  conceptual, no por efecto.
- **Fuente de oleaje**: la mediana de 4 modelos mueve 0.83 pts (ver
  15.4). Debajo del ruido.
- **Sesgo de viento contra ERA5**: no se corrige. La app puntúa la
  jornada, y una corrección global movería umbrales calibrados contra
  el criterio de Tommy, no contra ERA5.
- **Etiqueta "estimada" de la marea**: permanente, con test.

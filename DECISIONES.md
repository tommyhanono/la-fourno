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

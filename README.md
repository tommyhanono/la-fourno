# La Fourno ⚓

Mi app de mar: clima, marea y sol en **mis** puntos, y la respuesta a
"¿cuándo salgo esta semana?" para el corredor **Marina Ocean Reef
(Punta Pacífica) → Las Perlas**, calibrada a un Sunsation CCX 40.

Condiciones + recomendador. Nada más, a propósito.

## 🔗 Links

- **App (instálala como PWA):** https://la-fourno.vercel.app
- **Repo:** https://github.com/tommyhanono/la-fourno

## Qué hace

- **El veredicto**: arriba de todo, tu mejor día de la semana, con su
  destino y sus condiciones, y un desglose abrible que muestra los
  números ("viento 8 kt: +40 · despejado: +30 · …"). Es el mismo día
  que sale sellado en la lista: la app **nunca da dos respuestas**.
- **Día por día**: la semana completa, una tarjeta por día, evaluada
  sobre tu jornada de siempre (9 am – 4 pm) — **sin bloques de horas**.
  Cada día trae el **rango medido** de viento y ola ("2–9 kt"), cielo,
  lluvia, horas de sol con minutos, a qué hora entra la tormenta si la
  hay, **el mejor destino según el clima de ese día**, y si conviene
  temprano o por la tarde (en palabras, no en puntaje). Si todos los
  puntos quedan iguales, lo dice en vez de inventar un ganador.
- **Dice cuándo NO confiar en el número.** Si los tres modelos globales
  se contradicen lo suficiente como para cambiar la respuesta, lo avisa.
  Y del día 6 en adelante avisa que el pronóstico ya no le gana al
  promedio de la época — medido, no supuesto.
- **Pregunta cómo salió.** Una fila, dos toques, nunca insiste: sirve
  para poder calibrar el score contra la realidad en vez de contra el
  criterio. Y archiva cada día su propio pronóstico, salgas o no.
- **9 puntos precargados**: Marina Ocean Reef, Contadora, Chapera,
  Islas Ocean Reef, Pearl Island, Mogo Mogo, Caracoles + las playas
  Santa Clara (Las Sirenas) y Coronado con su "score de día de playa".
- **Por punto**: condiciones de ahora (viento, cielo, ola, marea con
  tendencia, temperatura, UV), curva de marea del día con pleamares y
  bajamares, amanecer/atardecer, timeline horaria deslizable y resumen
  semanal.
- Todo en hora de Panamá; unidades en nudos/pies/°C con toggle
  (persistido en el teléfono).

## Fuentes de datos (gratis, sin key)

| Dato | Fuente |
|---|---|
| Viento, ráfagas, nubes, lluvia, UV, CAPE, amanecer/atardecer | [Open-Meteo Forecast](https://open-meteo.com) |
| Oleaje (altura, período, dirección) | [Open-Meteo Marine](https://open-meteo.com) |
| **Marea** | Open-Meteo Marine `sea_level_height_msl` (modelo Copernicus/CMEMS) |

**La marea es SIEMPRE un estimado** y el UI lo dice: el nivel sale de un
modelo, no de un mareógrafo.

*(Corrección del 1-sep-2026: acá decía que NOAA ya no publicaba Balboa.
Sí la publica — estación **9812501**, predicciones armónicas en datum
MSL, dominio público. Es la que se usó para validar y corregir la
marea. Lo que no hay es un mareógrafo en Las Perlas.)*

Lo que está comprobado es que la serie se comporta como una marea
real del Golfo: 15 pleamares y 15 bajamares en 8 días, pleamar→pleamar
cada 12.48 h contra 12.42 h teóricos de la componente M2, y el ciclo de
sicigia a cuadratura en su sitio (el rango cae de 4.52 m a 2.70 m en
seis días y vuelve a crecer). Sirve para decidir el día, **no** para
entrar a un bajo con la quilla justa.

**Y venía adelantada media hora.** Contra las predicciones armónicas
oficiales de NOAA para Balboa (estación 9812501, datum MSL), sobre
**356 extremos** de junio a agosto de 2026, el modelo adelantaba los
extremos **27.0 min de media**, con los 356 del mismo signo. Se descartó
que fuera geografía: el mismo sesgo aparece en Puntarenas (−33.7 min),
Ecuador (−33.3) y Galápagos (−29.9, océano abierto a 1900 km). Está
corregido, y el error típico del instante de pleamar/bajamar bajó de
**27.0 a 3.6 min** (p90 10.5 min, peor caso de tres meses 23.5 min).

Lo que **no** está corregido es el nivel: el modelo lee ~0.5 m por
encima del MSL de NOAA y comprime el rango unos 0.27 m. Parte de eso es
espacial y no se puede separar del datum sin más estaciones. El score
usa nivel relativo, así que no lo afecta; los metros mostrados sí.

Sigue sirviendo para decidir el día, **no** para entrar a un bajo con la
quilla justa. Detalle en [DECISIONES.md](DECISIONES.md) §13-14 y
pendientes en [ACCURACY.md](ACCURACY.md).

Los datos se cachean 30 min en el teléfono; si la red falla, la app
muestra lo último que llegó y lo dice — la hora del dato siempre está
visible.

## Editar mis puntos

`src/config/puntos.ts` — nombre, coordenadas, tipo (`nav` o `playa`).
Comentado y con las fuentes de cada coordenada. "Caracoles" está
marcado como estimado (islotes NE de Contadora, sin nombre oficial en
cartas). `soloReferencia: true` = punto para mirar el clima que **no**
se propone como destino del día (así está Ocean Reef islas, que por
estar a minutos de la dársena siempre ganaría).

## Calibrar el recomendador

`src/config/calibracion.ts` — pesos (viento 45 / sol 30 / ola 15 /
marea 10), tramos de viento y ola para el CCX 40, penalizaciones de
seguridad (tormenta, mar corto, mar grueso). Todo comentado; edita,
guarda y listo.

Ahí también vive `jornada`: **a qué hora sales y vuelves** (9 am – 4 pm
por defecto) y `pesoPico`, que decide si el score del día mira lo
típico o el peor momento (0.5 = mezcla). Si cambias tu horario de
salida, cambia solo ese bloque.

## Instalar el PWA en iPhone

1. Abre https://la-fourno.vercel.app en **Safari**.
2. Botón compartir → **Añadir a pantalla de inicio**.
3. Ábrela desde el ícono: pantalla completa, y el shell funciona hasta
   sin señal (los datos se actualizan cuando vuelve la red).

## Desarrollo

```bash
npm install
npm run dev        # desarrollo
npm run build      # build a dist/
npm test           # unit (Vitest)
npm run test:e2e   # E2E (Playwright)
npm run lint       # oxlint
npm run typecheck  # tsc, incluyendo los tests

# ¿El pronóstico tiene skill o solo es consistente consigo mismo?
node scripts/medir-skill.mjs

# ¿La calibración sirve igual en seca que en lluviosa?
node scripts/medir-estaciones.mjs

# ¿La marea llega a tiempo? (contra NOAA, varias estaciones)
node scripts/medir-marea.mjs

# Auditoría de layout: solapamientos, desbordes y scroll horizontal en
# 6 escenarios (320 px, 375 px, desgloses abiertos, texto 130 % y 200 %,
# landscape). Necesita el preview levantado en ese puerto.
BASE=http://localhost:4173 node scripts/audita-layout.mjs

# Contraste WCAG AA de cada texto en las 4 vistas (lo que Lighthouse
# no ve, porque solo audita una URL y lo visible).
BASE=http://localhost:4173 node scripts/audita-contraste.mjs
```

Auditoría completa y resultados: [MEGA-RONDA.md](MEGA-RONDA.md).
Decisiones y supuestos: [DECISIONES.md](DECISIONES.md).

## Seguridad

La app es informativa y trabaja con pronósticos y estimados. **No
sustituye los avisos oficiales ni el juicio del capitán.** El aviso
está fijo en todas las pantallas y no se puede quitar, a propósito.

## Ideas futuras (fuera de alcance, a propósito)

- **Marea armónica por coordenada.** Ya no hace falta pagar WorldTides
  para Balboa: NOAA publica sus constantes gratis. Lo que faltaría es
  Las Perlas, donde no hay estación.
- Rosa de viento por hora, radar de lluvia, alertas push, tráfico AIS.
- Más corredores (p. ej. Ocean Reef → Taboga).

# La Fourno — CLAUDE.md

App de mar personal: clima, marea y sol en **los puntos de Tommy**, y la respuesta a "¿cuándo salgo esta semana?" para el corredor **Marina Ocean Reef (Punta Pacífica) → Las Perlas**, calibrada a un Sunsation **CCX 40**. Condiciones + recomendador. Nada más, a propósito.

## Stack

Vite + React + TypeScript. Sin backend. Deploy en **Vercel** → <https://la-fourno.vercel.app> (repo linkeado con `.vercel/`).

## Cómo se corre

- `npm run dev` · `npm run build` · `npm run preview`
- `npm test` (vitest) · `npm run test:e2e` (Playwright) · `npm run lint` (oxlint)
- `npm run typecheck` — **incluye los tests**. `tsc -b` solo mira `src`, así que
  un fixture con la forma equivocada pasaba sin ruido. Correr los dos.
- `npm run backtest` — mide cuánto se equivoca el pronóstico por horizonte y
  regenera `src/config/backtest.json`, que la app lee para mostrar el ±N.
- `npm run auditar-datos` — comprueba que las defensas del servidor de la
  verdad de campo siguen puestas. **Lista, no borra.**

## Antes de tocar el score o las fuentes de datos

Leer **`ACCURACY.md`**: qué tan cierto es lo que dice la app, qué ya se
verificó (para no repetirlo) y qué falta. Trae los números base y las
recetas para medir contra las APIs.

Ideas que ya se probaron y **se descartaron con datos** (no las
reimplementes sin leer la nota):

- Medir el mar picado con `wind_wave_*` en vez del período combinado.
  Suena obvio, empeora el score por dos vías. Nota en `score.ts`.
- Un factor de exposición por sombra de islas. Tres de los puntos de Las
  Perlas comparten celda y devuelven el número idéntico. Nota en
  `ACCURACY.md`.
- El bono de "mar viejo": eliminado el 1-sep-2026 tras medir 180 días
  reales sin un solo cambio de etiqueta.

Regla de la casa para esto: **medir primero, implementar después**, y botar
lo implementado si el dato no lo respalda.

## Dónde se configura

- `src/config/puntos.ts` — los puntos del mapa.
- `src/config/calibracion.ts` — la calibración del CCX 40 y los umbrales del recomendador.

Esos dos archivos son el producto: casi todo pedido de "cambiá el criterio" se resuelve ahí.

Tres perillas están marcadas **críticas y sin validar** (`pesoPico`,
`viento.rachaDeltaKt`, `marea.bajaExtremaFrac`): mueven el día ganador de
la semana y nadie las ha confrontado con la realidad todavía. No se
afinan a ojo — se esperan los registros de verdad de campo.

## Verdad de campo

La app pregunta, en una sola fila del home, cómo salió el viaje, y
archiva cada día su propio pronóstico. Va a `fourno_registros` y
`fourno_pronosticos` en el Supabase compartido (proyecto tres-leches),
por RPC con token. **Sin las variables de entorno la app funciona igual**:
guarda en el teléfono y no sincroniza.

Variables (`.env` local, y cargadas en Vercel):
`VITE_SUPABASE_URL` · `VITE_SUPABASE_ANON` · `VITE_FOURNO_TOKEN`.

## Verdad de campo: nadie escribe desde fuera de producción

Dos defensas, y la de arriba no alcanza sola:

1. **Cliente**: la app no sincroniza si el host es localhost.
2. **Servidor**: el RPC exige `p_origen` contra una lista en
   `fourno_config`. Sin origen válido, rechaza. Es la que vale, porque
   el token viaja en el bundle y no es secreto.

Ya pasó dos veces que pruebas locales escribieran en la tabla de
producción. Si vuelve a pasar, el problema está en el servidor, no en
parchear un test más.

## Gotchas

- **La marea se muestra SIEMPRE como "estimada"** (viene de CMEMS, no de una tabla oficial). No quitar esa etiqueta ni presentarla como dato oficial: es una decisión de producto, no un detalle de UI.
- npm correcto: `~/.local/node-v20.19.2-darwin-arm64/bin`.

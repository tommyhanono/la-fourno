# La Fourno — CLAUDE.md

App de mar personal: clima, marea y sol en **los puntos de Tommy**, y la respuesta a "¿cuándo salgo esta semana?" para el corredor **Marina Ocean Reef (Punta Pacífica) → Las Perlas**, calibrada a un Sunsation **CCX 40**. Condiciones + recomendador. Nada más, a propósito.

## Stack

Vite + React + TypeScript. Sin backend. Deploy en **Vercel** → <https://la-fourno.vercel.app> (repo linkeado con `.vercel/`).

## Cómo se corre

- `npm run dev` · `npm run build` · `npm run preview`
- `npm test` (vitest) · `npm run test:e2e` (Playwright) · `npm run lint` (oxlint)

## Dónde se configura

- `src/config/puntos.ts` — los puntos del mapa.
- `src/config/calibracion.ts` — la calibración del CCX 40 y los umbrales del recomendador.

Esos dos archivos son el producto: casi todo pedido de "cambiá el criterio" se resuelve ahí.

## Gotchas

- **La marea se muestra SIEMPRE como "estimada"** (viene de CMEMS, no de una tabla oficial). No quitar esa etiqueta ni presentarla como dato oficial: es una decisión de producto, no un detalle de UI.
- npm correcto: `~/.local/node-v20.19.2-darwin-arm64/bin`.

// Verifica las coordenadas de puntos.ts una a una contra OpenStreetMap
// (reverse geocoding Nominatim). Uso: node scripts/verifica-coordenadas.mjs
// Imprime qué hay en cada coordenada para revisar a ojo que calza.

import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../src/config/puntos.ts', import.meta.url), 'utf8')
const puntos = [...src.matchAll(
  /id: '([\w-]+)',\s+nombre: '([^']+)',[\s\S]*?lat: (-?[\d.]+),[^\n]*\s+lon: (-?[\d.]+)/g,
)].map((m) => ({ id: m[1], nombre: m[2], lat: +m[3], lon: +m[4] }))

if (puntos.length !== 9) {
  console.error(`ERROR: se esperaban 9 puntos, se leyeron ${puntos.length}`)
  process.exit(1)
}

for (const p of puntos) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${p.lat}&lon=${p.lon}&format=json&zoom=13&accept-language=es`
  const res = await fetch(url, { headers: { 'User-Agent': 'la-fourno-verify/1.0' } })
  const j = await res.json()
  console.log(`${p.id.padEnd(18)} ${p.lat}, ${p.lon}`)
  console.log(`  → ${j.display_name ?? j.error ?? 'sin resultado'}`)
  await new Promise((r) => setTimeout(r, 1100))
}

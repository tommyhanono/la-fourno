// ¿ACERTÓ EL SCORE? — el análisis que corre en cuanto haya registros.
//
// Hoy `fourno_registros` está en cero. Este script existe para que el
// día que llegue el primer dato haya algo que lo use, en vez de
// descubrir entonces que falta escribirlo.
//
// Responde tres preguntas, en orden de utilidad:
//   1. Cuando la app dijo "excelente", ¿lo fue?
//   2. ¿En qué se equivoca: es optimista o pesimista?
//   3. ¿Qué perilla habría acertado mejor? — con los INSUMOS crudos
//      archivados se puede volver a correr el score con otros valores
//      y comparar contra lo que él contestó.
//
// Uso:
//   node scripts/analizar-verdad.mjs                # datos reales
//   node scripts/analizar-verdad.mjs --simular 20   # 20 salidas de mentira
//
// Lo de --simular NO es para inventar conclusiones: es para probar que
// el análisis funciona antes de que existan datos. Lo dice en la salida.

import { readFileSync, existsSync } from 'node:fs'

function cargarEnv() {
  if (!existsSync('.env')) return
  for (const l of readFileSync('.env', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
cargarEnv()

const CURVA_VIENTO = [
  [0, 1.0], [5, 1.0], [8, 0.9], [12, 0.65],
  [15, 0.4], [18, 0.18], [22, 0.05], [25, 0],
]
const CURVA_SOL = [[0.15, 0.2], [0.4, 0.25], [0.55, 0.32], [0.65, 0.75], [0.7, 1.0]]
const CURVA_OLA = [[0, 1.0], [0.5, 1.0], [0.9, 0.7], [1.3, 0.35], [1.8, 0.1], [2.5, 0]]
const PESOS = { viento: 45, sol: 30, ola: 15 }

const ip = (c, x) => {
  if (x <= c[0][0]) return c[0][1]
  for (let i = 1; i < c.length; i++) {
    const [a, b] = c[i]
    if (x === a) return b
    if (x < a) { const [a0, b0] = c[i - 1]; return b0 + (b - b0) * ((x - a0) / (a - a0)) }
  }
  return c[c.length - 1][1]
}

/** Score con una entrada archivada y, opcionalmente, otro pesoPico. */
function recalcular(entrada, { pesoPico = null } = {}) {
  const e = { ...entrada }
  if (pesoPico != null && e.vientoMedio != null && e.vientoPico != null) {
    e.vientoKt = e.vientoMedio * (1 - pesoPico) + e.vientoPico * pesoPico
  }
  let s = 0
  if (e.vientoKt != null) s += PESOS.viento * ip(CURVA_VIENTO, e.vientoKt)
  if (e.indiceSol != null) s += PESOS.sol * ip(CURVA_SOL, e.indiceSol)
  if (e.olaM != null) s += PESOS.ola * ip(CURVA_OLA, e.olaM)
  return s
}

const av = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)

function simular(n) {
  const out = []
  for (let i = 0; i < n; i++) {
    const viento = 3 + Math.random() * 16
    const indice = 0.2 + Math.random() * 0.5
    const ola = 0.2 + Math.random() * 1.2
    // Los insumos crudos, como los archiva la app: media y pico por
    // separado, que es lo que permite recalcular con otro pesoPico.
    const entrada = {
      vientoKt: viento,
      vientoMedio: viento * 0.85,
      vientoPico: viento * 1.15,
      indiceSol: indice,
      olaM: ola,
      rachaKt: viento * 1.3,
    }
    const score = Math.round(recalcular(entrada) + 8)
    // "Realidad": el score verdadero con ruido, y la respuesta que daría
    // alguien comparándola con lo pronosticado.
    const real = score + (Math.random() - 0.45) * 16
    const resultado = real > score + 5 ? 'mejor' : real < score - 5 ? 'peor' : 'igual'
    out.push({ dia: `sim-${i}`, resultado, pronostico: { score, entrada } })
  }
  return out
}

async function traerReales() {
  const URL = process.env.VITE_SUPABASE_URL
  const ANON = process.env.VITE_SUPABASE_ANON
  if (!URL || !ANON) return null
  // Las tablas están cerradas por RLS a propósito: la anon key no las
  // lee. Para el análisis real hay que consultarlas con el MCP de
  // Supabase o desde el panel y pegar el JSON acá.
  return null
}

async function main() {
  const iSim = process.argv.indexOf('--simular')
  const simulado = iSim >= 0
  const registros = simulado
    ? simular(Number(process.argv[iSim + 1] ?? 20))
    : await traerReales()

  if (!registros) {
    console.log('No hay registros que analizar.\n')
    console.log('Las tablas están cerradas por RLS —a propósito—, así que este')
    console.log('script no las lee desde afuera. Para el análisis real:')
    console.log('  1. Traer las filas con el MCP de Supabase o el panel:')
    console.log('     select dia, resultado, viento_real_kt, pronostico')
    console.log('     from public.fourno_registros order by dia;')
    console.log('  2. Guardarlas en un .json y pasarlo por stdin.\n')
    console.log('Para comprobar que el análisis funciona sin datos reales:')
    console.log('  node scripts/analizar-verdad.mjs --simular 20')
    return
  }

  if (simulado) {
    console.log('⚠️  DATOS SIMULADOS. Esto NO dice nada sobre la app real:')
    console.log('    sirve para comprobar que el análisis corre y qué va a')
    console.log('    mostrar cuando existan registros de verdad.\n')
  }

  console.log(`registros: ${registros.length}\n`)

  // 1. ¿Acertó?
  const conPron = registros.filter((r) => r.pronostico?.score != null)
  const porResultado = { peor: 0, igual: 0, mejor: 0, 'no-sali': 0 }
  for (const r of registros) porResultado[r.resultado] = (porResultado[r.resultado] ?? 0) + 1
  console.log('1. CÓMO SALIÓ, comparado con lo que dijo la app')
  for (const [k, v] of Object.entries(porResultado)) {
    if (!v) continue
    console.log(`   ${k.padEnd(8)} ${String(v).padStart(3)}  (${((100 * v) / registros.length).toFixed(0)} %)`)
  }

  // 2. ¿Optimista o pesimista?
  const salidas = conPron.filter((r) => r.resultado !== 'no-sali')
  if (salidas.length >= 3) {
    const peor = salidas.filter((r) => r.resultado === 'peor').length
    const mejor = salidas.filter((r) => r.resultado === 'mejor').length
    console.log('\n2. ¿SE INCLINA PARA ALGÚN LADO?')
    console.log(`   salió peor de lo dicho: ${peor} · mejor: ${mejor}`)
    if (peor > mejor * 1.5) console.log('   → la app es OPTIMISTA: promete más de lo que entrega.')
    else if (mejor > peor * 1.5) console.log('   → la app es PESIMISTA: entrega más de lo que promete.')
    else console.log('   → sin inclinación clara.')
  }

  // 3. ¿Qué pesoPico habría acertado mejor?
  const conEntrada = salidas.filter((r) => r.pronostico?.entrada?.vientoMedio != null)
  console.log('\n3. ¿QUÉ PERILLA HABRÍA ACERTADO MEJOR? (pesoPico)')
  if (conEntrada.length < 10) {
    console.log(`   Hacen falta ~10 salidas con los insumos archivados; hay ${conEntrada.length}.`)
    console.log('   (Los registros viejos sin snapshot no sirven para esto.)')
  } else {
    // La métrica: qué tan bien SEPARA el score los días que salieron
    // mejor de los que salieron peor. Si una perilla captura lo que él
    // vivió, los días "mejor" deberían puntuar más alto que los "peor".
    // Cuanto más grande la separación, mejor la perilla.
    const mejores = conEntrada.filter((r) => r.resultado === 'mejor')
    const peores = conEntrada.filter((r) => r.resultado === 'peor')
    if (mejores.length < 3 || peores.length < 3) {
      console.log(`   Hacen falta al menos 3 de cada lado; hay ${mejores.length} "mejor" y ${peores.length} "peor".`)
    } else {
      let campeon = { pp: null, sep: -Infinity }
      for (const pp of [0, 0.25, 0.35, 0.5, 0.75, 1]) {
        const sc = (r) => recalcular(r.pronostico.entrada, { pesoPico: pp })
        const sep = av(mejores.map(sc)) - av(peores.map(sc))
        if (sep > campeon.sep) campeon = { pp, sep }
        console.log(`   pesoPico ${pp.toFixed(2)} → separa ${sep >= 0 ? '+' : ''}${sep.toFixed(2)} pts`)
      }
      console.log(`   → la que más separa: ${campeon.pp.toFixed(2)}`)
      console.log('   (mayor es mejor: el score debería puntuar más alto los días')
      console.log('    que salieron mejor. Con pocos datos esto es orientativo.)')
    }
  }

  console.log('\nCon ~15-20 salidas ya se puede mover una perilla con fundamento.')
}

main().catch((e) => {
  console.error('falló:', e.message)
  process.exit(1)
})

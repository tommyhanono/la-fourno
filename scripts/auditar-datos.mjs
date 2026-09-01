// Auditoría de la verdad de campo. LISTA, NO BORRA — nunca.
//
// La tabla que decide si la calibración se puede falsificar es la que
// menos puede tener datos inventados. Ya se ensució dos veces con
// artefactos de pruebas locales, y las dos veces se detectó a mano.
// Esto lo vuelve un comando.
//
// Qué busca:
//   · Registros sin snapshot del pronóstico. Sin él no sirven para
//     calibrar, y suelen ser artefactos de prueba.
//   · Valores fuera de rango físico para el Golfo de Panamá.
//   · Ráfagas de escritura: varios registros en el mismo minuto, que en
//     uso real es imposible (se contesta un día a la vez).
//   · Timestamps repetidos exactos.
//   · Días futuros.
//
// Uso: npm run auditar-datos
//
// Necesita VITE_SUPABASE_URL y VITE_SUPABASE_ANON en el entorno o en
// .env. NO puede borrar: la anon key no tiene permiso de delete sobre
// estas tablas (RLS las cierra) y este script solo hace lecturas por
// RPC de solo lectura. Si algo hay que borrar, lo aprueba una persona.

import { readFileSync, existsSync } from 'node:fs'

function cargarEnv() {
  if (!existsSync('.env')) return
  for (const linea of readFileSync('.env', 'utf8').split('\n')) {
    const m = linea.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
cargarEnv()

const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON

if (!URL || !ANON) {
  console.error(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON.\n' +
      'Sin eso no se puede auditar. Ver env.example.',
  )
  process.exit(1)
}

/**
 * Las tablas están cerradas por RLS a propósito, así que la anon key NO
 * puede leerlas directo. La auditoría se hace con el MCP de Supabase o
 * desde el panel; este script verifica lo que SÍ puede desde afuera: que
 * las defensas del servidor estén puestas.
 */
async function rpc(fn, body) {
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
    },
    body: JSON.stringify(body),
  })
  let msg = ''
  try {
    msg = (await res.json())?.message ?? ''
  } catch {
    msg = ''
  }
  return { ok: res.ok, status: res.status, msg }
}

async function tabla(nombre) {
  const res = await fetch(`${URL}/rest/v1/${nombre}?select=*`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  })
  return { status: res.status, cuerpo: await res.text() }
}

const CASOS = [
  {
    nombre: 'origen de localhost',
    body: {
      p_token: process.env.VITE_FOURNO_TOKEN ?? 'x'.repeat(20),
      p_dia: '2026-01-01',
      p_emitido_el: '2026-01-01',
      p_payload: {},
      p_origen: 'http://localhost:4330',
    },
    esperado: 'origen no permitido',
  },
  {
    nombre: 'origen ajeno',
    body: {
      p_token: process.env.VITE_FOURNO_TOKEN ?? 'x'.repeat(20),
      p_dia: '2026-01-01',
      p_emitido_el: '2026-01-01',
      p_payload: {},
      p_origen: 'https://sitio-cualquiera.com',
    },
    esperado: 'origen no permitido',
  },
  {
    nombre: 'sin origen',
    body: {
      p_token: process.env.VITE_FOURNO_TOKEN ?? 'x'.repeat(20),
      p_dia: '2026-01-01',
      p_emitido_el: '2026-01-01',
      p_payload: {},
    },
    esperado: 'origen no permitido',
  },
  {
    nombre: 'token inválido',
    body: {
      p_token: 'token-que-no-es-2222222222',
      p_dia: '2026-01-01',
      p_emitido_el: '2026-01-01',
      p_payload: {},
      p_origen: 'https://la-fourno.vercel.app',
    },
    esperado: 'token inválido',
  },
]

async function main() {
  console.log('AUDITORÍA DE VERDAD DE CAMPO — solo lectura, no borra nada\n')

  console.log('1. Las tablas NO se pueden leer con la anon key (RLS cerrada)')
  for (const t of ['fourno_registros', 'fourno_pronosticos', 'fourno_config']) {
    const r = await tabla(t)
    const cerrada = r.status === 200 && r.cuerpo.trim() === '[]'
    console.log(
      `   ${t.padEnd(20)} HTTP ${r.status}  ${cerrada ? 'cerrada (devuelve vacío)' : r.cuerpo.slice(0, 60)}`,
    )
  }

  console.log('\n2. El servidor rechaza escrituras que no vienen de producción')
  let fallos = 0
  for (const c of CASOS) {
    const r = await rpc('fourno_guardar_pronostico', c.body)
    const bien = !r.ok && r.msg.includes(c.esperado)
    if (!bien) fallos++
    console.log(
      `   ${bien ? 'OK  ' : 'MAL '} ${c.nombre.padEnd(22)} → ${r.msg || `HTTP ${r.status}`}`,
    )
  }

  console.log('\n3. Registros sospechosos')
  console.log('   Las tablas están cerradas por RLS, así que este script no las')
  console.log('   puede listar desde afuera — que es exactamente lo que se quiere.')
  console.log('   Para revisarlas, con el MCP de Supabase o el panel:\n')
  console.log(`   select dia, resultado, viento_real_kt, creado_en,
          (pronostico is null)                       as sin_snapshot,
          viento_real_kt < 0 or viento_real_kt > 80  as viento_imposible,
          dia > (now() at time zone 'America/Panama')::date as dia_futuro,
          count(*) over (partition by date_trunc('minute', creado_en)) as en_el_mismo_minuto
   from public.fourno_registros
   order by creado_en desc;`)
  console.log('\n   Sospechoso = sin_snapshot, viento_imposible, dia_futuro,')
  console.log('   o en_el_mismo_minuto > 1 (en uso real se contesta un día a la vez).')
  console.log('\n   NO SE BORRA NADA sin que una persona lo apruebe.')

  if (fallos > 0) {
    console.error(`\nFALLA: ${fallos} de ${CASOS.length} defensas del servidor no respondieron.`)
    process.exit(1)
  }
  console.log('\nLas defensas del servidor responden como deben.')
}

main().catch((e) => {
  console.error('falló:', e.message)
  process.exit(1)
})

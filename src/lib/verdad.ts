// VERDAD DE CAMPO — lo único que puede falsificar la calibración.
//
// Hasta ahora ningún número de calibracion.ts se había comparado nunca
// con cómo salió un viaje de verdad. Eso hacía la calibración
// INFALSIFICABLE: si estuviera mal, nada en el repo se enteraría.
//
// Dos piezas, y la segunda es la que de verdad importa:
//
//  1. El registro: "¿saliste el sábado? ¿estuvo peor, igual o mejor de
//     lo que decía?". Una fila en el home, nunca insiste.
//  2. EL ARCHIVO DE PRONÓSTICOS: la app guarda cada día lo que estaba
//     pronosticando, salga él o no. Sin esto el registro no sirve para
//     nada, porque el pronóstico se recalcula: para cuando contesta el
//     domingo, el pronóstico del sábado ya no existe en ningún lado.
//
// Guardado: localStorage manda (funciona sin señal, siempre). Supabase
// es un respaldo best-effort — pero necesario, porque si los datos
// viven solo en el teléfono, ninguna sesión futura puede leerlos para
// calibrar, que es el punto entero.

import { claveDia } from './time'
import { CALIBRACION } from '../config/calibracion'
import type { DiaJornada } from './ventanas'

export type Resultado = 'no-sali' | 'peor' | 'igual' | 'mejor'

export interface Registro {
  dia: string
  resultado: Resultado
  vientoRealKt?: number
  nota?: string
  /** Lo que la app pronosticaba para ese día, congelado. */
  pronostico?: ResumenPronostico
  creadoEn: string
  sincronizado: boolean
}

/** Lo mínimo para poder comparar después contra la realidad. */
export interface ResumenPronostico {
  dia: string
  emitidoEl: string
  score: number
  vientoMinKt: number | null
  vientoMaxKt: number | null
  olaMaxM: number | null
  nubosidadPct: number | null
  destino: string
  peligro: boolean
  anticipacionDias: number
  /** El desglose, para poder ver QUÉ término falló, no solo el total. */
  contribuciones: { clave: string; puntos: number }[]
}

const KEY_REGISTROS = 'lafourno:verdad:v1'
const KEY_ARCHIVO = 'lafourno:pronosticos:v1'
/** Cuántos días atrás se pregunta. Más viejo que esto ya no se acuerda. */
export const DIAS_ATRAS = 3
/** Cuánto archivo se guarda en el teléfono. */
const ARCHIVO_MAX_DIAS = 45

function leer<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v as T[]) : []
  } catch {
    return []
  }
}

function escribir<T>(key: string, v: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    // sin espacio: se pierde el respaldo local, no la sesión
  }
}

export const leerRegistros = (): Registro[] => leer<Registro>(KEY_REGISTROS)
export const leerArchivo = (): ResumenPronostico[] => leer<ResumenPronostico>(KEY_ARCHIVO)

// ---------------------------------------------------------------
// Archivo de pronósticos
// ---------------------------------------------------------------

/** Resume un día de la semana en lo que hará falta dentro de meses. */
export function resumir(d: DiaJornada, emitidoEl: string): ResumenPronostico {
  return {
    dia: d.clave,
    emitidoEl,
    score: d.score.total,
    vientoMinKt: d.rango.vientoMin,
    vientoMaxKt: d.rango.vientoMax,
    olaMaxM: d.rango.olaMax,
    nubosidadPct: d.entrada.nubosidadPct,
    destino: d.mejorDestino.id,
    peligro: d.score.peligro,
    anticipacionDias: d.anticipacionDias,
    contribuciones: d.score.contribuciones.map((c) => ({
      clave: c.clave,
      puntos: c.puntos,
    })),
  }
}

/**
 * Guarda el pronóstico de hoy para todos los días de la semana. Se
 * llama una vez por día: si ya hay archivo de hoy, no hace nada.
 * Devuelve lo que guardó nuevo (para sincronizar).
 */
export function archivarSemana(semana: DiaJornada[], ahora = new Date()): ResumenPronostico[] {
  if (semana.length === 0) return []
  const hoy = claveDia(ahora)
  const previo = leerArchivo()
  if (previo.some((p) => p.emitidoEl === hoy)) return []

  const nuevos = semana.map((d) => resumir(d, hoy))
  // Poda: el archivo vive en el teléfono, no puede crecer para siempre.
  const corte = claveDia(new Date(ahora.getTime() - ARCHIVO_MAX_DIAS * 86400_000))
  const juntos = [...previo, ...nuevos].filter((p) => p.dia >= corte)
  escribir(KEY_ARCHIVO, juntos)
  return nuevos
}

/**
 * El pronóstico que estaba vigente para un día: el más reciente emitido
 * ANTES o el mismo día. Es el que él vio cuando decidió salir; uno
 * emitido después ya sabría cómo salió la cosa.
 */
export function pronosticoDe(dia: string): ResumenPronostico | undefined {
  return leerArchivo()
    .filter((p) => p.dia === dia && p.emitidoEl <= dia)
    .sort((a, b) => b.emitidoEl.localeCompare(a.emitidoEl))[0]
}

// ---------------------------------------------------------------
// Registros
// ---------------------------------------------------------------

/**
 * Qué día toca preguntar, o null si no hay nada que preguntar.
 *
 * Solo días ya terminados: hoy entra únicamente si ya pasó la hora de
 * volver. Se pregunta por el más reciente sin contestar, y nunca más
 * atrás de DIAS_ATRAS — de un miércoles de hace una semana nadie se
 * acuerda, y una respuesta inventada es peor que ninguna.
 */
export function diaAPreguntar(ahora = new Date()): string | null {
  const contestados = new Set(leerRegistros().map((r) => r.dia))
  const finJornada = CALIBRACION.jornada.hastaHora
  for (let i = 0; i <= DIAS_ATRAS; i++) {
    const d = new Date(ahora.getTime() - i * 86400_000)
    const clave = claveDia(d)
    if (contestados.has(clave)) continue
    if (i === 0) {
      // Hoy solo si ya terminó la jornada.
      const horaPa = Number(
        new Date(ahora.getTime() - 5 * 3600_000).toISOString().slice(11, 13),
      )
      if (horaPa < finJornada) continue
    }
    return clave
  }
  return null
}

export function guardarRegistro(
  dia: string,
  resultado: Resultado,
  extra: { vientoRealKt?: number; nota?: string } = {},
): Registro {
  const r: Registro = {
    dia,
    resultado,
    ...(extra.vientoRealKt != null ? { vientoRealKt: extra.vientoRealKt } : {}),
    ...(extra.nota ? { nota: extra.nota.slice(0, 280) } : {}),
    // El snapshot se congela ACÁ. Después ya no se puede recuperar.
    ...(pronosticoDe(dia) ? { pronostico: pronosticoDe(dia) } : {}),
    creadoEn: new Date().toISOString(),
    sincronizado: false,
  }
  const todos = leerRegistros().filter((x) => x.dia !== dia)
  todos.push(r)
  escribir(KEY_REGISTROS, todos)
  void sincronizar()
  return r
}

// ---------------------------------------------------------------
// Sincronización (best-effort, nunca bloquea)
// ---------------------------------------------------------------

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const ANON = import.meta.env.VITE_SUPABASE_ANON as string | undefined
const TOKEN = import.meta.env.VITE_FOURNO_TOKEN as string | undefined

export const haySync = (): boolean => Boolean(URL && ANON && TOKEN)

async function rpc(fn: string, body: Record<string, unknown>): Promise<boolean> {
  if (!haySync()) return false
  try {
    const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON!,
        Authorization: `Bearer ${ANON!}`,
      },
      body: JSON.stringify({ p_token: TOKEN, ...body }),
      signal: AbortSignal.timeout(10_000),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Sube lo que falte. Se llama sola al guardar y al abrir la app; si no
 * hay señal, no pasa nada y se reintenta la próxima vez. Nunca lanza.
 */
export async function sincronizar(): Promise<void> {
  if (!haySync()) return
  const registros = leerRegistros()
  let cambio = false
  for (const r of registros) {
    if (r.sincronizado) continue
    const ok = await rpc('fourno_guardar_registro', {
      p_dia: r.dia,
      p_resultado: r.resultado,
      p_viento_real_kt: r.vientoRealKt ?? null,
      p_nota: r.nota ?? null,
      p_pronostico: r.pronostico ?? null,
    })
    if (ok) {
      r.sincronizado = true
      cambio = true
    }
  }
  if (cambio) escribir(KEY_REGISTROS, registros)
}

/** Sube el archivo de pronósticos recién generado. No bloquea nada. */
export async function subirArchivo(nuevos: ResumenPronostico[]): Promise<void> {
  if (!haySync() || nuevos.length === 0) return
  for (const p of nuevos) {
    await rpc('fourno_guardar_pronostico', {
      p_dia: p.dia,
      p_emitido_el: p.emitidoEl,
      p_payload: p,
    })
  }
}

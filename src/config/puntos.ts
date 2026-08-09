// ============================================================
// LA FOURNO — Puntos
// Edita aquí: nombre, coordenadas o tipo. La app se actualiza sola.
// Coordenadas en grados decimales (WGS84), verificadas contra
// OpenStreetMap / OurAirports el 2026-08-09. Ver DECISIONES.md.
// tipo 'nav'   → vista completa de navegación (viento, ola, marea…)
// tipo 'playa' → vista de playa (sol, lluvia, viento, UV, marea)
// ============================================================

export type TipoPunto = 'nav' | 'playa'

export interface Punto {
  id: string
  nombre: string
  descripcion: string
  lat: number
  lon: number
  tipo: TipoPunto
  /** true = es el punto de salida del corredor del recomendador */
  esSalida?: boolean
  /** true = destino de referencia del corredor del recomendador */
  esDestino?: boolean
  /** La geolocalización tiene ambigüedad declarada en DECISIONES.md */
  estimado?: boolean
}

export const PUNTOS: Punto[] = [
  {
    id: 'marina-ocean-reef',
    nombre: 'Marina Ocean Reef',
    descripcion: 'Punta Pacífica — mi punto de salida',
    // Dársena de la marina, entre las dos islas de Ocean Reef
    // (fuente: ShipChandler Panamá, 8°57'54.7"N 79°30'16.8"W)
    lat: 8.9652,
    lon: -79.5047,
    tipo: 'nav',
    esSalida: true,
  },
  {
    id: 'contadora',
    nombre: 'Contadora',
    descripcion: 'Las Perlas — destino de referencia',
    // Centro de la isla (OSM). Las playas de fondeo habituales están al N y NE.
    lat: 8.6269,
    lon: -79.037,
    tipo: 'nav',
    esDestino: true,
  },
  {
    id: 'chapera',
    nombre: 'Chapera',
    descripcion: 'Isla Chapera, al sur de Contadora',
    lat: 8.5895, // OSM
    lon: -79.0268,
    tipo: 'nav',
  },
  {
    id: 'ocean-reef-islas',
    nombre: 'Ocean Reef',
    descripcion: 'Zona de las islas Ocean Reef, Punta Pacífica',
    lat: 8.9688, // Islas Ocean Reef (OSM)
    lon: -79.5022,
    tipo: 'nav',
  },
  {
    id: 'pearl-island',
    nombre: 'Pearl Island',
    descripcion: 'Isla Pedro González — desarrollo Pearl Island',
    // Costa NE de Pedro González, junto al desarrollo y su aeropuerto
    // (Fernando Eleta, 8.4114 / -79.1111 según OurAirports).
    lat: 8.413,
    lon: -79.1,
    tipo: 'nav',
  },
  {
    id: 'mogo-mogo',
    nombre: 'Mogo Mogo',
    descripcion: 'Isla Mogo Mogo, junto a Chapera',
    lat: 8.5718, // OSM
    lon: -79.0247,
    tipo: 'nav',
  },
  {
    id: 'caracoles',
    nombre: 'Caracoles',
    descripcion: 'Islotes al NE de Contadora (hacia Bartolomé)',
    // Sin nombre oficial en cartas ni en OSM. Decisión declarada en
    // DECISIONES.md: islotes entre Contadora y Bartolomé. El pronóstico
    // usa el mismo grid que Contadora, así que el dato no cambia si
    // ajustas unos cientos de metros.
    lat: 8.635,
    lon: -79.031,
    tipo: 'nav',
    estimado: true,
  },
  {
    id: 'las-sirenas',
    nombre: 'Santa Clara — Las Sirenas',
    descripcion: 'Playa Las Sirenas, Santa Clara (Antón, Coclé)',
    lat: 8.3795, // Playa de Santa Clara, sector Las Sirenas (OSM)
    lon: -80.11,
    tipo: 'playa',
  },
  {
    id: 'coronado',
    nombre: 'Coronado',
    descripcion: 'Playa Coronado (Chame)',
    lat: 8.5294, // Playa Coronado oeste (OSM)
    lon: -79.8784,
    tipo: 'playa',
  },
]

export const puntoPorId = (id: string): Punto | undefined =>
  PUNTOS.find((p) => p.id === id)

export const PUNTO_SALIDA = PUNTOS.find((p) => p.esSalida)!
export const PUNTO_DESTINO = PUNTOS.find((p) => p.esDestino)!

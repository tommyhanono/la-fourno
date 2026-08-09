// Iconos de línea propios (SVG inline, currentColor). Trazos gruesos
// para leerse a pleno sol. Nada de emojis ni librerías.

import type { IconoCielo } from '../lib/wmo'

interface Props {
  nombre:
    | IconoCielo
    | 'viento'
    | 'ola'
    | 'marea-sube'
    | 'marea-baja'
    | 'amanecer'
    | 'atardecer'
    | 'uv'
    | 'gota'
    | 'alerta'
    | 'volver'
    | 'ajustes'
    | 'recargar'
    | 'ancla'
    | 'playa'
  size?: number
  className?: string
}

const trazos: Record<Props['nombre'], React.ReactNode> = {
  sol: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9L19 19M19 5l-2.1 2.1M7.1 16.9L5 19" />
    </>
  ),
  'sol-nube': (
    <>
      <circle cx="8" cy="8.5" r="3.2" />
      <path d="M8 2.8v1.9M2.8 8.5h1.9M4.3 4.8l1.4 1.4" />
      <path d="M8.5 18.5h8.7a3.3 3.3 0 0 0 .4-6.6 5 5 0 0 0-9.6 1.4 2.7 2.7 0 0 0 .5 5.2z" />
    </>
  ),
  nube: (
    <path d="M6.5 18h10.7a3.8 3.8 0 0 0 .5-7.6 5.7 5.7 0 0 0-11-1.6A3.4 3.4 0 0 0 6.5 18z" />
  ),
  niebla: (
    <path d="M4 9h16M2.5 13h19M5 17h14" />
  ),
  llovizna: (
    <>
      <path d="M6.5 14h10.7a3.8 3.8 0 0 0 .5-7.6 5.7 5.7 0 0 0-11-1.6A3.4 3.4 0 0 0 6.5 14z" />
      <path d="M8.5 17.5v.5M12 17.5v.5M15.5 17.5v.5M10.2 20.5v.5M13.8 20.5v.5" />
    </>
  ),
  lluvia: (
    <>
      <path d="M6.5 13h10.7a3.8 3.8 0 0 0 .5-7.6 5.7 5.7 0 0 0-11-1.6A3.4 3.4 0 0 0 6.5 13z" />
      <path d="M8.5 16.5l-1 3M12.5 16.5l-1 3M16.5 16.5l-1 3" />
    </>
  ),
  tormenta: (
    <>
      <path d="M6.5 12.5h10.7a3.8 3.8 0 0 0 .5-7.6 5.7 5.7 0 0 0-11-1.6 3.4 3.4 0 0 0-.2 9.2z" />
      <path d="M12.8 12.5l-3 4.5h4l-3 4.5" />
    </>
  ),
  viento: (
    <path d="M3 8.5h11a2.6 2.6 0 1 0-2.6-2.6M3 12.5h16.2a2.6 2.6 0 1 1-2.6 2.6M3 16.5h8a2.3 2.3 0 1 1-2.3 2.3" />
  ),
  ola: (
    <path d="M2.5 15.5c2.4 0 2.4-2.5 4.8-2.5s2.4 2.5 4.8 2.5 2.4-2.5 4.7-2.5 2.4 2.5 4.7 2.5M2.5 9.5C4.9 9.5 4.9 7 7.3 7s2.4 2.5 4.8 2.5S14.5 7 16.8 7s2.4 2.5 4.7 2.5" />
  ),
  'marea-sube': (
    <>
      <path d="M2.5 18.5c2.4 0 2.4-2.2 4.8-2.2s2.4 2.2 4.8 2.2 2.4-2.2 4.7-2.2 2.4 2.2 4.7 2.2" />
      <path d="M12 12.5V3.5M8.5 7L12 3.5 15.5 7" />
    </>
  ),
  'marea-baja': (
    <>
      <path d="M2.5 18.5c2.4 0 2.4-2.2 4.8-2.2s2.4 2.2 4.8 2.2 2.4-2.2 4.7-2.2 2.4 2.2 4.7 2.2" />
      <path d="M12 3.5v9M8.5 9l3.5 3.5L15.5 9" />
    </>
  ),
  amanecer: (
    <>
      <path d="M12 10V4.5M9 7l3-3 3 3" />
      <path d="M5.5 15.5a6.5 6.5 0 0 1 13 0" />
      <path d="M2.5 19h19" />
    </>
  ),
  atardecer: (
    <>
      <path d="M12 4.5V10M9 7.5l3 3 3-3" />
      <path d="M5.5 15.5a6.5 6.5 0 0 1 13 0" />
      <path d="M2.5 19h19" />
    </>
  ),
  uv: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </>
  ),
  gota: (
    <path d="M12 3.5s6 6.6 6 10.5a6 6 0 0 1-12 0c0-3.9 6-10.5 6-10.5z" />
  ),
  alerta: (
    <>
      <path d="M12 3L2.5 20h19L12 3z" />
      <path d="M12 9.5v5M12 17.2v.6" />
    </>
  ),
  volver: <path d="M15 4.5L7.5 12l7.5 7.5" />,
  ajustes: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="9" cy="7" r="1.8" fill="currentColor" />
      <circle cx="15" cy="12" r="1.8" fill="currentColor" />
      <circle cx="7" cy="17" r="1.8" fill="currentColor" />
    </>
  ),
  recargar: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 3.5v3.8h-3.8" />
    </>
  ),
  ancla: (
    <>
      <circle cx="12" cy="5" r="2.2" />
      <path d="M12 7.2V20M5 13.5a7 7 0 0 0 14 0M3.5 13.5H7M17 13.5h3.5" />
    </>
  ),
  playa: (
    <>
      <path d="M13.5 4.5a6.3 6.3 0 0 0-8 8" />
      <path d="M13.5 4.5l-8 8M13.5 4.5L17 20M5.5 12.5l4.6 1.2" />
      <path d="M2.5 20.5h19" />
    </>
  ),
}

export function Icono({ nombre, size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {trazos[nombre]}
    </svg>
  )
}

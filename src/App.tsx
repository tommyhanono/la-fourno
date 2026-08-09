import { useDatos, useUnidades, useRuta } from './state/hooks'
import { Home } from './views/Home'
import { PuntoVista } from './views/PuntoVista'
import { Ajustes } from './views/Ajustes'

export default function App() {
  const estado = useDatos()
  const [unidades, setUnidades] = useUnidades()
  const ruta = useRuta()

  const mPunto = ruta.match(/^#\/punto\/([\w-]+)/)
  if (mPunto) {
    return <PuntoVista id={mPunto[1]} estado={estado} unidades={unidades} />
  }
  if (ruta.startsWith('#/ajustes')) {
    return <Ajustes estado={estado} unidades={unidades} setUnidades={setUnidades} />
  }
  return <Home estado={estado} unidades={unidades} />
}

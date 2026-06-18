// REQ-POS-46, REQ-POS-54, REQ-POS-55: thin container/presentational
// seam between the views (PosView) and the store. `storeToRefs`
// keeps reactivity when the view destructures the refs. Mirrors the
// `useProductos` / `useEvents` precedent.
import { storeToRefs } from 'pinia'

import { useVentasStore } from '@/stores/ventas.store'

export function useVentas() {
  const store = useVentasStore()
  const refs = storeToRefs(store)

  return {
    carrito: refs.carrito,
    ventas: refs.ventas,
    cargando: refs.cargando,
    error: refs.error,
    toast: refs.toast,
    eventoEnCurso: refs.eventoEnCurso,
    totalCarrito: refs.totalCarrito,
    cantidadItems: refs.cantidadItems,
    agregarAlCarrito: store.agregarAlCarrito,
    actualizarCantidad: store.actualizarCantidad,
    quitarDelCarrito: store.quitarDelCarrito,
    vaciarCarrito: store.vaciarCarrito,
    cargarPorEvento: store.cargarPorEvento,
    registrarVenta: store.registrarVenta,
    descartarToast: store.descartarToast,
  }
}
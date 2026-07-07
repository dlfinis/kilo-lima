// REQ-POS-46, REQ-POS-54, REQ-POS-55: thin container/presentational
// seam between the views (PosView) and the store. `storeToRefs`
// keeps reactivity when the view destructures the refs. Mirrors the
// `useProductos` / `useEvents` precedent.
//
// pos-redesign (REQ-POS-58): `registrarVenta` signature now accepts an
// optional `montoRecibido`; `cargarPorEvento` is exposed for the
// PosView's parallel mount (was already returned). Surface stays
// backward compatible.
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
    corregirVenta: store.corregirVenta,
    descartarToast: store.descartarToast,
    // pos-redesign: typed error constants exposed for views that
    // need to render specific messages (e.g., MONTO_INSUFICIENTE in
    // RegistrarVentaDialog).
    CODIGO_MONTO_INSUFICIENTE: store.CODIGO_MONTO_INSUFICIENTE,
    CODIGO_CORRECCION_SIN_MOTIVO: store.CODIGO_CORRECCION_SIN_MOTIVO,
  }
}
// REQ-POS-46, REQ-POS-54: thin container/presentational seam between
// the views (ProductosView, RecetaDetalleView) and the store.
// `storeToRefs` keeps reactivity when the view destructures the refs.
import { storeToRefs } from 'pinia'

import { useProductosStore } from '@/stores/productos.store'

export function useProductos() {
  const store = useProductosStore()
  const { productos, cargando, error } = storeToRefs(store)

  return {
    productos,
    cargando,
    error,
    cargarTodas: store.cargarTodas,
    cargarPorId: store.cargarPorId,
    cargarPorReceta: store.cargarPorReceta,
    crear: store.crear,
    actualizar: store.actualizar,
    toggleDisponible: store.toggleDisponible,
    eliminar: store.eliminar,
  }
}
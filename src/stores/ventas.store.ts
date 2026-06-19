// REQ-POS-6, REQ-POS-7, REQ-POS-8, REQ-POS-9, REQ-POS-10, REQ-POS-11,
// REQ-POS-12, REQ-POS-13, REQ-POS-14, REQ-POS-15, REQ-POS-16,
// REQ-POS-17, REQ-POS-39, REQ-POS-44, REQ-POS-51, REQ-POS-55,
// REQ-FIN-28..32, REQ-FIN-31 (sale-time COGS snapshot):
//
// PR3 full implementation. PR1 shipped the cart helpers and the
// reactive refs; PR3 wires the optimistic `registrarVenta` action
// with revert-on-failure (REQ-POS-14) and the cross-store READ for
// `eventoEnCurso` (REQ-POS-51).
//
// PR-2b (REQ-FIN-31) extends:
//   - agregarAlCarrito(productoId, cantidad) — derives precio/costo/margen
//     from usePreciosEvento(productoId) and the catalogo + recetas stores.
//     All three values are FROZEN into the LineaCarrito (the cart no
//     longer takes a nombre or precioUnitario from the caller).
//   - registrarVenta — forwards the snapshotted costo_unitario +
//     margen_aplicado from each LineaCarrito into the venta_items
//     insert payload so the closure-time COGS aggregation is exact.
//
// `registrarVenta` flow:
//   1. Empty-cart guard → VENTA_SIN_ITEMS (REQ-POS-15, REQ-POS-17)
//   2. No evento en_curso → SIN_EVENTO_ACTIVO (REQ-POS-16)
//   3. Evento cerrado → EVENTO_CERRADO (REQ-POS-39)
//   4. Snapshot carrito → clear carrito → show success toast (optimistic)
//   5. Call servicio.registrarVenta()
//      - success: append venta, keep toast
//      - failure: restore carrito, swap toast to error
//
// // TODO(offline-sync): persistence for carrito — v1 is online-only
// per REQ-POS-6 / REQ-POS-14. Offline-sync slice will add WAL
// persistence. The cart lives in Pinia memory only.
import { computed, inject, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  Evento,
  LineaCarrito,
  MetodoPago,
  ServiceError,
  VentaConItems,
} from '@/types'
import { estadoEsEditable } from '@/utils/estado'
import { crearVentasService, type VentasService } from '@/services/ventas.service'
import { usePreciosEvento } from '@/composables/usePreciosEvento'
import { useEventoProductosStore } from './eventoProductos.store'
import { useEventsStore } from './events.store'
import { useProductosStore } from './productos.store'
import { useRecipesStore } from './recipes.store'

const LIMITE_CANTIDAD_MAX = 99
const MENSAJE_ERROR_CARGA = 'Error al cargar las ventas'

const CODIGO_SIN_EVENTO: ServiceError = {
  code: 'SIN_EVENTO_ACTIVO',
  message: 'No hay un evento en curso',
}
const CODIGO_EVENTO_CERRADO: ServiceError = {
  code: 'EVENTO_CERRADO',
  message: 'El evento está cerrado',
}
const CODIGO_VENTA_SIN_ITEMS: ServiceError = {
  code: 'VENTA_SIN_ITEMS',
  message: 'El carrito está vacío',
}

export type ToastVenta =
  | { tipo: 'success'; mensaje: string }
  | { tipo: 'error'; mensaje: string }
  | null

function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export const useVentasStore = defineStore('ventas', () => {
  const supabaseInyectado = inject<SupabaseClient<Database>>('supabase')
  if (!supabaseInyectado) {
    throw new Error('Supabase client no inyectado — ¿servicesPlugin instalado?')
  }
  const supabase: SupabaseClient<Database> = supabaseInyectado
  const servicio: VentasService = crearVentasService(supabase)

  const ventas = ref<VentaConItems[]>([])
  const carrito = ref<LineaCarrito[]>([])
  const cargando = ref<boolean>(false)
  const error = ref<string | null>(null)
  const toast = ref<ToastVenta>(null)

  // REQ-POS-51: cross-store READ inside computed. WRITES are
  // forbidden — ventas.store.registrarVenta never mutates
  // eventsStore. The active evento is the first one in `en_curso`.
  const eventsStore = useEventsStore()
  const eventoEnCurso = computed<Evento | null>(
    () => eventsStore.eventos.find((e) => e.estado === 'en_curso') ?? null,
  )

  // REQ-FIN-31 (PR-2b): cross-store READS for the COGS snapshot.
  // The store never WRITES to any of these. The active evento id feeds
  // usePreciosEvento which joins evento_productos + productos +
  // recetas to surface precio_final + costo_unitario per producto.
  const productosStore = useProductosStore()
  const recipesStore = useRecipesStore()
  // epStore is referenced only to keep the import live (no member
  // access needed here — usePreciosEvento already touches it).
  void useEventoProductosStore()
  const eventoIdRef = computed(() => eventoEnCurso.value?.id ?? null)
  const { productosDelEvento, precioParaProducto, margenParaProducto } =
    usePreciosEvento(eventoIdRef)

  // REQ-FIN-31: snapshot a new cart line. The store derives nombre +
  // precio + costo + margen from the catalogo + recetas + evento_producto
  // via usePreciosEvento. If the producto is unknown the line is
  // silently skipped (no orphan cart lines).
  function snapshotLinea(productoId: string, cantidad: number): LineaCarrito | null {
    if (cantidad <= 0) return null
    const producto = productosStore.productos.find((p) => p.id === productoId)
    if (!producto) return null
    const receta = recipesStore.recetas.find((r) => r.id === producto.receta_id)
    const nombre = receta?.nombre ?? 'Receta'
    const precio_unitario = precioParaProducto.value(productoId)
    const margen_aplicado = margenParaProducto.value(productoId)
    const ep = productosDelEvento.value.find((e) => e.producto_id === productoId)
    const costo_unitario = ep?.costo_unitario ?? 0
    return {
      producto_id: productoId,
      nombre,
      precio_unitario,
      cantidad,
      subtotal: redondear2(cantidad * precio_unitario),
      costo_unitario,
      margen_aplicado,
    }
  }

  function agregarAlCarrito(productoId: string, cantidad: number): void {
    const existente = carrito.value.find((l) => l.producto_id === productoId)
    if (existente) {
      if (existente.cantidad >= LIMITE_CANTIDAD_MAX) return
      const nuevaCantidad = Math.min(existente.cantidad + cantidad, LIMITE_CANTIDAD_MAX)
      existente.cantidad = nuevaCantidad
      // Subtotal uses the snapshotted precio_unitario — never re-reads
      // the catalogo or usePreciosEvento on subsequent adds.
      existente.subtotal = redondear2(nuevaCantidad * existente.precio_unitario)
      return
    }
    const linea = snapshotLinea(productoId, cantidad)
    if (!linea) return
    carrito.value = [...carrito.value, linea]
  }

  function actualizarCantidad(productoId: string, cantidad: number): void {
    if (cantidad < 0) return
    if (cantidad === 0) {
      quitarDelCarrito(productoId)
      return
    }
    const linea = carrito.value.find((l) => l.producto_id === productoId)
    if (!linea) return
    const capped = Math.min(cantidad, LIMITE_CANTIDAD_MAX)
    linea.cantidad = capped
    linea.subtotal = redondear2(capped * linea.precio_unitario)
  }

  function quitarDelCarrito(productoId: string): void {
    carrito.value = carrito.value.filter((l) => l.producto_id !== productoId)
  }

  function vaciarCarrito(): void {
    carrito.value = []
  }

  const totalCarrito = computed<number>(() =>
    redondear2(carrito.value.reduce((acc, l) => acc + l.subtotal, 0)),
  )
  const cantidadItems = computed<number>(() =>
    carrito.value.reduce((acc, l) => acc + l.cantidad, 0),
  )

  async function cargarPorEvento(eventoId: string): Promise<void> {
    cargando.value = true
    error.value = null
    const res = await servicio.listarPorEvento(eventoId)
    cargando.value = false
    if (res.error) {
      error.value = MENSAJE_ERROR_CARGA
      ventas.value = []
      return
    }
    ventas.value = res.data ?? []
  }

  function descartarToast(): void {
    toast.value = null
  }

  async function registrarVenta(
    metodoPago: MetodoPago,
  ): Promise<{ data: VentaConItems | null; error: ServiceError | null }> {
    // 1) Empty-cart guard (REQ-POS-15, REQ-POS-17).
    if (carrito.value.length === 0) {
      const err = CODIGO_VENTA_SIN_ITEMS
      toast.value = { tipo: 'error', mensaje: err.message }
      return { data: null, error: err }
    }
    // 2) No active evento (REQ-POS-16). When a non-editable evento
    // exists, surface EVENTO_CERRADO instead — it's the more actionable
    // message ("this evento is frozen") than "no active evento".
    const evento = eventoEnCurso.value
    if (!evento) {
      const hayCerrado = eventsStore.eventos.some((e) => e.estado === 'cerrado')
      if (hayCerrado) {
        toast.value = { tipo: 'error', mensaje: CODIGO_EVENTO_CERRADO.message }
        return { data: null, error: CODIGO_EVENTO_CERRADO }
      }
      toast.value = { tipo: 'error', mensaje: CODIGO_SIN_EVENTO.message }
      return { data: null, error: CODIGO_SIN_EVENTO }
    }
    // 3) Frozen evento (REQ-POS-39).
    if (!estadoEsEditable(evento.estado)) {
      toast.value = { tipo: 'error', mensaje: CODIGO_EVENTO_CERRADO.message }
      return { data: null, error: CODIGO_EVENTO_CERRADO }
    }

    // 4) Snapshot carrito + clear immediately (REQ-POS-14 optimistic).
    const snapshot = carrito.value.map((l) => ({ ...l }))
    const total = totalCarrito.value
    carrito.value = []
    toast.value = {
      tipo: 'success',
      mensaje: `🎉 Venta registrada: $${total.toFixed(2)}`,
    }

    // 5) Call service. On failure: restore snapshot + swap toast.
    // REQ-FIN-31: forward the snapshotted COGS columns so the
    // cierre-time aggregation never depends on receta cost changes.
    const res = await servicio.registrarVenta({
      evento_id: evento.id,
      metodo_pago: metodoPago,
      total,
      items: snapshot.map((l) => ({
        producto_id: l.producto_id,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
        subtotal: l.subtotal,
        costo_unitario: l.costo_unitario,
        margen_aplicado: l.margen_aplicado,
      })),
    })
    if (res.error || !res.data) {
      carrito.value = snapshot
      toast.value = {
        tipo: 'error',
        mensaje: '❌ Error al registrar venta — revisá tu conexión',
      }
      return { data: null, error: res.error }
    }
    ventas.value = [res.data, ...ventas.value]
    return { data: res.data, error: null }
  }

  return {
    ventas,
    carrito,
    cargando,
    error,
    toast,
    eventoEnCurso,
    totalCarrito,
    cantidadItems,
    agregarAlCarrito,
    actualizarCantidad,
    quitarDelCarrito,
    vaciarCarrito,
    cargarPorEvento,
    registrarVenta,
    descartarToast,
    CODIGO_SIN_EVENTO,
    CODIGO_EVENTO_CERRADO,
    CODIGO_VENTA_SIN_ITEMS,
  }
})
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
  VentaItem,
  VentaItemInput,
} from '@/types'
import { estadoEsEditable } from '@/utils/estado'
import { calcularCambio } from '@/utils/cambio'
import { crearVentasService, type VentasService } from '@/services/ventas.service'
import { createTraceId, logTrace, logError, logInfo } from '@/utils/logger'
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
// pos-redesign (REQ-POS-CAMBIO-4): the dialog emits `montoRecibido`
// when metodo_pago === 'efectivo'. If it's below the total the store
// rejects with this typed error before any optimistic UI fires — the
// cart is untouched so the operator can correct the input and retry.
const CODIGO_MONTO_INSUFICIENTE: ServiceError = {
  code: 'MONTO_INSUFICIENTE',
  message: 'El monto recibido es menor que el total',
}
// REQ-POS-CORRECCION-3: motivo is the human-readable audit invariant.
// Service-level guard also enforces it (defense in depth).
const CODIGO_CORRECCION_SIN_MOTIVO: ServiceError = {
  code: 'CORRECCION_SIN_MOTIVO',
  message: 'Una corrección debe tener un motivo registrado',
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
  // Track which evento the ventas array belongs to. The history
  // dialog labels its rows with the active evento's name, so a
  // mismatched cache would mislead the operator (review finding #6).
  // When `ventasEventoId` differs from the evento we're loading, the
  // cached rows are stale and must be discarded before the new load
  // settles — even on failure — to avoid rendering one evento's
  // sales under another evento's name.
  const ventasEventoId = ref<string | null>(null)
  const carrito = ref<LineaCarrito[]>([])
  // mobile-ux-redesign Phase 3: payment method state for the simplified
  // POS flow. Persisted until the cart is cleared or explicitly reset.
  const paymentMethod = ref<string | null>(null)
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
      // Link back to the pricing config active at sale time so the
      // cierre backfill (REQ-FIN-9) can match venta_items to their
      // evento_productos row. Null when the producto has no config.
      evento_producto_id: ep?.id ?? null,
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
    // mobile-ux-redesign Phase 3: reset payment method when the
    // cart is emptied so the operator must re-select for the next sale.
    paymentMethod.value = null
  }

  // mobile-ux-redesign Phase 3: payment method state for simplified POS flow.
  function setPaymentMethod(method: string): void {
    paymentMethod.value = method
  }

  function clearPaymentMethod(): void {
    paymentMethod.value = null
  }

  const totalCarrito = computed<number>(() =>
    redondear2(carrito.value.reduce((acc, l) => acc + l.subtotal, 0)),
  )
  const cantidadItems = computed<number>(() =>
    carrito.value.reduce((acc, l) => acc + l.cantidad, 0),
  )

  async function cargarPorEvento(eventoId: string): Promise<void> {
    // Review finding #6: stale-cache safety. If the operator switched
    // the active evento, the cached ventas belong to the PREVIOUS
    // evento. Showing them under the new evento's name in the history
    // dialog would be a UX bug. Clear the cache immediately when the
    // requested evento doesn't match what we last loaded for.
    if (ventasEventoId.value !== null && ventasEventoId.value !== eventoId) {
      ventas.value = []
      ventasEventoId.value = null
      error.value = null
    }
    cargando.value = true
    error.value = null
    const traceId = createTraceId()
    logTrace('cargarPorEvento', 'load-start', { eventoId, traceId })
    logInfo('cargarPorEvento', 'loading ventas', { eventoId })
    const res = await servicio.listarPorEvento(eventoId)
    cargando.value = false
    if (res.error) {
      // Issue #6: minimum observability for history-load failures.
      // The dialog surfaces the user-facing banner; the log line
      // preserves the underlying Supabase error code so a future
      // log aggregator can group by code/scope.
      logError('cargarPorEvento', 'failed to load ventas', {
        eventoId,
        cachedEventoId: ventasEventoId.value,
        errorCode: res.error.code,
        errorMessage: res.error.message,
      })
      // Review finding #5: do NOT clear the ventas array on error
      // when the failing load targets the SAME evento — the operator
      // already saw those rows and clearing would render the
      // misleading "Aún no hay ventas" empty state instead of the
      // real error.
      // Review finding #6 (combined): if the failing load targets a
      // DIFFERENT evento (caller switched and the new load failed),
      // we already cleared the stale cache at function entry. Setting
      // ventasEventoId = null here guarantees the next successful
      // load (any evento) writes its own tag and the dialog never
      // shows another evento's data.
      if (ventasEventoId.value !== eventoId) {
        ventas.value = []
        ventasEventoId.value = null
      }
      error.value = MENSAJE_ERROR_CARGA
      return
    }
    ventas.value = res.data ?? []
    ventasEventoId.value = eventoId
    logTrace('cargarPorEvento', 'load-done', {
      eventoId,
      traceId,
      count: ventas.value.length,
    })
    logInfo('cargarPorEvento', 'ventas loaded', {
      eventoId,
      count: ventas.value.length,
    })
  }

  function descartarToast(): void {
    toast.value = null
  }

  async function registrarVenta(
    metodoPago: MetodoPago,
    // pos-redesign (REQ-POS-CAMBIO-4): optional montoRecibido from the
    // dialog when metodo_pago === 'efectivo'. Ignored (null stored) for
    // other metodos.
    montoRecibido?: number | null,
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

    // pos-redesign (REQ-POS-CAMBIO-4): validate EFECTIVO payment
    // BEFORE the optimistic clear so a short payment never blows away
    // the cart. The dialog always supplies `montoRecibido` when
    // metodo_pago === 'efectivo'; if the caller did NOT pass it
    // (legacy path / direct store call without dialog), we treat the
    // validation as "not requested" — the previous behavior — so this
    // store remains backward compatible with the PR-2b tests.
    const totalPrev = totalCarrito.value
    if (metodoPago === 'efectivo' && montoRecibido !== undefined && montoRecibido !== null) {
      if (montoRecibido < totalPrev) {
        toast.value = {
          tipo: 'error',
          mensaje: CODIGO_MONTO_INSUFICIENTE.message,
        }
        return { data: null, error: CODIGO_MONTO_INSUFICIENTE }
      }
    }

    // 4) Snapshot carrito + clear immediately (REQ-POS-14 optimistic).
    const snapshot = carrito.value.map((l) => ({ ...l }))
    const total = totalPrev
    carrito.value = []
    toast.value = {
      tipo: 'success',
      mensaje: `🎉 Venta registrada: $${total.toFixed(2)}`,
    }

    // pos-redesign (REQ-POS-CAMBIO-2, REQ-POS-CAMBIO-5): derive cambio
    // for efectivo via the pure util; null for non-efectivo. Receipt
    // numbering is generated per AD1 (COUNT(*) + 1) — every sale
    // (regardless of metodo) gets a comprobante_numero so the dialog
    // can render for non-efectivo too.
    const cambio = metodoPago === 'efectivo' ? calcularCambio(total, montoRecibido ?? null) : null
    const comprobanteNumero = await servicio.generarComprobanteNumero(evento.id)

    // 5) Call service. On failure: restore snapshot + swap toast.
    // REQ-FIN-31: forward the snapshotted COGS columns so the
    // cierre-time aggregation never depends on receta cost changes.
    const res = await servicio.registrarVenta({
      evento_id: evento.id,
      metodo_pago: metodoPago,
      total,
      monto_recibido: metodoPago === 'efectivo' ? (montoRecibido ?? null) : null,
      cambio,
      comprobante_numero: comprobanteNumero,
      items: snapshot.map((l) => ({
        producto_id: l.producto_id,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
        subtotal: l.subtotal,
        costo_unitario: l.costo_unitario,
        margen_aplicado: l.margen_aplicado,
        evento_producto_id: l.evento_producto_id,
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

  // REQ-POS-CORRECCION-1..3: edit a previously-registered sale with
  // a durable audit trail. The store is the UX gate (early rejects
  // + toasts); the database RPC is the source of truth for atomicity
  // and the evento-state guard.
  //
  // v2 changes (post-review):
  //   - All items / header / audit writes happen inside a single
  //     `public.corregir_venta` RPC transaction. The previous v1
  //     flow did 4 non-transactional calls and could leave the live
  //     data, the audit row, and the items array inconsistent on
  //     partial failure (review finding #1).
  //   - The closed-evento guard is now backend-enforced — the RPC
  //     reads the live evento state and refuses the correction
  //     even if a direct client bypasses the store (#2).
  //   - The audit log is append-only at the schema level — the new
  //     migration drops the FOR ALL policy and replaces it with
  //     narrow SELECT + INSERT, so UPDATE/DELETE attempts are
  //     denied by RLS (#3).
  //   - MONTO_INSUFICIENTE is validated client-side (fast feedback
  //     for the operator) AND server-side (defense in depth).
  //     monto_recibido / cambio are normalized to null for
  //     non-efectivo methods so stale values from a previous
  //     effective payment don't leak into the new record (#4).
  async function corregirVenta(input: {
    venta: VentaConItems
    nuevoTotal: number
    nuevoMetodoPago: MetodoPago
    nuevoMontoRecibido: number | null
    nuevosItems: VentaItemInput[]
    motivo: string
  }): Promise<{ data: VentaConItems | null; error: ServiceError | null }> {
    // 1) Policy: motivo is required (REQ-POS-CORRECCION-3).
    if (!input.motivo || input.motivo.trim().length === 0) {
      return { data: null, error: CODIGO_CORRECCION_SIN_MOTIVO }
    }
    // 2) Policy: evento must be editable (REQ-POS-CORRECCION-2).
    // Defense-in-depth: the RPC also enforces this server-side, but
    // we check here so the operator gets the error before the
    // wire round-trip. Look up the venta's own evento by id (not
    // the active evento) so the guard is independent of which
    // evento the operator is currently viewing — the sale itself
    // must belong to an editable evento. If the events store
    // doesn't know the evento (legacy / stale data), default to
    // cerrado so the guard is fail-closed.
    const eventoDeLaVenta = eventsStore.eventos.find(
      (e) => e.id === input.venta.evento_id,
    )
    const estadoParaValidar = eventoDeLaVenta?.estado ?? 'cerrado'
    if (!estadoEsEditable(estadoParaValidar)) {
      toast.value = { tipo: 'error', mensaje: CODIGO_EVENTO_CERRADO.message }
      return { data: null, error: CODIGO_EVENTO_CERRADO }
    }
    // 3) Validate items non-empty (the RPC also enforces this, but
    // short-circuit here so the operator gets a clearer error).
    if (input.nuevosItems.length === 0) {
      return {
        data: null,
        error: { code: 'VENTA_SIN_ITEMS', message: 'La venta debe tener al menos un item' },
      }
    }
    // 4) Payment-state validation + normalization (REQ-POS-CORRECCION-4).
    // For efectivo: monto_recibido must be provided AND >= total.
    // For non-efectivo: monto_recibido / cambio are forced to null
    // so a stale value from a previous edit doesn't leak through.
    let nuevoMontoRecibidoNormalizado: number | null
    if (input.nuevoMetodoPago === 'efectivo') {
      if (input.nuevoMontoRecibido === null || input.nuevoMontoRecibido === undefined) {
        toast.value = {
          tipo: 'error',
          mensaje: '❌ Para ventas en efectivo indicá el monto recibido',
        }
        return { data: null, error: CODIGO_MONTO_INSUFICIENTE }
      }
      if (input.nuevoMontoRecibido < input.nuevoTotal) {
        toast.value = {
          tipo: 'error',
          mensaje: CODIGO_MONTO_INSUFICIENTE.message,
        }
        return { data: null, error: CODIGO_MONTO_INSUFICIENTE }
      }
      nuevoMontoRecibidoNormalizado = input.nuevoMontoRecibido
    } else {
      // Stale cash-back values from a previous efectivo correction
      // would otherwise leak into the new record. Normalize to null.
      nuevoMontoRecibidoNormalizado = null
    }
    // `cambio` is derived consistently in one place: the RPC
    // recomputes it server-side (server is the source of truth).
    // We do NOT compute it client-side here to avoid a client/server
    // disagreement.
    // 5) Snapshot the BEFORE items so the audit row records what was
    // actually there at the moment of the edit. The RPC also captures
    // its own server-side snapshot, but the client-side snapshot is
    // what the operator sees if the response is missing the items
    // array (defense in depth for the error path).
    const itemsAnteriores: VentaItem[] = input.venta.items.map((it) => ({ ...it }))

    // 6) Single RPC call → the database does the rest atomically.
    const traceId = createTraceId()
    logTrace('corregirVenta', 'correction-requested', {
      ventaId: input.venta.id,
      eventoId: input.venta.evento_id,
      traceId,
      totalAnterior: input.venta.total,
      totalNuevo: input.nuevoTotal,
    })
    logInfo('corregirVenta', 'correction started', {
      ventaId: input.venta.id,
      eventoId: input.venta.evento_id,
      totalAnterior: input.venta.total,
      totalNuevo: input.nuevoTotal,
      metodoPagoNuevo: input.nuevoMetodoPago,
      itemsCount: input.nuevosItems.length,
    })
    const res = await servicio.corregirVenta({
      venta_id: input.venta.id,
      evento_id: input.venta.evento_id,
      total_anterior: input.venta.total,
      total_nuevo: input.nuevoTotal,
      metodo_pago_anterior: input.venta.metodo_pago,
      metodo_pago_nuevo: input.nuevoMetodoPago,
      monto_recibido_anterior: input.venta.monto_recibido,
      monto_recibido_nuevo: nuevoMontoRecibidoNormalizado,
      motivo: input.motivo,
      items_anteriores: itemsAnteriores,
      items_nuevos: input.nuevosItems,
    })
    if (res.error || !res.data) {
      // Distinguish typed domain errors (which already have a clear
      // user-facing message) from generic RPC failures. Domain
      // errors: surface as-is. Generic failures: fall back to the
      // connection hint.
      const code = res.error?.code
      const isDomainError =
        code === 'EVENTO_CERRADO' ||
        code === 'CORRECCION_SIN_MOTIVO' ||
        code === 'MONTO_INSUFICIENTE' ||
        code === 'VENTA_SIN_ITEMS' ||
        code === 'VENTA_NO_ENCONTRADA' ||
        code === 'METODO_PAGO_INVALIDO'
      // Issue #6: log correction failures with structured context.
      // Domain errors are expected (operator error) so we still log
      // them at error level for the future log aggregator — they're
      // diagnostic signal, not noise.
      logTrace('corregirVenta', 'correction-failed', {
        ventaId: input.venta.id,
        eventoId: input.venta.evento_id,
        traceId,
        errorCode: code,
      })
      logError('corregirVenta', 'failed to apply correction', {
        eventoId: input.venta.evento_id,
        ventaId: input.venta.id,
        errorCode: code,
        isDomainError,
      })
      toast.value = {
        tipo: 'error',
        mensaje: isDomainError
          ? res.error?.message ?? '❌ No se pudo registrar la corrección'
          : '❌ Error al registrar la corrección — revisá tu conexión',
      }
      return { data: null, error: res.error }
    }
    // 7) Update local state so the history view reflects the edit
    // without a re-fetch.
    const idx = ventas.value.findIndex((v) => v.id === res.data?.id)
    if (idx >= 0 && res.data) {
      ventas.value = [
        ...ventas.value.slice(0, idx),
        res.data,
        ...ventas.value.slice(idx + 1),
      ]
    }
    toast.value = {
      tipo: 'success',
      mensaje: `✏️ Venta ${res.data.comprobante_numero ?? res.data.id} corregida`,
    }
    logTrace('corregirVenta', 'correction-done', {
      ventaId: res.data.id,
      eventoId: res.data.evento_id,
      traceId,
      comprobanteNumero: res.data.comprobante_numero,
    })
    logInfo('corregirVenta', 'correction applied', {
      ventaId: res.data.id,
      eventoId: res.data.evento_id,
      comprobanteNumero: res.data.comprobante_numero,
    })
    return { data: res.data, error: null }
  }

  // Delete a sale (for when sales are processed incorrectly)
  async function eliminarVenta(id: string): Promise<void> {
    const traceId = createTraceId()
    logTrace('eliminarVenta', 'delete-start', { ventaId: id, traceId })
    
    const respuesta = await servicio.eliminar(id)
    if (respuesta.error) {
      logError('eliminarVenta', 'failed to delete venta', {
        ventaId: id,
        error: respuesta.error,
        traceId,
      })
      throw respuesta.error
    }
    
    // Remove from local state
    const index = ventas.value.findIndex((v) => v.id === id)
    if (index !== -1) {
      ventas.value.splice(index, 1)
    }
    
    logInfo('eliminarVenta', 'venta deleted', { ventaId: id, traceId })
  }

  return {
    ventas,
    carrito,
    paymentMethod,
    cargando,
    error,
    toast,
    ventasEventoId,
    eventoEnCurso,
    totalCarrito,
    cantidadItems,
    agregarAlCarrito,
    actualizarCantidad,
    quitarDelCarrito,
    vaciarCarrito,
    setPaymentMethod,
    clearPaymentMethod,
    cargarPorEvento,
    registrarVenta,
    corregirVenta,
    eliminarVenta,
    descartarToast,
    CODIGO_SIN_EVENTO,
    CODIGO_EVENTO_CERRADO,
    CODIGO_VENTA_SIN_ITEMS,
    CODIGO_MONTO_INSUFICIENTE,
    CODIGO_CORRECCION_SIN_MOTIVO,
  }
})
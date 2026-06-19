// REQ-FIN-21, REQ-FIN-22, REQ-FIN-26, REQ-REPORTE-1..6 (PR-2c):
// `useReporteEvento(eventoId)` is the report orchestrator. It reads
// from existing stores (ventas, cierresCaja, events) and exposes
// computed aggregations for the `ReporteEventoView`:
//
//   - `reportePorDia`: per-day aggregation (REQ-REPORTE-1) — covers
//     EVERY day in [fechaInicio, fechaFin] (even zero-venta days) and
//     sums ventas + venta_items per day.
//   - `reportePorProducto`: per-producto aggregation (REQ-REPORTE-2) —
//     computed in utils/cierre.calcularDesglosePorProducto for unit
//     testability; this composable just exposes it reactively.
//   - `cierre`: the CierreCaja snapshot row (null when not cerrado).
//   - `cargando`, `error`: proxied from ventasStore.
//
// `cargar()` triggers the underlying fetches (ventas + cierre). The
// view calls this on mount so the report populates as soon as the
// user opens /eventos/:id/reporte.
//
// Arithmetic consistency (REQ-REPORTE-6) is enforced by the view
// itself: it asserts Σ(reportePorDia.utilidadBruta) ≈ cierre.utilidad_bruta
// in the spec. This composable is the data layer; the property-style
// test lives in the view's spec.
import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue'

import type { CierreCaja, DesgloseDia, DesgloseProducto, Venta, VentaItem } from '@/types'
import { calcularDesglosePorDia, calcularDesglosePorProducto } from '@/utils/cierre'
import { useCierresCajaStore } from '@/stores/cierresCaja.store'
import { useEventsStore } from '@/stores/events.store'
import { useVentasStore } from '@/stores/ventas.store'

// Re-export the aggregation row shapes under the report-specific
// names. The view consumes `ReportePorDia` / `ReportePorProducto` so
// the imports stay in the report domain.
export type ReportePorDia = DesgloseDia
export type ReportePorProducto = DesgloseProducto

export interface UseReporteEventoReturn {
  reportePorDia: ComputedRef<ReportePorDia[]>
  reportePorProducto: ComputedRef<ReportePorProducto[]>
  cierre: ComputedRef<CierreCaja | null>
  cargando: ComputedRef<boolean>
  error: ComputedRef<string | null>
  cargar: () => Promise<void>
}

export function useReporteEvento(
  eventoId: MaybeRefOrGetter<string | null>,
): UseReporteEventoReturn {
  const ventasStore = useVentasStore()
  const cierresStore = useCierresCajaStore()
  const eventsStore = useEventsStore()

  const id = (): string | null => toValue(eventoId)

  // Filtered ventas + flattened items for the requested evento. The
  // outer view only sees the evento's slice; cross-evento ventas are
  // ignored so the per-day sums never drift.
  const ventasDelEvento = computed<Venta[]>(() => {
    const eid = id()
    if (!eid) return []
    return ventasStore.ventas
      .filter((v) => v.evento_id === eid)
      .map((v) => {
        const { items: _items, ...rest } = v
        void _items
        return rest as Venta
      })
  })
  const itemsDelEvento = computed<VentaItem[]>(() => {
    const eid = id()
    if (!eid) return []
    return ventasStore.ventas
      .filter((v) => v.evento_id === eid)
      .flatMap((v) => v.items)
  })

  // REQ-REPORTE-1: per-day aggregation. Falls back to a one-day
  // range around `evento.fecha` when fecha_fin is null. The
  // composable intentionally does NOT call cargar() here — the view
  // owns the fetch lifecycle.
  const reportePorDia = computed<ReportePorDia[]>(() => {
    const eid = id()
    if (!eid) return []
    const evento = eventsStore.eventos.find((e) => e.id === eid) ?? eventsStore.eventoActual
    if (!evento) return []
    const inicio = evento.fecha
    const fin = evento.fecha_fin ?? evento.fecha
    return calcularDesglosePorDia(ventasDelEvento.value, itemsDelEvento.value, inicio, fin)
  })

  // REQ-REPORTE-2: per-producto aggregation.
  const reportePorProducto = computed<ReportePorProducto[]>(() => {
    const eid = id()
    if (!eid) return []
    return calcularDesglosePorProducto(itemsDelEvento.value)
  })

  // Cierre snapshot (read from cierresCajaStore — the store
  // fetches it on demand via cargarPorEvento()).
  const cierre = computed<CierreCaja | null>(() => {
    const eid = id()
    if (!eid) return null
    const c = cierresStore.cierre
    return c?.evento_id === eid ? c : null
  })

  const cargando = computed<boolean>(() => ventasStore.cargando)
  const error = computed<string | null>(() => ventasStore.error)

  async function cargar(): Promise<void> {
    const eid = id()
    if (!eid) return
    // Sequential awaits — the chainable Supabase mock consumes one
    // response per `.await` in FIFO order, and the cierre's
    // `.maybeSingle()` chain is async (Promise-wrapped) which can
    // race with the ventas listarPorEvento chain under `Promise.all`.
    // Same fix as CierresCajaView.
    await ventasStore.cargarPorEvento(eid)
    await cierresStore.cargarPorEvento(eid)
    // The cierre is needed for the Cierre tab; the view may not have
    // a stored evento yet (deep link), so ensure the event is loaded
    // for fechaInicio/fechaFin lookups.
    if (!eventsStore.eventos.some((e) => e.id === eid) && eventsStore.eventoActual?.id !== eid) {
      await eventsStore.cargarPorId(eid)
    }
  }

  return {
    reportePorDia,
    reportePorProducto,
    cierre,
    cargando,
    error,
    cargar,
  }
}

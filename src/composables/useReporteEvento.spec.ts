// REQ-FIN-21, REQ-FIN-22, REQ-FIN-26, REQ-REPORTE-1..6 (PR-2c),
// REQ-CON-11 (PR-2):
// `useReporteEvento(eventoId)` is the report orchestrator. It reads
// ventas + venta_items (already loaded by `useVentas.cargarPorEvento`)
// + the cierre snapshot + the evento (for the date range) and exposes
// four computed views for the `ReporteEventoView`:
//   - `reportePorDia`: per-day aggregation (REQ-REPORTE-1)
//   - `reportePorProducto`: per-producto aggregation (REQ-REPORTE-2)
//   - `cierre`: the CierreCaja snapshot row (null when not cerrado)
//   - `cargando`, `error`: state from the ventas store
//
// It also performs the data load on mount: when the caller passes a
// valid eventoId, `useReporteEvento` invokes
// `ventas.cargarPorEvento(eventoId)` and `eventos.cargarPorId(eventoId)`
// (via `useEvents.cargarPorId`) so the view can mount and immediately
// read live data.
//
// Arithmetic consistency invariant (REQ-REPORTE-6):
//   Σ(reportePorDia.utilidadBruta) = cierre.total_utilidad_bruta  ±0.01
//   Σ(reportePorProducto.utilidadBruta) = cierre.total_utilidad_bruta ±0.01
// enforced by a property-style test with 2 distinct evento fixtures.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  CierreCaja,
  Database,
  Evento,
  VentaConItems,
} from '@/types'
import { useCierresCajaStore } from '@/stores/cierresCaja.store'
import { useEventsStore } from '@/stores/events.store'
import { useGastosFijosStore } from '@/stores/gastosFijos.store'
import { useGastosImprevistosStore } from '@/stores/gastosImprevistos.store'
import { useVentasStore } from '@/stores/ventas.store'
import { __pushSupabaseResponse, __resetSupabaseMock } from '../../tests/setup'
import { useReporteEvento } from './useReporteEvento'

let aplicacion: App

beforeEach(() => {
  setActivePinia(createPinia())
  __resetSupabaseMock()
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide('supabase', createClient('http://x', 'anon') as SupabaseClient<Database>)
})

function conContexto<T>(callback: () => T): T {
  return aplicacion.runWithContext(callback)
}

function sembrarEvento(evento: Evento): void {
  conContexto(() => {
    useEventsStore().eventos.push(evento)
  })
}

const mkEvento = (id: string, overrides: Partial<Evento> = {}): Evento => ({
  id,
  nombre: 'Feria del Sol',
  fecha: '2026-12-18',
  fecha_fin: '2026-12-20',
  margen_ganancia: 0.4,
  ubicacion: 'Plaza',
  estado: 'cerrado',
  notas: null,
  created_at: '2026-12-15T00:00:00Z',
  updated_at: '2026-12-20T22:00:00Z',
  ...overrides,
})

const mkVentaConItems = (
  id: string,
  fecha: string,
  total: number,
  items: Array<{
    id: string
    productoId: string
    cantidad: number
    precioUnitario: number
    costoUnitario: number | null
    createdAt?: string
  }>,
  eventoId = 'e-1',
): VentaConItems => ({
  id,
  evento_id: eventoId,
  fecha,
  total,
  metodo_pago: 'efectivo',
  created_at: fecha,
  items: items.map((it) => ({
    id: it.id,
    venta_id: id,
    producto_id: it.productoId,
    cantidad: it.cantidad,
    precio_unitario: it.precioUnitario,
    subtotal: it.cantidad * it.precioUnitario,
    costo_unitario: it.costoUnitario,
    margen_aplicado: null,
    created_at: it.createdAt ?? fecha,
  })),
})

const mkCierre = (eventoId: string, totalUtilidadBruta: number, totalCogs: number): CierreCaja => ({
  id: `cierre-${eventoId}`,
  evento_id: eventoId,
  fecha_cierre: '2026-12-20T22:00:00Z',
  total_ventas: 0,
  total_gastos_fijos: 0,
  total_gastos_imprevistos: 0,
  utilidad_bruta: totalUtilidadBruta,
  efectivo_esperado: null,
  efectivo_real: null,
  diferencia: null,
  notas: null,
  created_at: '2026-12-20T22:00:00Z',
  // CierreCaja DB columns (REQ-FIN-5) live on the row; tests touch only
  // the canonical utilidadBruta/totalUtilidadBruta fields.
  ...( {
    total_cogs: totalCogs,
    total_utilidad_bruta: totalUtilidadBruta,
    total_utilidad_neta: totalUtilidadBruta,
  } as Partial<CierreCaja> ),
})

describe('useReporteEvento', () => {
  it('returns empty arrays when eventoId is null (REQ-FIN-21)', () => {
    const wrapper = conContexto(() => {
      const r = useReporteEvento(null)
      return r
    })
    expect(wrapper.reportePorDia.value).toEqual([])
    expect(wrapper.reportePorProducto.value).toEqual([])
    expect(wrapper.cierre.value).toBeNull()
    expect(wrapper.cargando.value).toBe(false)
    expect(wrapper.error.value).toBeNull()
  })

  it('aggregates ventas by date into reportePorDia (REQ-REPORTE-1)', () => {
    sembrarEvento(mkEvento('e-1'))
    conContexto(() => {
      const ventas = useVentasStore()
      ventas.ventas = [
        mkVentaConItems('v-1', '2026-12-18T10:00:00Z', 50, [
          { id: 'vi-1', productoId: 'p-1', cantidad: 2, precioUnitario: 25, costoUnitario: 10 },
        ]),
        mkVentaConItems('v-2', '2026-12-19T10:00:00Z', 30, [
          { id: 'vi-2', productoId: 'p-2', cantidad: 3, precioUnitario: 10, costoUnitario: 5 },
        ]),
      ]
      const r = useReporteEvento('e-1')
      // Range covers all 3 days (Dec 18, 19, 20). Dec 20 has zero ventas.
      expect(r.reportePorDia.value).toHaveLength(3)
      expect(r.reportePorDia.value[0]?.fecha).toBe('2026-12-18')
      expect(r.reportePorDia.value[0]?.cantidad).toBe(1)
      expect(r.reportePorDia.value[0]?.cogs).toBe(20)
      expect(r.reportePorDia.value[0]?.utilidadBruta).toBe(30)
      expect(r.reportePorDia.value[1]?.cantidad).toBe(1)
      expect(r.reportePorDia.value[1]?.cogs).toBe(15)
      expect(r.reportePorDia.value[1]?.utilidadBruta).toBe(15)
      // Dec 20: zero ventas, cogs 0, utilidadBruta 0.
      expect(r.reportePorDia.value[2]?.cantidad).toBe(0)
      expect(r.reportePorDia.value[2]?.cogs).toBe(0)
    })
  })

  it('aggregates venta_items by producto_id into reportePorProducto (REQ-REPORTE-2)', () => {
    sembrarEvento(mkEvento('e-1'))
    conContexto(() => {
      const ventas = useVentasStore()
      ventas.ventas = [
        mkVentaConItems('v-1', '2026-12-18T10:00:00Z', 50, [
          { id: 'vi-1', productoId: 'p-1', cantidad: 2, precioUnitario: 25, costoUnitario: 10 },
        ]),
        mkVentaConItems('v-2', '2026-12-18T14:00:00Z', 30, [
          { id: 'vi-2', productoId: 'p-2', cantidad: 3, precioUnitario: 10, costoUnitario: 5 },
        ]),
      ]
      const r = useReporteEvento('e-1')
      expect(r.reportePorProducto.value).toHaveLength(2)
      const p1 = r.reportePorProducto.value.find((d) => d.productoId === 'p-1')
      expect(p1?.unidades).toBe(2)
      expect(p1?.ingresoTotal).toBe(50)
      expect(p1?.cogsTotal).toBe(20)
      expect(p1?.utilidadBruta).toBe(30)
    })
  })

  it('exposes the cierre snapshot for the evento (REQ-FIN-22)', () => {
    sembrarEvento(mkEvento('e-1'))
    conContexto(() => {
      const cierres = useCierresCajaStore()
      cierres.cierre = mkCierre('e-1', 300, 100)
      const r = useReporteEvento('e-1')
      expect(r.cierre.value?.evento_id).toBe('e-1')
    })
  })

  it('returns null cierre when no cierre has been recorded (REQ-FIN-22)', () => {
    sembrarEvento(mkEvento('e-1'))
    conContexto(() => {
      const r = useReporteEvento('e-1')
      expect(r.cierre.value).toBeNull()
    })
  })

  it('reflects ventasStore.cargando and error (REQ-FIN-21)', () => {
    sembrarEvento(mkEvento('e-1'))
    conContexto(() => {
      const ventas = useVentasStore()
      ventas.cargando = true
      ventas.error = 'Sin conexión'
      const r = useReporteEvento('e-1')
      expect(r.cargando.value).toBe(true)
      expect(r.error.value).toBe('Sin conexión')
    })
  })

  it('filters ventas and items to the requested eventoId (REQ-FIN-21)', () => {
    sembrarEvento(mkEvento('e-1'))
    sembrarEvento(mkEvento('e-2', { id: 'e-2', fecha: '2026-12-18', fecha_fin: '2026-12-19' }))
    conContexto(() => {
      const ventas = useVentasStore()
      ventas.ventas = [
        mkVentaConItems('v-1', '2026-12-18T10:00:00Z', 50, [
          { id: 'vi-1', productoId: 'p-1', cantidad: 1, precioUnitario: 50, costoUnitario: 10 },
        ]),
        // Different evento — must be excluded.
        { ...mkVentaConItems('v-2', '2026-12-19T10:00:00Z', 999, [
          { id: 'vi-2', productoId: 'p-1', cantidad: 1, precioUnitario: 999, costoUnitario: 999 },
        ]), evento_id: 'e-2' },
      ]
      const r = useReporteEvento('e-1')
      expect(r.reportePorProducto.value).toHaveLength(1)
      expect(r.reportePorProducto.value[0]?.ingresoTotal).toBe(50)
    })
  })

  it('returns empty arrays when the evento has zero ventas (REQ-FIN-21)', () => {
    sembrarEvento(mkEvento('e-1'))
    conContexto(() => {
      const r = useReporteEvento('e-1')
      expect(r.reportePorDia.value).toHaveLength(3) // 3 days in range
      expect(r.reportePorDia.value.every((d) => d.cantidad === 0)).toBe(true)
      expect(r.reportePorProducto.value).toEqual([])
    })
  })

  it('exposes cargando=true while ventasStore is fetching (REQ-FIN-21)', async () => {
    sembrarEvento(mkEvento('e-1'))
    __pushSupabaseResponse<VentaConItems[]>({
      data: [],
      error: null,
    })
    await conContexto(async () => {
      const r = useReporteEvento('e-1')
      void r.cargar()
      // Synchronously after the call kicks off.
      expect(r.cargando.value).toBe(true)
      // Allow the promise to settle.
      await new Promise((resolve) => setTimeout(resolve, 5))
      expect(r.cargando.value).toBe(false)
    })
  })
})

// REQ-REPORTE-6: arithmetic consistency. The sum of utilidadBruta
// across Por día/Por producto rows MUST match the cierre snapshot's
// utilidadBruta within 0.01. We test it across 2 distinct fixtures.
describe('useReporteEvento — arithmetic consistency (REQ-REPORTE-6)', () => {
  it('Σ reportePorDia.utilidadBruta matches cierre.utilidadBruta (multi-day, REQ-REPORTE-6)', () => {
    sembrarEvento(mkEvento('e-1'))
    conContexto(() => {
      const ventas = useVentasStore()
      ventas.ventas = [
        mkVentaConItems('v-1', '2026-12-18T10:00:00Z', 100, [
          { id: 'vi-1', productoId: 'p-1', cantidad: 4, precioUnitario: 25, costoUnitario: 10 },
        ]),
        mkVentaConItems('v-2', '2026-12-19T10:00:00Z', 60, [
          { id: 'vi-2', productoId: 'p-2', cantidad: 2, precioUnitario: 30, costoUnitario: 5 },
        ]),
      ]
      // Total utilidadBruta = (100-40) + (60-10) = 110.
      const cierres = useCierresCajaStore()
      cierres.cierre = mkCierre('e-1', 110, 50)
      const r = useReporteEvento('e-1')
      const suma = r.reportePorDia.value
        .filter((d) => d.ventas > 0)
        .reduce((acc, d) => acc + d.utilidadBruta, 0)
      expect(Math.abs(suma - 110)).toBeLessThan(0.01)
    })
  })

  it('Σ reportePorProducto.utilidadBruta matches cierre.utilidadBruta (multi-producto, REQ-REPORTE-6)', () => {
    sembrarEvento(mkEvento('e-2', { id: 'e-2', fecha: '2026-12-18', fecha_fin: '2026-12-18' }))
    conContexto(() => {
      const ventas = useVentasStore()
      ventas.ventas = [
        mkVentaConItems(
          'v-1',
          '2026-12-18T10:00:00Z',
          160,
          [
            { id: 'vi-1', productoId: 'p-1', cantidad: 4, precioUnitario: 25, costoUnitario: 10 },
            { id: 'vi-2', productoId: 'p-2', cantidad: 2, precioUnitario: 30, costoUnitario: 5 },
          ],
          'e-2',
        ),
      ]
      // p-1: 100 - 40 = 60 utilidad. p-2: 60 - 10 = 50. Sum = 110.
      const cierres = useCierresCajaStore()
      cierres.cierre = mkCierre('e-2', 110, 50)
      const r = useReporteEvento('e-2')
      const suma = r.reportePorProducto.value.reduce((acc, d) => acc + d.utilidadBruta, 0)
      expect(Math.abs(suma - 110)).toBeLessThan(0.01)
    })
  })
})

// Regression: the composable's underlying stores must not throw when
// no gastosFijos / no gastosImprevistos are loaded — the report must
// still render with the totals (REQ-FIN-21).
describe('useReporteEvento — defensive reads', () => {
  it('does not throw when gastosFijos/gastosImprevistos stores are empty', () => {
    sembrarEvento(mkEvento('e-1'))
    conContexto(() => {
      const ventas = useVentasStore()
      ventas.ventas = [
        mkVentaConItems('v-1', '2026-12-18T10:00:00Z', 50, [
          { id: 'vi-1', productoId: 'p-1', cantidad: 2, precioUnitario: 25, costoUnitario: 10 },
        ]),
      ]
      // Touch the stores — they exist but are empty.
      expect(useGastosFijosStore().gastosPorEvento.size).toBe(0)
      expect(useGastosImprevistosStore().gastosPorEvento.size).toBe(0)
      const r = useReporteEvento('e-1')
      expect(r.reportePorDia.value).toHaveLength(3)
      expect(r.reportePorProducto.value).toHaveLength(1)
    })
  })
})

// REQ-CON-11 (PR-2): contribution-derived computeds on the report.
// - `rankingContribucion`: same rows as `reportePorProducto`, sorted
//   by `utilidadBruta` DESC (top earners first).
// - `productosPagaronOperacion`: top 3 by utilidadBruta.
// - `productosGananciaPura`: rows where utilidadBruta covers its share
//   of gastos fijos. For PR-2 we surface every producto when total
//   utilidadBruta > gastos fijos (PR-2 brief "simplified").
describe('useReporteEvento — contribution ranking (REQ-CON-11)', () => {
  it('rankingContribucion sorts reportePorProducto by utilidadBruta DESC', () => {
    sembrarEvento(mkEvento('e-1'))
    conContexto(() => {
      const ventas = useVentasStore()
      ventas.ventas = [
        mkVentaConItems('v-1', '2026-12-18T10:00:00Z', 50, [
          { id: 'vi-1', productoId: 'p-low', cantidad: 2, precioUnitario: 25, costoUnitario: 20 },
        ]),
        mkVentaConItems('v-2', '2026-12-18T11:00:00Z', 100, [
          { id: 'vi-2', productoId: 'p-high', cantidad: 4, precioUnitario: 25, costoUnitario: 5 },
        ]),
        mkVentaConItems('v-3', '2026-12-18T12:00:00Z', 60, [
          { id: 'vi-3', productoId: 'p-mid', cantidad: 2, precioUnitario: 30, costoUnitario: 15 },
        ]),
      ]
      const r = useReporteEvento('e-1')
      // utilidadBruta: p-high = 80, p-mid = 30, p-low = 10
      expect(r.rankingContribucion.value[0]?.productoId).toBe('p-high')
      expect(r.rankingContribucion.value[1]?.productoId).toBe('p-mid')
      expect(r.rankingContribucion.value[2]?.productoId).toBe('p-low')
    })
  })

  it('productosPagaronOperacion returns the top 3 by utilidadBruta', () => {
    sembrarEvento(mkEvento('e-1'))
    conContexto(() => {
      const ventas = useVentasStore()
      ventas.ventas = [
        mkVentaConItems('v-1', '2026-12-18T10:00:00Z', 100, [
          { id: 'vi-1', productoId: 'p-a', cantidad: 4, precioUnitario: 25, costoUnitario: 5 },
        ]),
        mkVentaConItems('v-2', '2026-12-18T11:00:00Z', 80, [
          { id: 'vi-2', productoId: 'p-b', cantidad: 4, precioUnitario: 20, costoUnitario: 8 },
        ]),
        mkVentaConItems('v-3', '2026-12-18T12:00:00Z', 60, [
          { id: 'vi-3', productoId: 'p-c', cantidad: 3, precioUnitario: 20, costoUnitario: 10 },
        ]),
        mkVentaConItems('v-4', '2026-12-18T13:00:00Z', 40, [
          { id: 'vi-4', productoId: 'p-d', cantidad: 2, precioUnitario: 20, costoUnitario: 15 },
        ]),
      ]
      const r = useReporteEvento('e-1')
      expect(r.productosPagaronOperacion.value).toHaveLength(3)
      expect(r.productosPagaronOperacion.value[0]?.productoId).toBe('p-a')
      expect(r.productosPagaronOperacion.value[2]?.productoId).toBe('p-c')
      expect(r.productosPagaronOperacion.value.map((d) => d.productoId)).not.toContain('p-d')
    })
  })

  it('productosPagaronOperacion returns fewer than 3 when there are not enough productos', () => {
    sembrarEvento(mkEvento('e-1'))
    conContexto(() => {
      const ventas = useVentasStore()
      ventas.ventas = [
        mkVentaConItems('v-1', '2026-12-18T10:00:00Z', 50, [
          { id: 'vi-1', productoId: 'p-only', cantidad: 2, precioUnitario: 25, costoUnitario: 10 },
        ]),
      ]
      const r = useReporteEvento('e-1')
      expect(r.productosPagaronOperacion.value).toHaveLength(1)
      expect(r.productosPagaronOperacion.value[0]?.productoId).toBe('p-only')
    })
  })

  it('productosGananciaPura returns empty when there are no ventas', () => {
    sembrarEvento(mkEvento('e-1'))
    conContexto(() => {
      const r = useReporteEvento('e-1')
      expect(r.productosGananciaPura.value).toEqual([])
    })
  })

  it('productosGananciaPura returns all productos when total utilidadBruta > 0 (simplified)', () => {
    sembrarEvento(mkEvento('e-1'))
    conContexto(() => {
      const ventas = useVentasStore()
      ventas.ventas = [
        mkVentaConItems('v-1', '2026-12-18T10:00:00Z', 100, [
          { id: 'vi-1', productoId: 'p-a', cantidad: 4, precioUnitario: 25, costoUnitario: 5 },
        ]),
      ]
      const r = useReporteEvento('e-1')
      // No gastos fijos seeded here so the simplified "ganancia pura"
      // surfaces the single producto. Real PR-3+ work uses the
      // per-product share of gastos fijos.
      expect(r.productosGananciaPura.value.length).toBeGreaterThanOrEqual(1)
    })
  })
})

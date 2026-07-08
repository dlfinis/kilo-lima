// mobile-ux-redesign Phase 2: useKpis composable.
// Computes 4 KPIs for the HomeView dashboard:
//   ventasHoy, gastosHoy, utilidadEstimada, stockCritico.
// Uses stores directly for raw data access.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'

import { useKpis } from './useKpis'
import { useEventsStore } from '@/stores/events.store'
import { useVentasStore } from '@/stores/ventas.store'
import { useGastosFijosStore } from '@/stores/gastosFijos.store'
import { useGastosImprevistosStore } from '@/stores/gastosImprevistos.store'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Evento, VentaConItems, GastoFijo, GastoImprevisto } from '@/types'
import { hoyISO } from '@/utils/fecha'

let aplicacion: App

const HOY = hoyISO()

const mkEvento = (
  id: string,
  estado: Evento['estado'] = 'en_curso',
): Evento => ({
  id,
  nombre: `Evento ${id}`,
  fecha: '2026-07-15',
  fecha_fin: null,
  margen_ganancia: null,
  ubicacion: 'Plaza',
  estado,
  notas: null,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
})

const mkVenta = (overrides: Partial<VentaConItems> = {}): VentaConItems => ({
  id: `v-${Math.random().toString(36).slice(2, 6)}`,
  evento_id: 'e-1',
  fecha: `${HOY}T14:30:00Z`,
  total: 50,
  metodo_pago: 'efectivo',
  monto_recibido: null,
  cambio: null,
  comprobante_numero: null,
  created_at: `${HOY}T14:30:00Z`,
  items: [],
  ...overrides,
})

const mkGastoFijo = (overrides: Partial<GastoFijo> = {}): GastoFijo => ({
  id: `gf-${Math.random().toString(36).slice(2, 6)}`,
  evento_id: 'e-1',
  categoria: 'renta',
  monto: 100,
  descripcion: null,
  socio_id: null,
  created_at: `${HOY}T10:00:00Z`,
  ...overrides,
})

const mkGastoImprevisto = (
  overrides: Partial<GastoImprevisto> = {},
): GastoImprevisto => ({
  id: `gi-${Math.random().toString(36).slice(2, 6)}`,
  evento_id: 'e-1',
  monto: 30,
  motivo: 'Transporte extra',
  categoria: 'transporte',
  socio_id: null,
  created_at: `${HOY}T12:00:00Z`,
  ...overrides,
})

beforeEach(() => {
  setActivePinia(createPinia())
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide(
    'supabase',
    createClient('http://x', 'anon') as SupabaseClient<Database>,
  )
})

function conContexto<T>(callback: () => T): T {
  return aplicacion.runWithContext(callback)
}

describe('useKpis', () => {
  it('calculates ventasHoy as the sum of ventas today', () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', 'en_curso'))
      const ventas = useVentasStore()
      ventas.ventas.push(mkVenta({ total: 100 }))
      ventas.ventas.push(mkVenta({ total: 50 }))
      // A venta from yesterday should not be counted
      ventas.ventas.push(
        mkVenta({
          id: 'v-old',
          total: 999,
          fecha: '2020-01-01T10:00:00Z',
          created_at: '2020-01-01T10:00:00Z',
        }),
      )
      const kpis = useKpis()
      expect(kpis.ventasHoy.value).toBe(150)
    })
  })

  it('returns 0 for ventasHoy when no ventas exist', () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', 'en_curso'))
      const kpis = useKpis()
      expect(kpis.ventasHoy.value).toBe(0)
    })
  })

  it('calculates gastosHoy as the sum of all gastos for the active event', () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', 'en_curso'))
      const gf = useGastosFijosStore()
      gf.gastosPorEvento.set('e-1', [
        mkGastoFijo({ monto: 100 }),
        mkGastoFijo({ monto: 50 }),
      ])
      const gi = useGastosImprevistosStore()
      gi.gastosPorEvento.set('e-1', [
        mkGastoImprevisto({ monto: 30 }),
        mkGastoImprevisto({ monto: 20 }),
      ])
      const kpis = useKpis()
      expect(kpis.gastosHoy.value).toBe(200) // 100 + 50 + 30 + 20
    })
  })

  it('returns 0 for gastosHoy when no gastos exist', () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', 'en_curso'))
      const kpis = useKpis()
      expect(kpis.gastosHoy.value).toBe(0)
    })
  })

  it('returns 0 for gastosHoy when no active event exists', () => {
    conContexto(() => {
      const gf = useGastosFijosStore()
      gf.gastosPorEvento.set('e-1', [mkGastoFijo({ monto: 100 })])
      const kpis = useKpis()
      expect(kpis.gastosHoy.value).toBe(0)
    })
  })

  it('calculates utilidadEstimada as ventasHoy - gastosHoy', () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', 'en_curso'))
      const ventas = useVentasStore()
      ventas.ventas.push(mkVenta({ total: 500 }))
      ventas.ventas.push(mkVenta({ total: 200 }))
      const gf = useGastosFijosStore()
      gf.gastosPorEvento.set('e-1', [mkGastoFijo({ monto: 300 })])
      const kpis = useKpis()
      expect(kpis.utilidadEstimada.value).toBe(400) // 700 - 300
    })
  })

  it('returns negative utilidadEstimada when gastos exceed ventas', () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', 'en_curso'))
      const ventas = useVentasStore()
      ventas.ventas.push(mkVenta({ total: 100 }))
      const gf = useGastosFijosStore()
      gf.gastosPorEvento.set('e-1', [mkGastoFijo({ monto: 300 })])
      const kpis = useKpis()
      expect(kpis.utilidadEstimada.value).toBe(-200)
    })
  })

  it('returns stockCritico as a count (placeholder value)', () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', 'en_curso'))
      const kpis = useKpis()
      expect(typeof kpis.stockCritico.value).toBe('number')
      expect(kpis.stockCritico.value).toBeGreaterThanOrEqual(0)
    })
  })

  it('returns zero KPIs when there is no active event', () => {
    conContexto(() => {
      const kpis = useKpis()
      expect(kpis.ventasHoy.value).toBe(0)
      expect(kpis.gastosHoy.value).toBe(0)
      expect(kpis.utilidadEstimada.value).toBe(0)
    })
  })

  it('is reactive: updates when ventas change', () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', 'en_curso'))
      const ventas = useVentasStore()
      const kpis = useKpis()
      expect(kpis.ventasHoy.value).toBe(0)
      ventas.ventas.push(mkVenta({ total: 75 }))
      expect(kpis.ventasHoy.value).toBe(75)
    })
  })
})

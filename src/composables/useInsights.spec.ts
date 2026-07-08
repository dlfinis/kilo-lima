// mobile-ux-redesign Phase 5: useInsights composable.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types'
import { hoyISO } from '@/utils/fecha'

import { useInsights } from './useInsights'
import { useEventsStore } from '@/stores/events.store'
import { useVentasStore } from '@/stores/ventas.store'
import { useGastosFijosStore } from '@/stores/gastosFijos.store'

const HOY = hoyISO()

let aplicacion: App

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

describe('useInsights', () => {
  it('returns 4 insight cards in post mode (no events)', () => {
    conContexto(() => {
      const { insights } = useInsights()
      expect(insights.value).toHaveLength(4)
    })
  })

  it('returns 4 insight cards in during mode with event + ventas', () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos = [{
        id: 'e-1', nombre: 'Feria', fecha: '2026-07-15', fecha_fin: null,
        margen_ganancia: null, ubicacion: 'Plaza', estado: 'en_curso' as const,
        notas: null, created_at: '', updated_at: '',
      }]

      const ventas = useVentasStore()
      ventas.ventas = [{
        id: 'v-1', evento_id: 'e-1', fecha: `${HOY}T14:30:00Z`, total: 50,
        metodo_pago: 'efectivo' as const, monto_recibido: null, cambio: null,
        comprobante_numero: null, created_at: `${HOY}T14:30:00Z`,
        items: [{
          id: 'vi-1', venta_id: 'v-1', producto_id: 'p-1', cantidad: 2,
          precio_unitario: 30, subtotal: 60, costo_unitario: 10,
          margen_aplicado: 0.4, evento_producto_id: null, created_at: `${HOY}T14:30:00Z`,
        }],
      }]

      const { insights } = useInsights()
      expect(insights.value).toHaveLength(4)

      // 1st: utilidad (ventasHoy=60, gastosHoy=0 => utilidad=60)
      expect(insights.value[0]!.phrase).toContain('Ganaste')
      expect(insights.value[0]!.phrase).toContain('hoy')
      expect(insights.value[0]!.color).toBe('green')

      // 2nd: margen
      expect(insights.value[1]!.phrase).toContain('margen')

      // 3rd: producto más vendido
      expect(insights.value[2]!.phrase).toContain('Producto más vendido')

      // 4th: mayor gasto
      expect(insights.value[3]!.phrase).toContain('Mayor gasto')
    })
  })

  it('color codes negative utilidad as red', () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos = [{
        id: 'e-1', nombre: 'Feria', fecha: '2026-07-15', fecha_fin: null,
        margen_ganancia: null, ubicacion: 'Plaza', estado: 'en_curso' as const,
        notas: null, created_at: '', updated_at: '',
      }]

      const ventas = useVentasStore()
      ventas.ventas = [{
        id: 'v-1', evento_id: 'e-1', fecha: `${HOY}T14:30:00Z`, total: 50,
        metodo_pago: 'efectivo' as const, monto_recibido: null, cambio: null,
        comprobante_numero: null, created_at: `${HOY}T14:30:00Z`,
        items: [{
          id: 'vi-1', venta_id: 'v-1', producto_id: 'p-1', cantidad: 1,
          precio_unitario: 50, subtotal: 50, costo_unitario: 10,
          margen_aplicado: 0.4, evento_producto_id: null, created_at: `${HOY}T14:30:00Z`,
        }],
      }]

      // gastos > ventas → negative utilidad
      const gf = useGastosFijosStore()
      gf.gastosPorEvento.set('e-1', [{
        id: 'gf-1', evento_id: 'e-1', categoria: 'renta' as const,
        monto: 100, descripcion: 'Alquiler', socio_id: null,
        created_at: `${HOY}T10:00:00Z`,
      }])

      const { insights } = useInsights()
      // utilidad = 50 - 100 = -50 → red
      expect(insights.value[0]!.color).toBe('red')
    })
  })

  it('handles missing data during event', () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos = [{
        id: 'e-1', nombre: 'Feria', fecha: '2026-07-15', fecha_fin: null,
        margen_ganancia: null, ubicacion: 'Plaza', estado: 'en_curso' as const,
        notas: null, created_at: '', updated_at: '',
      }]

      const { insights } = useInsights()
      const items = insights.value
      expect(items).toHaveLength(4)
      for (const item of items) {
        expect(item.phrase.length).toBeGreaterThan(0)
      }
    })
  })

  it('generates post-event insights with ventas data', () => {
    conContexto(() => {
      const ventas = useVentasStore()
      ventas.ventas = [{
        id: 'v-1', evento_id: 'e-1', fecha: `${HOY}T14:30:00Z`, total: 200,
        metodo_pago: 'efectivo' as const, monto_recibido: null, cambio: null,
        comprobante_numero: null, created_at: `${HOY}T14:30:00Z`,
        items: [
          {
            id: 'vi-1', venta_id: 'v-1', producto_id: 'p-1', cantidad: 1,
            precio_unitario: 100, subtotal: 100, costo_unitario: 40,
            margen_aplicado: 0.4, evento_producto_id: null, created_at: `${HOY}T14:30:00Z`,
          },
          {
            id: 'vi-2', venta_id: 'v-1', producto_id: 'p-2', cantidad: 1,
            precio_unitario: 50, subtotal: 50, costo_unitario: 30,
            margen_aplicado: 0.4, evento_producto_id: null, created_at: `${HOY}T14:30:00Z`,
          },
        ],
      }]

      const { insights } = useInsights()
      const items = insights.value
      expect(items).toHaveLength(4)

      expect(items[0]!.phrase).toContain('Ventas totales')
      expect(items[0]!.phrase).toContain('150')
      expect(items[1]!.phrase).toContain('COGS')
      expect(items[2]!.phrase).toContain('Utilidad neta')
      expect(items[3]!.phrase).toContain('Producto más rentable')
    })
  })

  it('updates reactively when store data changes', () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos = [{
        id: 'e-1', nombre: 'Feria', fecha: '2026-07-15', fecha_fin: null,
        margen_ganancia: null, ubicacion: 'Plaza', estado: 'en_curso' as const,
        notas: null, created_at: '', updated_at: '',
      }]

      const ventas = useVentasStore()
      ventas.ventas = [{
        id: 'v-1', evento_id: 'e-1', fecha: `${HOY}T14:30:00Z`, total: 0,
        metodo_pago: 'efectivo' as const, monto_recibido: null, cambio: null,
        comprobante_numero: null, created_at: `${HOY}T14:30:00Z`,
        items: [],
      }]

      const { insights } = useInsights()
      const before = insights.value[0]!.phrase

      ventas.ventas = [{
        id: 'v-2', evento_id: 'e-1', fecha: `${HOY}T14:30:00Z`, total: 150,
        metodo_pago: 'efectivo' as const, monto_recibido: null, cambio: null,
        comprobante_numero: null, created_at: `${HOY}T14:30:00Z`,
        items: [{
          id: 'vi-2', venta_id: 'v-2', producto_id: 'p-1', cantidad: 1,
          precio_unitario: 150, subtotal: 150, costo_unitario: 10,
          margen_aplicado: 0.4, evento_producto_id: null, created_at: `${HOY}T14:30:00Z`,
        }],
      }]

      const after = insights.value[0]!.phrase
      expect(after).not.toBe(before)
    })
  })
})

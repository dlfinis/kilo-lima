// REQ-POS-30, REQ-POS-31, REQ-POS-33, REQ-POS-35, REQ-POS-36,
// REQ-POS-44, REQ-POS-56:
// useCierreCaja composable. PR1 wires the reactive bridge between
// `cierresCaja.store` + `ventas.store` + `gastosFijos.store` +
// `gastosImprevistos.store` + the pure `calcularCierre` helper. PR4
// adds `registrarCierre` to the composable surface. Tests cover:
//   - resumen is null when eventoId is null
//   - cierre resolves to the cached row whose evento_id matches
//   - resumen aggregates ventas + gastos fijos + imprevistos
//   - resumen picks up cierre.efectivo_esperado / efectivo_real when
//     present (so the view can pre-fill the inputs after a prior cierre)
//   - registrarCierre proxies to the store
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import { __pushSupabaseResponse, __resetSupabaseMock } from '../../tests/setup'
import type { CierreCaja, CierreCajaInput, Database } from '@/types'
import { useCierreCaja } from './useCierreCaja'
import { useCierresCajaStore } from '@/stores/cierresCaja.store'
import { useVentasStore } from '@/stores/ventas.store'
import { useGastosFijosStore } from '@/stores/gastosFijos.store'
import { useGastosImprevistosStore } from '@/stores/gastosImprevistos.store'

let aplicacion: App

beforeEach(() => {
  setActivePinia(createPinia())
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide('supabase', createClient('http://x', 'anon') as SupabaseClient<Database>)
})

function conContexto<T>(callback: () => T): T {
  return aplicacion.runWithContext(callback)
}

describe('useCierreCaja — PR1 reactive bridge (REQ-POS-30, REQ-POS-31)', () => {
  it('returns null resumen when eventoId is null', () => {
    conContexto(() => {
      const { resumen, cierre } = useCierreCaja(() => null)
      expect(resumen.value).toBeNull()
      expect(cierre.value).toBeNull()
    })
  })

  it('cierre resolves to the cached row whose evento_id matches', () => {
    conContexto(() => {
      const cierresStore = useCierresCajaStore()
      cierresStore.cierre = {
        id: 'cc-1',
        evento_id: 'e-1',
        fecha_cierre: '2026-06-19T20:00:00Z',
        total_ventas: 100,
        total_gastos_fijos: 30,
        total_gastos_imprevistos: 20,
        utilidad_bruta: 50,
        efectivo_esperado: 70,
        efectivo_real: 68,
        diferencia: -2,
        notas: null,
        created_at: '2026-06-19T20:00:00Z',
      }
      const { cierre } = useCierreCaja(() => 'e-1')
      expect(cierre.value?.id).toBe('cc-1')
    })
  })

  it('cierre is null when cached row belongs to a different evento', () => {
    conContexto(() => {
      const cierresStore = useCierresCajaStore()
      cierresStore.cierre = {
        id: 'cc-1',
        evento_id: 'e-OTHER',
        fecha_cierre: '2026-06-19T20:00:00Z',
        total_ventas: 100,
        total_gastos_fijos: 30,
        total_gastos_imprevistos: 20,
        utilidad_bruta: 50,
        efectivo_esperado: null,
        efectivo_real: null,
        diferencia: null,
        notas: null,
        created_at: '2026-06-19T20:00:00Z',
      }
      const { cierre } = useCierreCaja(() => 'e-1')
      expect(cierre.value).toBeNull()
    })
  })

  it('resumen aggregates ventas + gastos fijos + imprevistos', () => {
    conContexto(() => {
      const ventasStore = useVentasStore()
      const gastosFijosStore = useGastosFijosStore()
      const gastosImprevistosStore = useGastosImprevistosStore()

      ventasStore.ventas = [
        {
          id: 'v-1',
          evento_id: 'e-1',
          fecha: '2026-06-19T10:00:00Z',
          total: 50,
          metodo_pago: 'efectivo',
          created_at: '2026-06-19T10:00:00Z',
          items: [],
        },
      ]
      gastosFijosStore.gastosPorEvento.set('e-1', [
        {
          id: 'g-1',
          evento_id: 'e-1',
          categoria: 'renta',
          monto: 10,
          descripcion: null,
          created_at: '2026-06-19T09:00:00Z',
        },
      ])
      gastosImprevistosStore.gastosPorEvento.set('e-1', [
        {
          id: 'gi-1',
          evento_id: 'e-1',
          monto: 5,
          motivo: 'Más vasos',
          categoria: 'insumos_extra',
          created_at: '2026-06-19T11:00:00Z',
        },
      ])

      const { resumen } = useCierreCaja(() => 'e-1')
      expect(resumen.value?.totalVentas).toBe(50)
      expect(resumen.value?.totalGastosFijos).toBe(10)
      expect(resumen.value?.totalGastosImprevistos).toBe(5)
      // REQ-FIN-6: utilidadBruta = ventas − COGS = 50 − 0 = 50
      // (items has no costo_unitario so COGS=0 per REQ-FIN-8).
      expect(resumen.value?.utilidadBruta).toBe(50)
      // REQ-FIN-7: utilidadNeta = utilidadBruta − gastosOp = 50 − 10 − 5 = 35.
      expect(resumen.value?.utilidadNeta).toBe(35)
      expect(resumen.value?.ventasPorMetodoPago.efectivo).toBe(50)
    })
  })

  it('picks up efectivoEsperado/efectivoReal from the cached cierre row', () => {
    conContexto(() => {
      const cierresStore = useCierresCajaStore()
      cierresStore.cierre = {
        id: 'cc-1',
        evento_id: 'e-1',
        fecha_cierre: '2026-06-19T20:00:00Z',
        total_ventas: 0,
        total_gastos_fijos: 0,
        total_gastos_imprevistos: 0,
        utilidad_bruta: 0,
        efectivo_esperado: 100,
        efectivo_real: 95,
        diferencia: -5,
        notas: null,
        created_at: '2026-06-19T20:00:00Z',
      }
      const { resumen } = useCierreCaja(() => 'e-1')
      expect(resumen.value?.efectivoEsperado).toBe(100)
      expect(resumen.value?.efectivoReal).toBe(95)
      expect(resumen.value?.diferencia).toBe(-5)
    })
  })

  it('filters ventas by evento_id', () => {
    conContexto(() => {
      const ventasStore = useVentasStore()
      ventasStore.ventas = [
        {
          id: 'v-1',
          evento_id: 'e-OTHER',
          fecha: '2026-06-19T10:00:00Z',
          total: 999,
          metodo_pago: 'efectivo',
          created_at: '2026-06-19T10:00:00Z',
          items: [],
        },
      ]
      const { resumen } = useCierreCaja(() => 'e-1')
      expect(resumen.value?.totalVentas).toBe(0)
      expect(resumen.value?.cantidadVentas).toBe(0)
    })
  })

  it('registrarCierre proxies the store action and returns the cierre row (REQ-POS-36)', async () => {
    const creado: CierreCaja = {
      id: 'cc-new',
      evento_id: 'e-1',
      fecha_cierre: '2026-06-19T20:00:00Z',
      total_ventas: 100,
      total_gastos_fijos: 30,
      total_gastos_imprevistos: 20,
      utilidad_bruta: 50,
      efectivo_esperado: null,
      efectivo_real: null,
      diferencia: null,
      notas: null,
      created_at: '2026-06-19T20:00:00Z',
    }
    __resetSupabaseMock()
    __pushSupabaseResponse<CierreCaja>({ data: creado, error: null })

    await conContexto(async () => {
      const { registrarCierre } = useCierreCaja(() => 'e-1')
      const input: CierreCajaInput = {
        evento_id: 'e-1',
        total_ventas: 100,
        total_gastos_fijos: 30,
        total_gastos_imprevistos: 20,
        utilidad_bruta: 50,
        efectivo_esperado: null,
        efectivo_real: null,
        diferencia: null,
        notas: null,
      }
      const resultado = await registrarCierre(input)
      expect(resultado.error).toBeNull()
      expect(resultado.data?.id).toBe('cc-new')

      const cierresStore = useCierresCajaStore()
      expect(cierresStore.cierre?.id).toBe('cc-new')
    })
  })
})

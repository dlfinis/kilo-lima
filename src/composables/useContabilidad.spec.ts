// Phase 4 (REQ-STOCK-MOVEMENTS-4): useContabilidad composable tests.
// Verifies:
//   - COGS is computed from stock consumption movements when available
//   - cogsConfiable = false when no consumption movements exist
//   - ResumenContabilidad includes the new cogsConfiable field
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, computed, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  __resetSupabaseMock,
  __pushSupabaseResponse,
} from '../../tests/setup'
import type { Database, StockMovement } from '@/types'
import { useContabilidad, type ResumenContabilidad } from './useContabilidad'
import { useStockMovementsStore } from '@/stores/stockMovements.store'

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

const mkMovement = (overrides: Partial<StockMovement> = {}): StockMovement => ({
  id: 'sm-1',
  materia_prima_id: 'mp-1',
  cantidad: -2,
  tipo: 'consumo',
  evento_id: 'e-1',
  compra_insumo_id: null,
  venta_id: 'v-1',
  movimiento_corregido_id: null,
  costo_unitario_snapshot: 5.0,
  motivo: null,
  fecha: '2026-07-15',
  created_at: '2026-07-15T10:00:00Z',
  created_by: null,
  ...overrides,
})

describe('useContabilidad — movement-backed COGS (Phase 4)', () => {
  it('cogsConfiable is false when no consumption movements exist for the event', () => {
    conContexto(() => {
      const id = computed(() => 'e-1')
      const { resumen } = useContabilidad(id)
      expect(resumen.value.cogsConfiable).toBe(false)
      expect(resumen.value.totalCogs).toBe(0)
    })
  })

  it('cogsConfiable is true when consumption movements exist and COGS is computed from them', () => {
    conContexto(() => {
      const store = useStockMovementsStore()
      // Pinia auto-unwraps refs — set the array directly.
      store.movements = [
        mkMovement({ id: 'sm-1', cantidad: -3, costo_unitario_snapshot: 4.0 }),
        mkMovement({ id: 'sm-2', cantidad: -2, costo_unitario_snapshot: 5.0 }),
      ]

      const id = computed(() => 'e-1')
      const { resumen, cogsDesdeMovimientos } = useContabilidad(id)

      // COGS = (|−3| × 4.0) + (|−2| × 5.0) = 12 + 10 = 22
      expect(resumen.value.cogsConfiable).toBe(true)
      expect(resumen.value.totalCogs).toBe(22)
      expect(cogsDesdeMovimientos.value.confiable).toBe(true)
      expect(cogsDesdeMovimientos.value.total).toBe(22)
    })
  })

  it('COGS excludes movements for other eventos', () => {
    conContexto(() => {
      const store = useStockMovementsStore()
      store.movements = [
        mkMovement({ id: 'sm-1', evento_id: 'e-1', cantidad: -3, costo_unitario_snapshot: 4.0 }),
        mkMovement({ id: 'sm-2', evento_id: 'e-2', cantidad: -5, costo_unitario_snapshot: 10.0 }),
      ]

      const id = computed(() => 'e-1')
      const { resumen } = useContabilidad(id)

      // Only the e-1 movement matters.
      expect(resumen.value.cogsConfiable).toBe(true)
      expect(resumen.value.totalCogs).toBe(12)
    })
  })

  it('COGS excludes non-consumo movement types (compra, correccion, ajuste)', () => {
    conContexto(() => {
      const store = useStockMovementsStore()
      store.movements = [
        mkMovement({ id: 'sm-consumo', tipo: 'consumo', cantidad: -3, costo_unitario_snapshot: 4.0 }),
        mkMovement({ id: 'sm-compra', tipo: 'compra', cantidad: 10, costo_unitario_snapshot: 3.0, venta_id: null }),
        mkMovement({ id: 'sm-correccion', tipo: 'correccion', cantidad: 1, costo_unitario_snapshot: 4.0 }),
        mkMovement({ id: 'sm-ajuste', tipo: 'ajuste', cantidad: 3, costo_unitario_snapshot: 5.0, venta_id: null }),
      ]

      const id = computed(() => 'e-1')
      const { resumen } = useContabilidad(id)

      // Only the consumo movement is counted.
      expect(resumen.value.cogsConfiable).toBe(true)
      expect(resumen.value.totalCogs).toBe(12)
    })
  })

  it('COGS handles null costo_unitario_snapshot gracefully (treats as 0)', () => {
    conContexto(() => {
      const store = useStockMovementsStore()
      store.movements = [
        mkMovement({ id: 'sm-1', cantidad: -2, costo_unitario_snapshot: null }),
        mkMovement({ id: 'sm-2', cantidad: -3, costo_unitario_snapshot: 4.0 }),
      ]

      const id = computed(() => 'e-1')
      const { resumen } = useContabilidad(id)

      // (|−2| × 0) + (|−3| × 4) = 12
      expect(resumen.value.cogsConfiable).toBe(true)
      expect(resumen.value.totalCogs).toBe(12)
    })
  })

  it('returns ResumenContabilidad with all expected fields including cogsConfiable', () => {
    conContexto(() => {
      const id = computed(() => 'e-1')
      const { resumen } = useContabilidad(id)
      const r: ResumenContabilidad = resumen.value

      expect(r).toHaveProperty('totalVentas')
      expect(r).toHaveProperty('totalCogs')
      expect(r).toHaveProperty('cogsConfiable')
      expect(r).toHaveProperty('totalGastosFijos')
      expect(r).toHaveProperty('totalGastosImprevistos')
      expect(r).toHaveProperty('totalAportes')
      expect(r).toHaveProperty('totalCompras')
      expect(r).toHaveProperty('utilidadBruta')
      expect(r).toHaveProperty('utilidadNeta')
      expect(typeof r.cogsConfiable).toBe('boolean')
    })
  })

  it('cogsDesdeMovimientos is exposed in the return contract', () => {
    conContexto(() => {
      const id = computed(() => 'e-1')
      const result = useContabilidad(id)
      expect(result).toHaveProperty('cogsDesdeMovimientos')
      expect(result.cogsDesdeMovimientos.value).toEqual({
        total: 0,
        confiable: false,
      })
    })
  })

  it('null eventoId returns cogsConfiable=false with zero COGS', () => {
    conContexto(() => {
      const id = computed(() => null)
      const { resumen } = useContabilidad(id)
      expect(resumen.value.cogsConfiable).toBe(false)
      expect(resumen.value.totalCogs).toBe(0)
      expect(resumen.value.totalVentas).toBe(0)
    })
  })

  it('zero-quantity consumo movement does not affect COGS', () => {
    conContexto(() => {
      const store = useStockMovementsStore()
      store.movements = [
        mkMovement({ id: 'sm-1', cantidad: -0, costo_unitario_snapshot: 5.0 }),
        mkMovement({ id: 'sm-2', cantidad: -2, costo_unitario_snapshot: 4.0 }),
      ]

      const id = computed(() => 'e-1')
      const { resumen } = useContabilidad(id)

      // zero-quantity contributes 0 cost (Math.abs(0) × anything = 0)
      // plus 2 × 4 = 8
      expect(resumen.value.totalCogs).toBe(8)
    })
  })
})

// REQ-POS-37, REQ-POS-39, REQ-POS-44, REQ-POS-46, REQ-POS-54,
// REQ-POS-56: useGastosImprevistos composable — `storeToRefs` wrapper
// so views (PosView, CierresCajaView) can destructure reactive state
// without losing reactivity. Mirrors `useProductos` / `useGastosFijos`.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import type { Database, GastoImprevisto, GastoImprevistoInput } from '@/types'
import { useGastosImprevistos } from './useGastosImprevistos'

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

const mkGasto = (overrides: Partial<GastoImprevisto> = {}): GastoImprevisto => ({
  id: 'gi-1',
  evento_id: 'e-1',
  monto: 50,
  motivo: 'Compramos más vasos',
  categoria: 'insumos_extra',
  created_at: '2026-06-19T11:00:00Z',
  ...overrides,
})

const mkInput = (overrides: Partial<GastoImprevistoInput> = {}): GastoImprevistoInput => ({
  evento_id: 'e-1',
  monto: 50,
  motivo: 'Compramos más vasos',
  categoria: 'insumos_extra',
  ...overrides,
})

describe('useGastosImprevistos — reactive bridge (REQ-POS-44, REQ-POS-54)', () => {
  it('exposes empty reactive state on first read', () => {
    conContexto(() => {
      const { gastosPorEvento, gastos, cargando, error } = useGastosImprevistos()
      expect(gastosPorEvento.value.size).toBe(0)
      expect(gastos.value).toEqual([])
      expect(cargando.value).toBe(false)
      expect(error.value).toBeNull()
    })
  })

  it('cargarPorEvento fetches and stores gastos (REQ-POS-37)', async () => {
    __pushSupabaseResponse<GastoImprevisto[]>({
      data: [mkGasto(), mkGasto({ id: 'gi-2', monto: 30 })],
      error: null,
    })

    await conContexto(async () => {
      const composable = useGastosImprevistos()
      await composable.cargarPorEvento('e-1')

      expect(composable.gastosPorEvento.value.get('e-1')).toHaveLength(2)
      expect(composable.gastos.value).toHaveLength(2)
    })
  })

  it('crear writes through to the store and updates the reactive ref (REQ-POS-37)', async () => {
    __pushSupabaseResponse<GastoImprevisto>({
      data: mkGasto({ id: 'gi-new', monto: 75 }),
      error: null,
    })

    await conContexto(async () => {
      const composable = useGastosImprevistos()
      const resultado = await composable.crear(mkInput({ monto: 75 }))

      expect(resultado.error).toBeNull()
      expect(composable.gastosPorEvento.value.get('e-1')?.[0]?.id).toBe('gi-new')
    })
  })

  it('totalPorEvento returns a computed sum (REQ-POS-37)', () => {
    conContexto(() => {
      const composable = useGastosImprevistos()
      composable.gastosPorEvento.value.set('e-1', [
        mkGasto({ monto: 10 }),
        mkGasto({ id: 'gi-2', monto: 20 }),
      ])
      const total = composable.totalPorEvento('e-1')
      expect(total.value).toBe(30)
    })
  })
})
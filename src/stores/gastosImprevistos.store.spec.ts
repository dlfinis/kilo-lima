// REQ-POS-37, REQ-POS-38, REQ-POS-44, REQ-POS-56: gastosImprevistos
// store PR1 skeleton. Verifies the reactive state shape is wired.
// CRUD + EVENTO_CERRADO guard land in PR4.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, GastoImprevisto } from '@/types'
import { useGastosImprevistosStore } from './gastosImprevistos.store'

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

const mkImprevisto = (overrides: Partial<GastoImprevisto> = {}): GastoImprevisto => ({
  id: 'gi-1',
  evento_id: 'e-1',
  monto: 50,
  motivo: 'Compramos más vasos',
  categoria: 'insumos_extra',
  created_at: '2026-06-19T11:00:00Z',
  ...overrides,
})

describe('useGastosImprevistosStore — state shape (PR1 skeleton)', () => {
  it('starts with empty gastos and null error (REQ-POS-44)', () => {
    conContexto(() => {
      const store = useGastosImprevistosStore()
      expect(store.gastos).toEqual([])
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('can hold a GastoImprevisto row (REQ-POS-44)', () => {
    conContexto(() => {
      const store = useGastosImprevistosStore()
      store.gastos = [mkImprevisto()]
      expect(store.gastos).toHaveLength(1)
      expect(store.gastos[0]?.categoria).toBe('insumos_extra')
    })
  })
})

// REQ-POS-32, REQ-POS-33, REQ-POS-35, REQ-POS-44, REQ-POS-56:
// cierresCaja store PR1 skeleton. Verifies the reactive state shape
// is wired (one cierre per evento). UNIQUE(evento_id) handling +
// transicion forward land in PR4.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CierreCaja, Database } from '@/types'
import { useCierresCajaStore } from './cierresCaja.store'

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

const mkCierre = (overrides: Partial<CierreCaja> = {}): CierreCaja => ({
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
  ...overrides,
})

describe('useCierresCajaStore — state shape (PR1 skeleton)', () => {
  it('starts with null cierre and null error (REQ-POS-32, REQ-POS-44)', () => {
    conContexto(() => {
      const store = useCierresCajaStore()
      expect(store.cierre).toBeNull()
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('can hold a CierreCaja row (REQ-POS-44)', () => {
    conContexto(() => {
      const store = useCierresCajaStore()
      store.cierre = mkCierre()
      expect(store.cierre?.total_ventas).toBe(100)
      expect(store.cierre?.diferencia).toBe(-2)
    })
  })
})

// REQ-POS-37, REQ-POS-38, REQ-POS-39, REQ-POS-44, REQ-POS-52,
// REQ-POS-53, REQ-POS-55, REQ-POS-56: gastosImprevistos store —
// per-evento CRUD with EVENTO_CERRADO gate. State is a
// `Map<eventoId, GastoImprevisto[]>` (matches gastosFijos pattern)
// plus a computed flat `gastos` accessor for backwards-compat with
// PR1's surface.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import type { Database, Evento, GastoImprevisto, GastoImprevistoInput } from '@/types'
import { useGastosImprevistosStore } from './gastosImprevistos.store'
import { useEventsStore } from './events.store'

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

const mkEvento = (id: string, overrides: Partial<Evento> = {}): Evento => ({
  id,
  nombre: 'Feria',
  fecha: '2026-07-15',
  fecha_fin: null,
  margen_ganancia: null,
  ubicacion: 'Plaza',
  estado: 'en_curso',
  notas: null,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
  ...overrides,
})

describe('useGastosImprevistosStore', () => {
  it('starts with empty gastosPorEvento, cargando=false, error=null (REQ-POS-44)', () => {
    conContexto(() => {
      const store = useGastosImprevistosStore()
      expect(store.gastosPorEvento.size).toBe(0)
      expect(store.gastos).toEqual([])
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('cargarPorEvento fetches and stores the gastos (REQ-POS-37)', async () => {
    __pushSupabaseResponse<GastoImprevisto[]>({
      data: [mkGasto(), mkGasto({ id: 'gi-2', monto: 30 })],
      error: null,
    })

    await conContexto(async () => {
      const store = useGastosImprevistosStore()
      await store.cargarPorEvento('e-1')

      expect(store.gastosPorEvento.get('e-1')).toHaveLength(2)
      expect(store.gastos).toHaveLength(2)
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('cargarPorEvento surfaces supabase errors in Spanish (REQ-POS-53)', async () => {
    __pushSupabaseResponse<GastoImprevisto[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection refused' },
    })

    await conContexto(async () => {
      const store = useGastosImprevistosStore()
      await store.cargarPorEvento('e-1')

      expect(store.error).toMatch(/Error al cargar/)
      expect(store.gastosPorEvento.get('e-1')).toBeUndefined()
    })
  })

  it('crear prepends the new gasto (REQ-POS-37)', async () => {
    const creado = mkGasto({ id: 'gi-new', monto: 75 })
    __pushSupabaseResponse<GastoImprevisto>({ data: creado, error: null })

    await conContexto(async () => {
      const store = useGastosImprevistosStore()
      const resultado = await store.crear(mkInput({ monto: 75 }))

      expect(resultado.error).toBeNull()
      expect(store.gastosPorEvento.get('e-1')?.[0]?.id).toBe('gi-new')
    })
  })

  it('crear blocks when the parent evento is cerrado (REQ-POS-39)', async () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', { estado: 'cerrado' }))
    })

    await conContexto(async () => {
      const store = useGastosImprevistosStore()
      const resultado = await store.crear(mkInput())

      expect(resultado.error?.code).toBe('EVENTO_CERRADO')
      expect(store.error).toMatch(/cerrado/)
      expect(store.gastosPorEvento.get('e-1')).toBeUndefined()
    })
  })

  it('eliminar removes the matching gasto (REQ-POS-37)', async () => {
    __pushSupabaseResponse<null>({ data: null, error: null })

    await conContexto(async () => {
      const store = useGastosImprevistosStore()
      store.gastosPorEvento.set('e-1', [mkGasto(), mkGasto({ id: 'gi-2' })])

      const resultado = await store.eliminar('gi-1')

      expect(resultado.error).toBeNull()
      expect(store.gastosPorEvento.get('e-1')).toHaveLength(1)
      expect(store.gastosPorEvento.get('e-1')?.[0]?.id).toBe('gi-2')
    })
  })

  it('eliminar blocks when the parent evento is cerrado (REQ-POS-39)', async () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', { estado: 'cerrado' }))
    })
    await conContexto(() => {
      const store = useGastosImprevistosStore()
      store.gastosPorEvento.set('e-1', [mkGasto()])
    })

    await conContexto(async () => {
      const store = useGastosImprevistosStore()
      const resultado = await store.eliminar('gi-1')

      expect(resultado.error?.code).toBe('EVENTO_CERRADO')
      expect(store.gastosPorEvento.get('e-1')).toHaveLength(1)
    })
  })

  it('totalPorEvento returns a computed sum rounded to centavos (REQ-POS-37)', () => {
    conContexto(() => {
      const store = useGastosImprevistosStore()
      store.gastosPorEvento.set('e-1', [
        mkGasto({ monto: 10.005 }),
        mkGasto({ id: 'gi-2', monto: 20.005 }),
      ])
      const total = store.totalPorEvento('e-1')
      expect(total.value).toBe(30.01)
    })
  })

  it('gastos (computed) reflects the latest per-evento list (REQ-POS-44)', () => {
    conContexto(() => {
      const store = useGastosImprevistosStore()
      store.gastosPorEvento.set('e-1', [mkGasto(), mkGasto({ id: 'gi-2' })])
      expect(store.gastos).toHaveLength(2)
      expect(store.gastos[0]?.motivo).toBe('Compramos más vasos')
    })
  })
})
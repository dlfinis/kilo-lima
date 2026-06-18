// REQ-EVENTS-10, REQ-EVENTS-11, REQ-EVENTS-14, REQ-EVENTS-26,
// REQ-EVENTS-40, REQ-EVENTS-42, REQ-EVENTS-44, REQ-EVENTS-46:
// gastos fijos store — keyed by `evento_id` in a Map so multiple
// views can read gastos in O(1). Cross-store READ only: the freeze
// gate (`estadoEsEditable`) reads the parent evento's estado from
// `useEventsStore().eventoActual` (REQ-EVENTS-26) but never writes.
//
// `totalPorEvento(id)` returns a ComputedRef<number> for the detail
// view + projection composable — same pattern as recipes.costoPorReceta.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'

import {
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import type { Evento, GastoFijo, GastoFijoInput } from '@/types'
import { useEventsStore } from './events.store'
import { useGastosFijosStore } from './gastosFijos.store'

const mkEvento = (id: string, estado: Evento['estado'] = 'planificacion'): Evento => ({
  id,
  nombre: 'Feria',
  fecha: '2026-07-15',
  ubicacion: null,
  estado,
  notas: null,
  created_at: '2026-06-18T00:00:00Z',
  updated_at: '2026-06-18T00:00:00Z',
})

const mkGasto = (id: string, overrides: Partial<GastoFijo> = {}): GastoFijo => ({
  id,
  evento_id: 'e-1',
  categoria: 'renta',
  monto: 100,
  descripcion: null,
  created_at: '2026-06-18T00:00:00Z',
  ...overrides,
})

const mkInput = (overrides: Partial<GastoFijoInput> = {}): GastoFijoInput => ({
  evento_id: 'e-1',
  categoria: 'renta',
  monto: 100,
  descripcion: null,
  ...overrides,
})

let aplicacion: App

beforeEach(() => {
  setActivePinia(createPinia())
  __resetSupabaseMock()
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide('supabase', createClient('http://x', 'anon'))
})

function conContexto<T>(callback: () => T): T {
  return aplicacion.runWithContext(callback)
}

describe('useGastosFijosStore', () => {
  it('starts with an empty Map (REQ-EVENTS-14)', () => {
    conContexto(() => {
      const store = useGastosFijosStore()
      expect(store.gastosPorEvento.size).toBe(0)
    })
  })

  it('cargarPorEvento fetches and stores gastos in the Map (REQ-EVENTS-10)', async () => {
    __pushSupabaseResponse<GastoFijo[]>({
      data: [mkGasto('g-1', { monto: 500 }), mkGasto('g-2', { monto: 200, categoria: 'transporte' })],
      error: null,
    })
    await conContexto(async () => {
      const store = useGastosFijosStore()
      await store.cargarPorEvento('e-1')

      expect(store.gastosPorEvento.get('e-1')).toHaveLength(2)
    })
  })

  it('agregar prepends a new gasto on success (REQ-EVENTS-10)', async () => {
    const creado = mkGasto('g-new', { monto: 300 })
    __pushSupabaseResponse<GastoFijo>({ data: creado, error: null })
    await conContexto(async () => {
      const store = useGastosFijosStore()
      const resultado = await store.agregar(mkInput({ monto: 300 }))

      expect(resultado.error).toBeNull()
      expect(store.gastosPorEvento.get('e-1')?.[0]?.monto).toBe(300)
    })
  })

  it('actualizar mutates the matching gasto in place (REQ-EVENTS-11)', async () => {
    const actualizado = mkGasto('g-1', { monto: 250 })
    __pushSupabaseResponse<GastoFijo>({ data: actualizado, error: null })
    await conContexto(async () => {
      const store = useGastosFijosStore()
      store.gastosPorEvento.set('e-1', [mkGasto('g-1', { monto: 100 })])

      const resultado = await store.actualizar('g-1', { ...mkInput(), monto: 250 })

      expect(resultado.error).toBeNull()
      expect(store.gastosPorEvento.get('e-1')?.[0]?.monto).toBe(250)
    })
  })

  it('eliminar removes the gasto (REQ-EVENTS-11)', async () => {
    __pushSupabaseResponse<null>({ data: null, error: null })
    await conContexto(async () => {
      const store = useGastosFijosStore()
      store.gastosPorEvento.set('e-1', [mkGasto('g-1')])

      const resultado = await store.eliminar('g-1')

      expect(resultado.error).toBeNull()
      expect(store.gastosPorEvento.get('e-1')).toEqual([])
    })
  })

  it('totalPorEvento sums the gastos and rounds to 2 decimals (REQ-EVENTS-14)', async () => {
    await conContexto(async () => {
      const store = useGastosFijosStore()
      store.gastosPorEvento.set('e-1', [
        mkGasto('g-1', { monto: 500 }),
        mkGasto('g-2', { monto: 200.555 }),
        mkGasto('g-3', { monto: 49.445 }),
      ])

      expect(store.totalPorEvento('e-1').value).toBe(750)
    })
  })

  it('totalPorEvento returns 0 when there are no gastos (REQ-EVENTS-14)', async () => {
    await conContexto(async () => {
      const store = useGastosFijosStore()
      expect(store.totalPorEvento('e-1').value).toBe(0)
    })
  })

  it('agregar blocks on EVENTO_CERRADO when eventoActual is cerrado (REQ-EVENTS-26)', async () => {
    await conContexto(async () => {
      const events = useEventsStore()
      events.eventoActual = mkEvento('e-1', 'cerrado')

      const store = useGastosFijosStore()
      const resultado = await store.agregar(mkInput())

      expect(resultado.error?.code).toBe('EVENTO_CERRADO')
    })
  })

  it('eliminar blocks on EVENTO_CERRADO when eventoActual is cerrado (REQ-EVENTS-26)', async () => {
    await conContexto(async () => {
      const events = useEventsStore()
      events.eventoActual = mkEvento('e-1', 'cerrado')

      const store = useGastosFijosStore()
      store.gastosPorEvento.set('e-1', [mkGasto('g-1')])
      const resultado = await store.eliminar('g-1')

      expect(resultado.error?.code).toBe('EVENTO_CERRADO')
    })
  })
})

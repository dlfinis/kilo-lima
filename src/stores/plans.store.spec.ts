// REQ-EVENTS-15, REQ-EVENTS-16, REQ-EVENTS-19, REQ-EVENTS-26,
// REQ-EVENTS-40, REQ-EVENTS-42, REQ-EVENTS-44, REQ-EVENTS-46: plans
// store wires the factory-built service into Pinia reactive state.
// State is `planesPorEvento: Map<eventoId, PlanProduccion[]>` so
// multiple views can read a plan in O(1) and the projection composable
// can filter by evento_id without scanning every row (REQ-EVENTS-40
// SRP — this store owns plan_produccion only).
//
// `guardarPlan` calls `reemplazarTodos` (delete-then-insert two-call
// flow per REQ-EVENTS-19). The freeze gate (`estadoEsEditable`) reads
// `useEventsStore().eventoActual.estado` (cross-store READ only,
// REQ-EVENTS-40 / REQ-EVENTS-46) and returns `EVENTO_CERRADO` before
// any supabase call when the evento is cerrado.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'

import {
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import type { Evento, PlanProduccion, ServiceError } from '@/types'
import { usePlansStore } from './plans.store'

const mkEvento = (id: string, overrides: Partial<Evento> = {}): Evento => ({
  id,
  nombre: 'Feria del Sol',
  fecha: '2026-07-15',
  ubicacion: null,
  estado: 'planificacion',
  notas: null,
  created_at: '2026-06-18T00:00:00Z',
  updated_at: '2026-06-18T00:00:00Z',
  ...overrides,
})

const mkPlan = (id: string, overrides: Partial<PlanProduccion> = {}): PlanProduccion => ({
  id,
  evento_id: 'e-1',
  receta_id: 'r-1',
  unidades_a_producir: 10,
  created_at: '2026-06-18T00:00:00Z',
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

async function cargarEventoEnStore(evento: Evento) {
  const { useEventsStore } = await import('@/stores/events.store')
  await conContexto(async () => {
    useEventsStore().eventos.push(evento)
    useEventsStore().eventoActual = evento
  })
}

describe('usePlansStore', () => {
  it('starts with empty planesPorEvento, cargando=false, error=null', () => {
    conContexto(() => {
      const store = usePlansStore()
      expect(store.planesPorEvento.size).toBe(0)
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('cargarPorEvento fetches the plan rows and stores them keyed by eventoId (REQ-EVENTS-15, REQ-EVENTS-44)', async () => {
    __pushSupabaseResponse<PlanProduccion[]>({
      data: [mkPlan('p-1'), mkPlan('p-2', { receta_id: 'r-2' })],
      error: null,
    })
    await conContexto(async () => {
      const store = usePlansStore()
      await store.cargarPorEvento('e-1')

      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
      const plan = store.planesPorEvento.get('e-1') ?? []
      expect(plan).toHaveLength(2)
    })
  })

  it('cargarPorEvento surfaces supabase errors in Spanish (REQ-EVENTS-42)', async () => {
    __pushSupabaseResponse<PlanProduccion[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection refused' },
    })
    await conContexto(async () => {
      const store = usePlansStore()
      await store.cargarPorEvento('e-1')

      expect(store.error).toMatch(/Error al cargar el plan/)
      expect(store.planesPorEvento.get('e-1')).toBeUndefined()
    })
  })

  it('guardarPlan calls reemplazarTodos and replaces the plan rows in the Map (REQ-EVENTS-19)', async () => {
    __pushSupabaseResponse<null>({ data: null, error: null }) // delete
    __pushSupabaseResponse<PlanProduccion[]>({
      data: [
        mkPlan('p-new-1', { receta_id: 'r-1', unidades_a_producir: 20 }),
        mkPlan('p-new-2', { receta_id: 'r-2', unidades_a_producir: 30 }),
      ],
      error: null,
    }) // insert
    await cargarEventoEnStore(mkEvento('e-1'))

    await conContexto(async () => {
      const store = usePlansStore()
      store.planesPorEvento.set('e-1', [mkPlan('p-old', { receta_id: 'r-1' })])

      const resultado = await store.guardarPlan('e-1', [
        { evento_id: 'e-1', receta_id: 'r-1', unidades_a_producir: 20 },
        { evento_id: 'e-1', receta_id: 'r-2', unidades_a_producir: 30 },
      ])

      expect(resultado.error).toBeNull()
      const plan = store.planesPorEvento.get('e-1') ?? []
      expect(plan).toHaveLength(2)
      expect(plan.map((p) => p.receta_id)).toEqual(['r-1', 'r-2'])
    })
  })

  it('guardarPlan returns EVENTO_CERRADO without calling supabase when the evento is cerrado (REQ-EVENTS-26, REQ-EVENTS-46)', async () => {
    await cargarEventoEnStore(mkEvento('e-1', { estado: 'cerrado' }))
    await conContexto(async () => {
      const store = usePlansStore()

      const resultado = await store.guardarPlan('e-1', [
        { evento_id: 'e-1', receta_id: 'r-1', unidades_a_producir: 5 },
      ])

      expect(resultado.error?.code).toBe('EVENTO_CERRADO')
      expect(resultado.data).toBeNull()
      // No supabase call was made — the gate fires first.
      const { __getSupabaseMockCalls } = await import('../../tests/setup')
      expect(__getSupabaseMockCalls().some((l) => l.metodo === 'delete')).toBe(false)
      expect(__getSupabaseMockCalls().some((l) => l.metodo === 'insert')).toBe(false)
    })
  })

  it('guardarPlan surfaces reemplazarTodos insert failures verbatim (REQ-EVENTS-19, REQ-EVENTS-42)', async () => {
    __pushSupabaseResponse<null>({ data: null, error: null }) // delete OK
    __pushSupabaseResponse<PlanProduccion[]>({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    }) // insert fails
    await cargarEventoEnStore(mkEvento('e-1'))

    await conContexto(async () => {
      const store = usePlansStore()
      store.planesPorEvento.set('e-1', [mkPlan('p-1')])

      const resultado = await store.guardarPlan('e-1', [
        { evento_id: 'e-1', receta_id: 'r-1', unidades_a_producir: 5 },
      ])

      expect(resultado.error?.code).toBe('23505')
      expect(resultado.data).toBeNull()
      // After the destructive flow the local plan is cleared so the
      // user sees an empty grid (matches REQ-EVENTS-19 contract).
      expect(store.planesPorEvento.get('e-1')).toEqual([])
    })
  })

  it('eliminar removes a single plan row from the Map (REQ-EVENTS-15)', async () => {
    __pushSupabaseResponse<null>({ data: null, error: null })
    await cargarEventoEnStore(mkEvento('e-1'))

    await conContexto(async () => {
      const store = usePlansStore()
      store.planesPorEvento.set('e-1', [mkPlan('p-1'), mkPlan('p-2')])

      const resultado = await store.eliminar('p-1')

      expect(resultado.error).toBeNull()
      const plan = store.planesPorEvento.get('e-1') ?? []
      expect(plan).toHaveLength(1)
      expect(plan[0]?.id).toBe('p-2')
    })
  })

  it('eliminar returns EVENTO_CERRADO without calling supabase when the parent evento is cerrado (REQ-EVENTS-26)', async () => {
    await cargarEventoEnStore(mkEvento('e-1', { estado: 'cerrado' }))
    await conContexto(async () => {
      const store = usePlansStore()
      store.planesPorEvento.set('e-1', [mkPlan('p-1')])

      const resultado = await store.eliminar('p-1')

      const err = resultado.error as ServiceError | null
      expect(err?.code).toBe('EVENTO_CERRADO')
      expect(store.planesPorEvento.get('e-1')).toHaveLength(1)
    })
  })

  it('manages only plan_produccion — no evento CRUD actions (REQ-EVENTS-40)', () => {
    conContexto(() => {
      const store = usePlansStore()
      const claves = Object.keys(store)
      expect(claves.some((k) => /crearEvento|eliminarEvento|cambiarEstado/.test(k))).toBe(false)
    })
  })
})
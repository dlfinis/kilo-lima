// REQ-EVENTS-1, REQ-EVENTS-2, REQ-EVENTS-3, REQ-EVENTS-4,
// REQ-EVENTS-5, REQ-EVENTS-6, REQ-EVENTS-7, REQ-EVENTS-40,
// REQ-EVENTS-42, REQ-EVENTS-44, REQ-EVENTS-46: events store wires the
// factory-built service into Pinia reactive state. SRP: this store owns
// eventos only — `gastos_fijos` lives in its own store (PR2a decision:
// gastosPorEvento is a Map keyed by evento_id so the detail view and
// the projection composable can read gastos in O(1)).
//
// `cambiarEstado` reads the current `estado` from `eventoActual` and
// passes both endpoints to the service so the service-level gate
// (transicionEstadoValida) can reject invalid moves without an extra
// fetch. The store mirrors the new estado on `eventoActual` for
// reactivity on subsequent reads.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'

import {
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import type { Evento, EventoInput } from '@/types'
import { useEventsStore } from './events.store'

const mkEvento = (id: string, overrides: Partial<Evento> = {}): Evento => ({
  id,
  nombre: 'Feria del Sol',
  fecha: '2026-07-15',
  fecha_fin: null,
  margen_ganancia: null,
  ubicacion: 'Plaza Central',
  estado: 'planificacion',
  notas: null,
  created_at: '2026-06-18T00:00:00Z',
  updated_at: '2026-06-18T00:00:00Z',
  ...overrides,
})

const mkInput = (overrides: Partial<EventoInput> = {}): EventoInput => ({
  nombre: 'Feria del Sol',
  fecha: '2026-07-15',
  fecha_fin: null,
  margen_ganancia: null,
  ubicacion: 'Plaza Central',
  estado: 'planificacion',
  notas: null,
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

describe('useEventsStore', () => {
  it('starts empty with cargando=false and error=null', () => {
    conContexto(() => {
      const store = useEventsStore()
      expect(store.eventos).toEqual([])
      expect(store.eventoActual).toBeNull()
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('cargarTodas fetches eventos ordered by fecha desc (REQ-EVENTS-1, REQ-EVENTS-9)', async () => {
    __pushSupabaseResponse<Evento[]>({
      data: [mkEvento('e-1', { fecha: '2026-07-20' }), mkEvento('e-2', { fecha: '2026-05-10' })],
      error: null,
    })
    await conContexto(async () => {
      const store = useEventsStore()
      await store.cargarTodas()

      expect(store.eventos).toHaveLength(2)
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('cargarTodas surfaces supabase errors in Spanish (REQ-EVENTS-7)', async () => {
    __pushSupabaseResponse<Evento[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection refused' },
    })
    await conContexto(async () => {
      const store = useEventsStore()
      await store.cargarTodas()

      expect(store.error).toMatch(/Error al cargar los eventos/)
      expect(store.eventos).toEqual([])
    })
  })

  it('crear prepends the new evento (REQ-EVENTS-2)', async () => {
    const creada = mkEvento('e-new', { nombre: 'Feria Abril' })
    __pushSupabaseResponse<Evento>({ data: creada, error: null })
    await conContexto(async () => {
      const store = useEventsStore()
      store.eventos.push(mkEvento('e-1', { nombre: 'Existente' }))

      const resultado = await store.crear(mkInput({ nombre: 'Feria Abril' }))

      expect(resultado.error).toBeNull()
      expect(store.eventos).toHaveLength(2)
      expect(store.eventos[0]?.nombre).toBe('Feria Abril')
    })
  })

  it('actualizar mutates the matching evento in place (REQ-EVENTS-3)', async () => {
    const evento = mkEvento('e-1', { nombre: 'Original' })
    const actualizada = { ...evento, nombre: 'Editado' }
    __pushSupabaseResponse<Evento>({ data: actualizada, error: null })
    await conContexto(async () => {
      const store = useEventsStore()
      store.eventos.push(evento)

      const resultado = await store.actualizar('e-1', { ...mkInput(), nombre: 'Editado' })

      expect(resultado.error).toBeNull()
      expect(store.eventos[0]?.nombre).toBe('Editado')
    })
  })

  it('actualizar forwards fecha_fin through to the service (REQ-FIN-1, REQ-FIN-2)', async () => {
    const evento = mkEvento('e-1', { fecha: '2026-07-15', fecha_fin: null })
    const actualizada: Evento = { ...evento, fecha_fin: '2026-07-22' }
    __pushSupabaseResponse<Evento>({ data: actualizada, error: null })
    await conContexto(async () => {
      const store = useEventsStore()
      store.eventos.push(evento)

      const resultado = await store.actualizar('e-1', {
        ...mkInput(),
        fecha: '2026-07-15',
        fecha_fin: '2026-07-22',
      })

      expect(resultado.error).toBeNull()
      expect(store.eventos[0]?.fecha_fin).toBe('2026-07-22')
    })
  })

  it('actualizar forwards margen_ganancia through to the service (REQ-FIN, PD-1)', async () => {
    const evento = mkEvento('e-1', { margen_ganancia: null })
    const actualizada: Evento = { ...evento, margen_ganancia: 0.55 }
    __pushSupabaseResponse<Evento>({ data: actualizada, error: null })
    await conContexto(async () => {
      const store = useEventsStore()
      store.eventos.push(evento)

      const resultado = await store.actualizar('e-1', {
        ...mkInput(),
        margen_ganancia: 0.55,
      })

      expect(resultado.error).toBeNull()
      expect(store.eventos[0]?.margen_ganancia).toBeCloseTo(0.55, 4)
    })
  })

  it('cambiarEstado updates estado on a valid transition (REQ-EVENTS-5, REQ-EVENTS-6)', async () => {
    const actualizada = mkEvento('e-1', { estado: 'en_curso' })
    __pushSupabaseResponse<Evento>({ data: actualizada, error: null })
    await conContexto(async () => {
      const store = useEventsStore()
      store.eventos.push(mkEvento('e-1', { estado: 'planificacion' }))

      const resultado = await store.cambiarEstado('e-1', 'en_curso')

      expect(resultado.error).toBeNull()
      expect(store.eventos[0]?.estado).toBe('en_curso')
    })
  })

  it('cambiarEstado rejects invalid transitions with TRANSICION_INVALIDA (REQ-EVENTS-6)', async () => {
    await conContexto(async () => {
      const store = useEventsStore()
      store.eventos.push(mkEvento('e-1', { estado: 'cerrado' }))

      const resultado = await store.cambiarEstado('e-1', 'planificacion')

      expect(resultado.error?.code).toBe('TRANSICION_INVALIDA')
      expect(store.eventos[0]?.estado).toBe('cerrado')
    })
  })

  it('eliminar removes the matching evento (REQ-EVENTS-4)', async () => {
    __pushSupabaseResponse<null>({ data: null, error: null })
    await conContexto(async () => {
      const store = useEventsStore()
      store.eventos.push(mkEvento('e-1', { nombre: 'Cancelada' }))

      const resultado = await store.eliminar('e-1')

      expect(resultado.error).toBeNull()
      expect(store.eventos).toEqual([])
    })
  })

  it('cargarPorId sets eventoActual (REQ-EVENTS-7)', async () => {
    const evento = mkEvento('e-1', { nombre: 'Detalle' })
    __pushSupabaseResponse<Evento>({ data: evento, error: null })
    await conContexto(async () => {
      const store = useEventsStore()

      await store.cargarPorId('e-1')

      expect(store.eventoActual?.id).toBe('e-1')
      expect(store.eventoActual?.nombre).toBe('Detalle')
    })
  })

  it('manages only eventos — no gastos state (REQ-EVENTS-40)', () => {
    conContexto(() => {
      const store = useEventsStore()
      const claves = Object.keys(store)
      expect(claves.some((k) => /gastos/i.test(k))).toBe(false)
    })
  })
})

// REQ-EVENTS-1, REQ-EVENTS-2, REQ-EVENTS-3, REQ-EVENTS-4, REQ-EVENTS-5,
// REQ-EVENTS-6, REQ-EVENTS-41, REQ-EVENTS-42: events service contract —
// factory pattern with `crearEventsService(supabase)`. The service never
// throws, returns `{ data, error }`, and `cambiarEstado` gates the
// transition via `transicionEstadoValida` so an invalid move (e.g.,
// `en_curso → planificacion`, idempotent same→same) is rejected before
// Supabase sees the request.
import { beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

import {
  __getSupabaseMockCalls,
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import type { Evento, EventoInput, ServiceError } from '@/types'
import { crearEventsService } from './events.service'

const mkEvento = (id: string, overrides: Partial<Evento> = {}): Evento => ({
  id,
  nombre: 'Feria del Sol',
  fecha: '2026-07-15',
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
  ubicacion: 'Plaza Central',
  estado: 'planificacion',
  notas: null,
  ...overrides,
})

const makeService = () => crearEventsService(createClient('http://x', 'anon'))

describe('crearEventsService', () => {
  beforeEach(() => {
    __resetSupabaseMock()
  })

  describe('listar', () => {
    it('returns the eventos ordered by fecha desc (REQ-EVENTS-1, REQ-EVENTS-9)', async () => {
      __pushSupabaseResponse<Evento[]>({
        data: [mkEvento('e-1', { fecha: '2026-07-20' }), mkEvento('e-2', { fecha: '2026-05-10' })],
        error: null,
      })

      const { data, error } = await makeService().listar()

      expect(error).toBeNull()
      expect(data).toHaveLength(2)
      const llamadas = __getSupabaseMockCalls()
      expect(llamadas.some((l) => l.metodo === 'from' && l.args[0] === 'eventos')).toBe(true)
      expect(llamadas.some((l) => l.metodo === 'order')).toBe(true)
    })

    it('returns { data: null, error } on supabase failure (REQ-EVENTS-42)', async () => {
      __pushSupabaseResponse<Evento[]>({
        data: null,
        error: { code: 'PGRST301', message: 'connection refused' },
      })

      const { data, error } = await makeService().listar()

      expect(data).toBeNull()
      expect(error?.code).toBe('PGRST301')
    })
  })

  describe('crear', () => {
    it('inserts and returns the new evento (REQ-EVENTS-2)', async () => {
      const creada = mkEvento('e-new', { nombre: 'Feria Abril' })
      __pushSupabaseResponse<Evento>({ data: creada, error: null })

      const { data, error } = await makeService().crear(mkInput({ nombre: 'Feria Abril' }))

      expect(error).toBeNull()
      expect(data).toEqual(creada)
      const insercion = __getSupabaseMockCalls().find((l) => l.metodo === 'insert')
      expect(insercion?.args[0]).toEqual(expect.objectContaining({ nombre: 'Feria Abril' }))
    })
  })

  describe('actualizar', () => {
    it('updates the evento row (REQ-EVENTS-3)', async () => {
      const actualizada = mkEvento('e-1', { nombre: 'Feria del Sol v2' })
      __pushSupabaseResponse<Evento>({ data: actualizada, error: null })

      const { data, error } = await makeService().actualizar('e-1', {
        ...mkInput(),
        nombre: 'Feria del Sol v2',
      })

      expect(error).toBeNull()
      expect(data).toEqual(actualizada)
    })
  })

  describe('cambiarEstado', () => {
    it('updates estado when the transition is valid (REQ-EVENTS-6)', async () => {
      const actualizado = mkEvento('e-1', { estado: 'en_curso' })
      __pushSupabaseResponse<Evento>({ data: actualizado, error: null })

      const { data, error } = await makeService().cambiarEstado('e-1', 'planificacion', 'en_curso')

      expect(error).toBeNull()
      expect(data?.estado).toBe('en_curso')
    })

    it('rejects invalid transitions with TRANSICION_INVALIDA (REQ-EVENTS-6)', async () => {
      const { data, error } = await makeService().cambiarEstado('e-1', 'en_curso', 'planificacion')

      expect(data).toBeNull()
      expect(error?.code).toBe('TRANSICION_INVALIDA')
      expect(__getSupabaseMockCalls().some((l) => l.metodo === 'update')).toBe(false)
    })

    it('rejects idempotent same → same with TRANSICION_INVALIDA (REQ-EVENTS-6)', async () => {
      const { data, error } = await makeService().cambiarEstado('e-1', 'planificacion', 'planificacion')

      expect(data).toBeNull()
      expect(error?.code).toBe('TRANSICION_INVALIDA')
    })
  })

  describe('eliminar', () => {
    it('deletes the evento (CASCADE handled by DB) (REQ-EVENTS-4)', async () => {
      __pushSupabaseResponse<null>({ data: null, error: null })

      const { data, error } = await makeService().eliminar('e-1')

      expect(error).toBeNull()
      expect(data).toBeNull()
      const llamadas = __getSupabaseMockCalls()
      expect(llamadas.map((l) => l.metodo)).toEqual(['from', 'delete', 'eq'])
    })

    it('surfaces supabase errors verbatim (REQ-EVENTS-42)', async () => {
      const err: ServiceError = { code: '23503', message: 'fk violation' }
      __pushSupabaseResponse<null>({ data: null, error: err })

      const { data, error } = await makeService().eliminar('e-1')

      expect(data).toBeNull()
      expect(error?.code).toBe('23503')
    })
  })
})

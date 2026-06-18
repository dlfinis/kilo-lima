// REQ-EVENTS-10, REQ-EVENTS-11, REQ-EVENTS-12, REQ-EVENTS-13,
// REQ-EVENTS-41, REQ-EVENTS-42: gastos fijos service contract — factory
// pattern, scoped per evento. Never-throw with `{ data, error }`. The
// store layer is the one that enforces `estadoEsEditable` for the freeze
// rule; the service stays event-agnostic and accepts any gasto CRUD.
import { beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

import {
  __getSupabaseMockCalls,
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import type { GastoFijo, GastoFijoInput } from '@/types'
import { crearGastosFijosService } from './gastosFijos.service'

const mkGasto = (id: string, overrides: Partial<GastoFijo> = {}): GastoFijo => ({
  id,
  evento_id: 'e-1',
  categoria: 'renta',
  monto: 500,
  descripcion: 'Alquiler del local',
  created_at: '2026-06-18T00:00:00Z',
  ...overrides,
})

const mkInput = (overrides: Partial<GastoFijoInput> = {}): GastoFijoInput => ({
  evento_id: 'e-1',
  categoria: 'renta',
  monto: 500,
  descripcion: 'Alquiler del local',
  ...overrides,
})

const makeService = () => crearGastosFijosService(createClient('http://x', 'anon'))

describe('crearGastosFijosService', () => {
  beforeEach(() => {
    __resetSupabaseMock()
  })

  describe('listarPorEvento', () => {
    it('scopes the query to the evento via eq("evento_id", id) (REQ-EVENTS-10)', async () => {
      __pushSupabaseResponse<GastoFijo[]>({
        data: [mkGasto('g-1'), mkGasto('g-2', { categoria: 'transporte' })],
        error: null,
      })

      const { data, error } = await makeService().listarPorEvento('e-1')

      expect(error).toBeNull()
      expect(data).toHaveLength(2)
      const llamadas = __getSupabaseMockCalls()
      expect(llamadas.some((l) => l.metodo === 'from' && l.args[0] === 'gastos_fijos')).toBe(true)
      const eq = llamadas.find((l) => l.metodo === 'eq')
      expect(eq?.args).toEqual(['evento_id', 'e-1'])
    })

    it('returns { data: null, error } on supabase failure (REQ-EVENTS-42)', async () => {
      __pushSupabaseResponse<GastoFijo[]>({
        data: null,
        error: { code: 'PGRST301', message: 'connection refused' },
      })

      const { data, error } = await makeService().listarPorEvento('e-1')

      expect(data).toBeNull()
      expect(error?.code).toBe('PGRST301')
    })
  })

  describe('crear', () => {
    it('inserts and returns the new gasto (REQ-EVENTS-10)', async () => {
      const creado = mkGasto('g-new', { monto: 200 })
      __pushSupabaseResponse<GastoFijo>({ data: creado, error: null })

      const { data, error } = await makeService().crear(mkInput({ monto: 200 }))

      expect(error).toBeNull()
      expect(data).toEqual(creado)
      const insercion = __getSupabaseMockCalls().find((l) => l.metodo === 'insert')
      expect(insercion?.args[0]).toEqual(expect.objectContaining({ evento_id: 'e-1', monto: 200 }))
    })
  })

  describe('actualizar', () => {
    it('updates the gasto row (REQ-EVENTS-11)', async () => {
      const actualizado = mkGasto('g-1', { monto: 250 })
      __pushSupabaseResponse<GastoFijo>({ data: actualizado, error: null })

      const { data, error } = await makeService().actualizar('g-1', {
        ...mkInput(),
        monto: 250,
      })

      expect(error).toBeNull()
      expect(data?.monto).toBe(250)
    })
  })

  describe('eliminar', () => {
    it('deletes the gasto (REQ-EVENTS-11)', async () => {
      __pushSupabaseResponse<null>({ data: null, error: null })

      const { data, error } = await makeService().eliminar('g-1')

      expect(error).toBeNull()
      expect(data).toBeNull()
      const llamadas = __getSupabaseMockCalls()
      expect(llamadas.map((l) => l.metodo)).toEqual(['from', 'delete', 'eq'])
    })
  })
})

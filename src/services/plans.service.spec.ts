// REQ-EVENTS-15, REQ-EVENTS-16, REQ-EVENTS-17, REQ-EVENTS-19,
// REQ-EVENTS-41, REQ-EVENTS-42: plans service contract — factory
// pattern with `crearPlansService(supabase)`. The service never
// throws, returns `{ data, error }`, and `reemplazarTodos` is a
// delete-then-insert two-call flow (no transaction, v1 simplicity
// per REQ-EVENTS-19). Insert failure surfaces verbatim so the store
// can show the user an error and let them retry.
import { beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

import {
  __getSupabaseMockCalls,
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import type { PlanProduccion, PlanProduccionInput, ServiceError } from '@/types'
import { crearPlansService } from './plans.service'

const mkPlan = (id: string, overrides: Partial<PlanProduccion> = {}): PlanProduccion => ({
  id,
  evento_id: 'e-1',
  receta_id: 'r-1',
  unidades_a_producir: 10,
  created_at: '2026-06-18T00:00:00Z',
  ...overrides,
})

const mkInput = (overrides: Partial<PlanProduccionInput> = {}): PlanProduccionInput => ({
  evento_id: 'e-1',
  receta_id: 'r-1',
  unidades_a_producir: 10,
  ...overrides,
})

const makeService = () => crearPlansService(createClient('http://x', 'anon'))

describe('crearPlansService', () => {
  beforeEach(() => {
    __resetSupabaseMock()
  })

  describe('listarPorEvento', () => {
    it('fetches plan rows scoped to the given evento (REQ-EVENTS-15, REQ-EVENTS-41)', async () => {
      __pushSupabaseResponse<PlanProduccion[]>({
        data: [mkPlan('p-1', { receta_id: 'r-1' }), mkPlan('p-2', { receta_id: 'r-2' })],
        error: null,
      })

      const { data, error } = await makeService().listarPorEvento('e-1')

      expect(error).toBeNull()
      expect(data).toHaveLength(2)
      const llamadas = __getSupabaseMockCalls()
      expect(llamadas.some((l) => l.metodo === 'from' && l.args[0] === 'plan_produccion')).toBe(true)
      expect(llamadas.some((l) => l.metodo === 'eq' && l.args[0] === 'evento_id' && l.args[1] === 'e-1')).toBe(true)
    })

    it('surfaces supabase errors verbatim (REQ-EVENTS-42)', async () => {
      const err: ServiceError = { code: 'PGRST301', message: 'connection refused' }
      __pushSupabaseResponse<PlanProduccion[]>({ data: null, error: err })

      const { data, error } = await makeService().listarPorEvento('e-1')

      expect(data).toBeNull()
      expect(error?.code).toBe('PGRST301')
    })
  })

  describe('reemplazarTodos', () => {
    it('deletes all existing rows then inserts the new list (REQ-EVENTS-19, REQ-EVENTS-41)', async () => {
      // 1st call (delete) → ok; 2nd call (insert) → ok with new rows.
      __pushSupabaseResponse<null>({ data: null, error: null })
      __pushSupabaseResponse<PlanProduccion[]>({
        data: [
          mkPlan('p-new-1', { receta_id: 'r-1', unidades_a_producir: 20 }),
          mkPlan('p-new-2', { receta_id: 'r-2', unidades_a_producir: 30 }),
        ],
        error: null,
      })

      const { data, error } = await makeService().reemplazarTodos('e-1', [
        mkInput({ receta_id: 'r-1', unidades_a_producir: 20 }),
        mkInput({ receta_id: 'r-2', unidades_a_producir: 30 }),
      ])

      expect(error).toBeNull()
      expect(data).toHaveLength(2)
      const llamadas = __getSupabaseMockCalls()
      const metodos = llamadas.map((l) => l.metodo)
      // delete + eq sequence first, then insert.
      const idxDelete = metodos.indexOf('delete')
      const idxInsert = metodos.indexOf('insert')
      expect(idxDelete).toBeGreaterThanOrEqual(0)
      expect(idxInsert).toBeGreaterThan(idxDelete)
      // The insert payload carries the two new rows.
      const insertCall = llamadas.find((l) => l.metodo === 'insert')
      expect(insertCall?.args[0]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ evento_id: 'e-1', receta_id: 'r-1', unidades_a_producir: 20 }),
          expect.objectContaining({ evento_id: 'e-1', receta_id: 'r-2', unidades_a_producir: 30 }),
        ]),
      )
    })

    it('surfaces the insert error and returns { data: null, error } when insert fails (REQ-EVENTS-19, REQ-EVENTS-42)', async () => {
      __pushSupabaseResponse<null>({ data: null, error: null })
      const err: ServiceError = { code: '23505', message: 'duplicate key value violates unique constraint' }
      __pushSupabaseResponse<PlanProduccion[]>({ data: null, error: err })

      const { data, error } = await makeService().reemplazarTodos('e-1', [
        mkInput({ receta_id: 'r-1', unidades_a_producir: 5 }),
      ])

      expect(data).toBeNull()
      expect(error?.code).toBe('23505')
    })

    it('returns an empty array (no calls) when there are zero filas to insert (REQ-EVENTS-19)', async () => {
      __pushSupabaseResponse<null>({ data: null, error: null })

      const { data, error } = await makeService().reemplazarTodos('e-1', [])

      expect(error).toBeNull()
      expect(data).toEqual([])
      const llamadas = __getSupabaseMockCalls()
      const metodos = llamadas.map((l) => l.metodo)
      // Delete still runs; insert does NOT.
      expect(metodos).toContain('delete')
      expect(metodos).not.toContain('insert')
    })
  })

  describe('eliminar', () => {
    it('deletes a single plan row by id (REQ-EVENTS-15, REQ-EVENTS-42)', async () => {
      __pushSupabaseResponse<null>({ data: null, error: null })

      const { data, error } = await makeService().eliminar('p-1')

      expect(error).toBeNull()
      expect(data).toBeNull()
      const llamadas = __getSupabaseMockCalls()
      const metodos = llamadas.map((l) => l.metodo)
      expect(metodos).toEqual(['from', 'delete', 'eq'])
      expect(llamadas[0]?.args[0]).toBe('plan_produccion')
      expect(llamadas[2]?.args).toEqual(['id', 'p-1'])
    })

    it('surfaces supabase errors verbatim (REQ-EVENTS-42)', async () => {
      const err: ServiceError = { code: 'PGRST301', message: 'connection refused' }
      __pushSupabaseResponse<null>({ data: null, error: err })

      const { data, error } = await makeService().eliminar('p-1')

      expect(data).toBeNull()
      expect(error?.code).toBe('PGRST301')
    })
  })
})
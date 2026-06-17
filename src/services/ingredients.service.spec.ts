// REQ-CATALOG-1, REQ-CATALOG-4, REQ-CATALOG-5, REQ-CATALOG-44:
// ingredients service contract — factory pattern with never-throw
// { data, error } returns. Exercises the supabase chainable mock from
// tests/setup.ts and asserts both happy paths and the FK-restricted
// delete rejection (RESTRICT surfaces as Supabase error code '23503').
import { beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

import {
  __getSupabaseMockCalls,
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import type { MateriaPrima, MateriaPrimaInput } from '@/types'
import { crearIngredientsService } from './ingredients.service'

const mkMateria = (id: string, overrides: Partial<MateriaPrima> = {}): MateriaPrima => ({
  id,
  nombre: 'Harina',
  unidad: 'kg',
  costo_por_unidad: 2.5,
  notas: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const mkInput = (overrides: Partial<MateriaPrimaInput> = {}): MateriaPrimaInput => ({
  nombre: 'Harina',
  unidad: 'kg',
  costo_por_unidad: 2.5,
  notas: null,
  ...overrides,
})

// `vi.mock('@supabase/supabase-js')` in tests/setup.ts swaps createClient
// for a chainable builder factory, so calling it here hands the test a
// fresh mocked client identical to the one production code receives.
const makeService = () => crearIngredientsService(createClient('http://x', 'anon'))

describe('crearIngredientsService', () => {
  beforeEach(() => {
    __resetSupabaseMock()
  })

  describe('listar', () => {
    it('returns the list from supabase when query succeeds (REQ-CATALOG-1)', async () => {
      const materia = mkMateria('mp-1', { nombre: 'Harina' })
      __pushSupabaseResponse<MateriaPrima[]>({ data: [materia], error: null })

      const { data, error } = await makeService().listar()

      expect(error).toBeNull()
      expect(data).toEqual([materia])
    })

    it('returns { data: null, error } on supabase failure', async () => {
      __pushSupabaseResponse<MateriaPrima[]>({
        data: null,
        error: { code: 'PGRST301', message: 'connection refused' },
      })

      const { data, error } = await makeService().listar()

      expect(data).toBeNull()
      expect(error).toEqual({ code: 'PGRST301', message: 'connection refused' })
    })

    it('issues a from("materias_primas") call', async () => {
      __pushSupabaseResponse<MateriaPrima[]>({ data: [], error: null })

      await makeService().listar()

      const llamadas = __getSupabaseMockCalls()
      expect(llamadas[0]).toEqual({ metodo: 'from', args: ['materias_primas'] })
    })
  })

  describe('crear', () => {
    it('inserts the input and returns the persisted row (REQ-CATALOG-2)', async () => {
      const creada = mkMateria('mp-new', { nombre: 'Mantequilla', unidad: 'g' })
      __pushSupabaseResponse<MateriaPrima[]>({ data: [], error: null })
      __pushSupabaseResponse<MateriaPrima>({ data: creada, error: null })

      const { data, error } = await makeService().crear(
        mkInput({ nombre: 'Mantequilla', unidad: 'g', costo_por_unidad: 0.12 }),
      )

      expect(error).toBeNull()
      expect(data).toEqual(creada)
      const llamadas = __getSupabaseMockCalls()
      expect(llamadas[0]).toEqual({ metodo: 'from', args: ['materias_primas'] })
      // Calls 1+ are the duplicate-check select; later calls include insert.
      const insercion = llamadas.find((l) => l.metodo === 'insert')
      expect(insercion).toBeDefined()
      expect(insercion?.args[0]).toEqual(expect.objectContaining({ nombre: 'Mantequilla' }))
    })

    it('detects case-insensitive duplicate (REQ-CATALOG-5) and surfaces a friendly error', async () => {
      const existentes: MateriaPrima[] = [mkMateria('mp-1', { nombre: 'Azúcar' })]
      __pushSupabaseResponse<MateriaPrima[]>({ data: existentes, error: null })

      const { data, error } = await makeService().crear(mkInput({ nombre: 'azúcar' }))

      expect(data).toBeNull()
      expect(error?.code).toBe('DUPLICADO')
      expect(error?.message).toContain('Azúcar')
    })

    it('accepts a non-duplicate name (REQ-CATALOG-5)', async () => {
      const creada = mkMateria('mp-new', { nombre: 'Azúcar glass' })
      __pushSupabaseResponse<MateriaPrima[]>({ data: [], error: null })
      __pushSupabaseResponse<MateriaPrima>({ data: creada, error: null })

      const { error } = await makeService().crear(mkInput({ nombre: 'Azúcar glass' }))

      expect(error).toBeNull()
    })

    it('returns the supabase error if insert fails (REQ-CATALOG-44)', async () => {
      __pushSupabaseResponse<MateriaPrima[]>({ data: [], error: null })
      __pushSupabaseResponse<MateriaPrima>({
        data: null,
        error: { code: 'PGRST301', message: 'insert failed' },
      })

      const { data, error } = await makeService().crear(mkInput())

      expect(data).toBeNull()
      expect(error?.code).toBe('PGRST301')
    })
  })

  describe('actualizar', () => {
    it('issues update + eq("id", id) and returns the updated row (REQ-CATALOG-3)', async () => {
      const actualizada = mkMateria('mp-1', { costo_por_unidad: 0.06 })
      __pushSupabaseResponse<MateriaPrima>({ data: actualizada, error: null })

      const { data, error } = await makeService().actualizar('mp-1', { costo_por_unidad: 0.06 })

      expect(error).toBeNull()
      expect(data).toEqual(actualizada)
      const llamadas = __getSupabaseMockCalls()
      expect(llamadas.map((l) => l.metodo)).toEqual(['from', 'update', 'eq', 'select', 'single'])
      expect(llamadas[2]?.args).toEqual(['id', 'mp-1'])
    })

    it('returns the supabase error if update fails', async () => {
      __pushSupabaseResponse<MateriaPrima>({
        data: null,
        error: { code: 'PGRST301', message: 'update failed' },
      })

      const { data, error } = await makeService().actualizar('mp-1', { nombre: 'X' })

      expect(data).toBeNull()
      expect(error?.code).toBe('PGRST301')
    })
  })

  describe('eliminar', () => {
    it('issues delete + eq("id", id) and returns { data: null, error: null } (REQ-CATALOG-4)', async () => {
      __pushSupabaseResponse<null>({ data: null, error: null })

      const { data, error } = await makeService().eliminar('mp-1')

      expect(error).toBeNull()
      expect(data).toBeNull()
      const llamadas = __getSupabaseMockCalls()
      expect(llamadas.map((l) => l.metodo)).toEqual(['from', 'delete', 'eq'])
      expect(llamadas[2]?.args).toEqual(['id', 'mp-1'])
    })

    it('returns the FK-restriction error when the ingredient is in use (REQ-CATALOG-4)', async () => {
      __pushSupabaseResponse<null>({
        data: null,
        error: { code: '23503', message: 'foreign key violation' },
      })

      const { data, error } = await makeService().eliminar('mp-1')

      expect(data).toBeNull()
      expect(error?.code).toBe('23503')
    })
  })
})

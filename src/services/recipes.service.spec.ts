// REQ-CATALOG-9..12, REQ-CATALOG-44: recipes service contract — factory
// pattern with joined insert for `crear` and delete-then-reinsert for
// `actualizar`. Each method returns `{ data, error }` and never throws.
// The supabase chainable mock from tests/setup.ts records every call so
// tests can assert the joined-insert sequence and the delete/reinsert.
import { beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

import {
  __getSupabaseMockCalls,
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import type { IngredienteRecetaInput, RecetaConIngredientes } from '@/types'
import { crearRecipesService } from './recipes.service'

const mkReceta = (id: string, overrides: Partial<RecetaConIngredientes> = {}): RecetaConIngredientes => ({
  id,
  nombre: 'Pan básico',
  descripcion: null,
  rendimiento_unidades: 2,
  notas: null,
  ingredientes: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const mkLinea = (materiaPrimaId: string, cantidad: number): IngredienteRecetaInput => ({
  materia_prima_id: materiaPrimaId,
  cantidad,
})

const makeService = () => crearRecipesService(createClient('http://x', 'anon'))

describe('crearRecipesService', () => {
  beforeEach(() => {
    __resetSupabaseMock()
  })

  describe('listar', () => {
    it('returns the recipe list with embedded ingredients (REQ-CATALOG-9)', async () => {
      const receta = mkReceta('r-1', { nombre: 'Pan básico' })
      __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [receta], error: null })

      const { data, error } = await makeService().listar()

      expect(error).toBeNull()
      expect(data).toEqual([receta])
    })

    it('returns { data: null, error } on supabase failure (REQ-CATALOG-44)', async () => {
      __pushSupabaseResponse<RecetaConIngredientes[]>({
        data: null,
        error: { code: 'PGRST301', message: 'connection refused' },
      })

      const { data, error } = await makeService().listar()

      expect(data).toBeNull()
      expect(error?.code).toBe('PGRST301')
    })
  })

  describe('crear', () => {
    it('inserts the receta row, then batch-inserts the ingredient lines (REQ-CATALOG-10)', async () => {
      const creada = mkReceta('r-new', { nombre: 'Galleta' })
      __pushSupabaseResponse<RecetaConIngredientes>({ data: creada, error: null })
      __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })

      const { data, error } = await makeService().crear({
        nombre: 'Galleta',
        descripcion: null,
        rendimiento_unidades: 24,
        notas: null,
        ingredientes: [mkLinea('mp-1', 0.5), mkLinea('mp-2', 200)],
      })

      expect(error).toBeNull()
      expect(data).toEqual(creada)
      const llamadas = __getSupabaseMockCalls()
      const inserciones = llamadas.filter((l) => l.metodo === 'insert')
      expect(inserciones).toHaveLength(2)
      expect(inserciones[0]?.args[0]).toEqual(
        expect.objectContaining({ nombre: 'Galleta', rendimiento_unidades: 24 }),
      )
      expect(inserciones[1]?.args[0]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ materia_prima_id: 'mp-1', cantidad: 0.5 }),
          expect.objectContaining({ materia_prima_id: 'mp-2', cantidad: 200 }),
        ]),
      )
    })

    it('rolls back to a structured error if the second insert fails (REQ-CATALOG-44)', async () => {
      __pushSupabaseResponse<RecetaConIngredientes>({
        data: null,
        error: { code: 'PGRST301', message: 'insert receta failed' },
      })

      const { data, error } = await makeService().crear({
        nombre: 'Galleta',
        descripcion: null,
        rendimiento_unidades: 24,
        notas: null,
        ingredientes: [mkLinea('mp-1', 1)],
      })

      expect(data).toBeNull()
      expect(error?.code).toBe('PGRST301')
    })
  })

  describe('actualizar', () => {
    it('updates the receta row and replaces all ingredient lines (REQ-CATALOG-11)', async () => {
      const actualizada = mkReceta('r-1', { nombre: 'Pan básico v2' })
      __pushSupabaseResponse<RecetaConIngredientes>({ data: actualizada, error: null })
      __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })

      const { data, error } = await makeService().actualizar('r-1', {
        nombre: 'Pan básico v2',
        descripcion: null,
        rendimiento_unidades: 3,
        notas: null,
        ingredientes: [mkLinea('mp-3', 0.01)],
      })

      expect(error).toBeNull()
      expect(data).toEqual(actualizada)
      const llamadas = __getSupabaseMockCalls()
      const eliminaciones = llamadas.filter((l) => l.metodo === 'delete')
      const inserciones = llamadas.filter((l) => l.metodo === 'insert')
      const actualizaciones = llamadas.filter((l) => l.metodo === 'update')
      expect(actualizaciones.length).toBe(1)
      expect(eliminaciones.length).toBe(1)
      expect(inserciones.length).toBe(1)
      expect(inserciones[0]?.args[0]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ receta_id: 'r-1', materia_prima_id: 'mp-3' }),
        ]),
      )
    })
  })

  describe('eliminar', () => {
    it('issues delete + eq("id", id) and returns { data: null, error: null } (REQ-CATALOG-12)', async () => {
      __pushSupabaseResponse<null>({ data: null, error: null })

      const { data, error } = await makeService().eliminar('r-1')

      expect(error).toBeNull()
      expect(data).toBeNull()
      const llamadas = __getSupabaseMockCalls()
      expect(llamadas.map((l) => l.metodo)).toEqual(['from', 'delete', 'eq'])
      expect(llamadas[2]?.args).toEqual(['id', 'r-1'])
    })
  })
})

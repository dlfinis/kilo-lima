// REQ-POS-1, REQ-POS-2, REQ-POS-3, REQ-POS-4, REQ-POS-5, REQ-POS-52,
// REQ-POS-53: productos service contract — factory pattern with full
// CRUD. `crear` MUST detect UNIQUE(receta_id) violations and surface
// them as `DUPLICATE_RECETA` so the cross-slice "Vender esta receta"
// button in `RecetaDetalleView` can show the right toast. `eliminar`
// detects RESTRICT FK violations on `venta_items` so the user sees
// "no se puede eliminar — tiene ventas registradas" instead of a
// raw PGRST error. Never-throw: every method returns
// `{ data, error: ServiceError | null }`.
import { beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

import {
  __getSupabaseMockCalls,
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import type { Producto } from '@/types'
import { crearProductosService } from './productos.service'

const mkProducto = (overrides: Partial<Producto> = {}): Producto => ({
  id: 'p-1',
  receta_id: 'r-1',
  // catalog-domain-refactor / Slice 1
  nombre: 'Test Producto',
  categoria: null,
  precio_venta: null,
  disponible: true,
  orden: 0,
  descripcion: null,
  icono: null,
  color: null,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
  ...overrides,
})

const makeService = () => crearProductosService(createClient('http://x', 'anon'))

describe('crearProductosService', () => {
  beforeEach(() => {
    __resetSupabaseMock()
  })

  describe('listar', () => {
    it('returns all productos ordered by orden asc, created_at asc (REQ-POS-1)', async () => {
      const rows: Producto[] = [
        mkProducto({ id: 'p-1', orden: 1 }),
        mkProducto({ id: 'p-2', orden: 0 }),
      ]
      __pushSupabaseResponse<Producto[]>({ data: rows, error: null })

      const { data, error } = await makeService().listar()

      expect(error).toBeNull()
      expect(data).toEqual(rows)
      const calls = __getSupabaseMockCalls()
      expect(calls.map((c) => c.metodo)).toContain('order')
    })

    it('returns { data: null, error } on supabase failure (REQ-POS-53)', async () => {
      __pushSupabaseResponse<Producto[]>({
        data: null,
        error: { code: 'PGRST301', message: 'connection refused' },
      })

      const { data, error } = await makeService().listar()

      expect(data).toBeNull()
      expect(error?.code).toBe('PGRST301')
    })
  })

  describe('obtener', () => {
    it('returns the matching producto (REQ-POS-1)', async () => {
      const row = mkProducto({ id: 'p-1' })
      __pushSupabaseResponse<Producto>({ data: row, error: null })

      const { data, error } = await makeService().obtener('p-1')

      expect(error).toBeNull()
      expect(data?.id).toBe('p-1')
      const calls = __getSupabaseMockCalls()
      expect(calls.some((c) => c.metodo === 'eq' && c.args[0] === 'id' && c.args[1] === 'p-1')).toBe(true)
    })

    it('returns null + error when supabase yields no row (REQ-POS-53)', async () => {
      __pushSupabaseResponse<Producto>({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })

      const { data, error } = await makeService().obtener('missing')

      expect(data).toBeNull()
      expect(error?.code).toBe('PGRST116')
    })
  })

  describe('listarPorReceta', () => {
    it('filters by receta_id (REQ-POS-47 cross-slice)', async () => {
      const rows = [mkProducto({ id: 'p-1', receta_id: 'r-1' })]
      __pushSupabaseResponse<Producto[]>({ data: rows, error: null })

      const { data, error } = await makeService().listarPorReceta('r-1')

      expect(error).toBeNull()
      expect(data).toEqual(rows)
      const calls = __getSupabaseMockCalls()
      expect(calls.some((c) => c.metodo === 'eq' && c.args[0] === 'receta_id' && c.args[1] === 'r-1')).toBe(true)
    })

    it('returns [] when the receta has no producto yet (REQ-POS-47)', async () => {
      __pushSupabaseResponse<Producto[]>({ data: [], error: null })

      const { data, error } = await makeService().listarPorReceta('r-x')

      expect(error).toBeNull()
      expect(data).toEqual([])
    })
  })

  describe('crear', () => {
    it('inserts the producto with default disponible=true and orden=0 (REQ-POS-1, REQ-POS-4)', async () => {
      const insertado = mkProducto({ id: 'p-new', precio_venta: 7.5 })
      __pushSupabaseResponse<Producto>({ data: insertado, error: null })

      const { data, error } = await makeService().crear({
        receta_id: 'r-1',
        nombre: 'Test Producto',
        categoria: null,
        disponible: true,
        orden: 0,
        descripcion: null,
        icono: null,
        color: null,
      })

      expect(error).toBeNull()
      expect(data?.id).toBe('p-new')
      expect(data?.precio_venta).toBe(7.5)
      const calls = __getSupabaseMockCalls()
      expect(calls.some((c) => c.metodo === 'insert')).toBe(true)
    })

    it('maps UNIQUE(receta_id) violations to DUPLICATE_RECETA (REQ-POS-2, REQ-POS-53)', async () => {
      __pushSupabaseResponse<Producto>({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint "productos_receta_id_key"' },
      })

      const { data, error } = await makeService().crear({
        receta_id: 'r-1',
        nombre: 'Test Producto',
        categoria: null,
        disponible: true,
        orden: 0,
        descripcion: null,
        icono: null,
        color: null,
      })

      expect(data).toBeNull()
      expect(error?.code).toBe('DUPLICATE_RECETA')
    })

    it('surfaces other supabase errors unchanged (REQ-POS-53)', async () => {
      __pushSupabaseResponse<Producto>({
        data: null,
        error: { code: 'PGRST301', message: 'connection refused' },
      })

      const { data, error } = await makeService().crear({
        receta_id: 'r-1',
        nombre: 'Test Producto',
        categoria: null,
        disponible: true,
        orden: 0,
        descripcion: null,
        icono: null,
        color: null,
      })

      expect(data).toBeNull()
      expect(error?.code).toBe('PGRST301')
    })
  })

  describe('actualizar', () => {
    it('updates the producto row and returns the new state (REQ-POS-3, REQ-POS-4)', async () => {
      const actualizado = mkProducto({ id: 'p-1', precio_venta: 6, disponible: false })
      __pushSupabaseResponse<Producto>({ data: actualizado, error: null })

      const { data, error } = await makeService().actualizar('p-1', { disponible: false })

      expect(error).toBeNull()
      expect(data?.precio_venta).toBe(6)
      expect(data?.disponible).toBe(false)
    })
  })

  describe('eliminar', () => {
    it('issues delete + eq("id", id) and returns { data: null, error: null } (REQ-POS-1)', async () => {
      __pushSupabaseResponse<null>({ data: null, error: null })

      const { data, error } = await makeService().eliminar('p-1')

      expect(error).toBeNull()
      expect(data).toBeNull()
      const calls = __getSupabaseMockCalls()
      expect(calls.map((c) => c.metodo)).toEqual(['from', 'delete', 'eq'])
      expect(calls[2]?.args).toEqual(['id', 'p-1'])
    })

    it('maps RESTRICT FK on venta_items to VENTA_HISTORIAL (REQ-POS-5, REQ-POS-53)', async () => {
      __pushSupabaseResponse<null>({
        data: null,
        error: {
          code: '23503',
          message: 'update or delete on table "productos" violates foreign key constraint "venta_items_producto_id_fkey"',
        },
      })

      const { data, error } = await makeService().eliminar('p-1')

      expect(data).toBeNull()
      expect(error?.code).toBe('VENTA_HISTORIAL')
    })
  })
})
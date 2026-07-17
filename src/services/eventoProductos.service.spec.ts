// REQ-PRICING-5, REQ-FIN-17: eventoProductos service contract.
// Factory pattern (OCP/DIP) — caller supplies supabase. Never-throw
// (LSP) — every method returns { data, error: ServiceError | null }.
// UPSERT on UNIQUE(evento_id, producto_id) keeps
// `inicializarDesdeCatalogo` idempotent.
import { beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

import {
  __getSupabaseMockCalls,
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import type { EventoProducto } from '@/types'
import { crearEventoProductosService } from './eventoProductos.service'

const mkEP = (overrides: Partial<EventoProducto> = {}): EventoProducto => ({
  id: 'ep-1',
  evento_id: 'e-1',
  producto_id: 'p-1',
  precio_venta: 16.67,
  margen: 0.4,
  incluido: true,
  created_at: '2026-06-20T00:00:00Z',
  updated_at: '2026-06-20T00:00:00Z',
  ...overrides,
})

interface ProductoLite {
  id: string
  receta_id: string
  precio_venta: number
}

const mkProducto = (overrides: Partial<ProductoLite> = {}): ProductoLite => ({
  id: 'p-1',
  receta_id: 'r-1',
  precio_venta: 0,
  ...overrides,
})

const makeService = () => crearEventoProductosService(createClient('http://x', 'anon'))

describe('crearEventoProductosService', () => {
  beforeEach(() => {
    __resetSupabaseMock()
  })

  describe('listarPorEvento', () => {
    it('returns all evento_productos for the evento (REQ-PRICING-1)', async () => {
      const rows = [mkEP({ id: 'ep-1' }), mkEP({ id: 'ep-2', producto_id: 'p-2' })]
      __pushSupabaseResponse<EventoProducto[]>({ data: rows, error: null })

      const { data, error } = await makeService().listarPorEvento('e-1')

      expect(error).toBeNull()
      expect(data).toHaveLength(2)
      const calls = __getSupabaseMockCalls()
      expect(calls.some((c) => c.metodo === 'from' && c.args[0] === 'evento_productos')).toBe(true)
      expect(calls.some((c) => c.metodo === 'eq' && c.args[0] === 'evento_id' && c.args[1] === 'e-1')).toBe(true)
    })

    it('returns [] when the evento has no productos configured', async () => {
      __pushSupabaseResponse<EventoProducto[]>({ data: [], error: null })

      const { data, error } = await makeService().listarPorEvento('e-1')

      expect(error).toBeNull()
      expect(data).toEqual([])
    })

    it('returns null + error on supabase failure', async () => {
      __pushSupabaseResponse<EventoProducto[]>({
        data: null,
        error: { code: 'PGRST301', message: 'connection refused' },
      })

      const { data, error } = await makeService().listarPorEvento('e-1')

      expect(data).toBeNull()
      expect(error?.code).toBe('PGRST301')
    })
  })

  describe('upsert', () => {
    it('upserts a single row on UNIQUE(evento_id, producto_id)', async () => {
      const row = mkEP({ id: 'ep-1' })
      __pushSupabaseResponse<EventoProducto>({ data: row, error: null })

      const { data, error } = await makeService().upsert('e-1', 'p-1', {
        precio_venta: 16.67,
        margen: 0.4,
        incluido: true,
      })

      expect(error).toBeNull()
      expect(data?.id).toBe('ep-1')
      const calls = __getSupabaseMockCalls()
      expect(calls.some((c) => c.metodo === 'upsert')).toBe(true)
      const upsertCall = calls.find((c) => c.metodo === 'upsert')
      // Row payload carries evento_id + producto_id + the overrides.
      const payload = upsertCall?.args[0] as Array<Record<string, unknown>>
      expect(payload[0]).toMatchObject({
        evento_id: 'e-1',
        producto_id: 'p-1',
        precio_venta: 16.67,
        margen: 0.4,
        incluido: true,
      })
      // onConflict targets the UNIQUE constraint.
      const opts = upsertCall?.args[1] as { onConflict?: string }
      expect(opts?.onConflict).toBe('evento_id,producto_id')
    })

    it('surfaces UNIQUE violation as a domain error (REQ-FIN-53 pattern)', async () => {
      __pushSupabaseResponse<EventoProducto>({
        data: null,
        error: { code: '23505', message: 'duplicate key' },
      })

      const { data, error } = await makeService().upsert('e-1', 'p-1', {
        precio_venta: 16.67,
        margen: 0.4,
        incluido: true,
      })

      expect(data).toBeNull()
      // Mapped to a recognizable code (the service maps 23505).
      expect(error?.code).not.toBeNull()
    })
  })

  describe('actualizarPrecio', () => {
    it('updates precio_venta, margen real, and both persisted markups', async () => {
      const actualizado = mkEP({
        id: 'ep-1',
        precio_venta: 20,
        margen: 0.4,
        ganancia_markup: 0.5,
        contribucion_markup: 0.25,
      })
      __pushSupabaseResponse<EventoProducto>({ data: actualizado, error: null })

      const { data, error } = await makeService().actualizarPrecio('ep-1', 20, 0.4, 0.5, 0.25)

      expect(error).toBeNull()
      expect(data?.precio_venta).toBe(20)
      expect(data?.margen).toBe(0.4)
      expect(data?.ganancia_markup).toBe(0.5)
      expect(data?.contribucion_markup).toBe(0.25)
      const calls = __getSupabaseMockCalls()
      expect(calls.some((c) => c.metodo === 'update')).toBe(true)
    })

    // productos-mejoras / evento-producto-pricing: the slider must
    // be able to clear a manual override by sending `precioVenta=null`.
    // The DB column is NUMERIC NULL — the service must propagate the
    // null instead of coercing it to 0 (which would re-introduce the
    // "lost override" bug).
    it('accepts precioVenta=null and writes null to the DB row', async () => {
      const actualizado = mkEP({ id: 'ep-1', precio_venta: null, margen: null })
      __pushSupabaseResponse<EventoProducto>({ data: actualizado, error: null })

      const { data, error } = await makeService().actualizarPrecio('ep-1', null, null, 0.4, 0.1)

      expect(error).toBeNull()
      expect(data?.precio_venta).toBeNull()
      expect(data?.margen).toBeNull()
      const calls = __getSupabaseMockCalls()
      const updateCall = calls.find((c) => c.metodo === 'update')
      const payload = updateCall?.args[0] as Record<string, unknown>
      expect(payload.precio_venta).toBeNull()
      expect(payload.margen).toBeNull()
      expect(payload.ganancia_markup).toBe(0.4)
      expect(payload.contribucion_markup).toBe(0.1)
    })
  })

  describe('toggleIncluido', () => {
    it('updates the incluido boolean on the row', async () => {
      const actualizado = mkEP({ id: 'ep-1', incluido: false })
      __pushSupabaseResponse<EventoProducto>({ data: actualizado, error: null })

      const { data, error } = await makeService().toggleIncluido('ep-1', false)

      expect(error).toBeNull()
      expect(data?.incluido).toBe(false)
    })
  })

  describe('inicializarDesdeCatalogo', () => {
    it('reads productos catalog then UPSERTs one row per producto (idempotent)', async () => {
      // 1) List productos (3 rows).
__pushSupabaseResponse<ProductoLite[]>({
      data: [
        mkProducto({ id: 'p-1' }),
        mkProducto({ id: 'p-2' }),
        mkProducto({ id: 'p-3' }),
      ],
      error: null,
    })
      // 2) No event rows exist yet.
      __pushSupabaseResponse<Array<{ producto_id: string }>>({ data: [], error: null })
      // 3) Upsert result.
      __pushSupabaseResponse<EventoProducto[]>({
        data: [
          mkEP({ id: 'ep-1', producto_id: 'p-1' }),
          mkEP({ id: 'ep-2', producto_id: 'p-2' }),
          mkEP({ id: 'ep-3', producto_id: 'p-3' }),
        ],
        error: null,
      })

      const { data, error } = await makeService().inicializarDesdeCatalogo('e-1')

      expect(error).toBeNull()
      expect(data).toHaveLength(3)
      const calls = __getSupabaseMockCalls()
      // UPSERT must include every producto in one batch.
      const upsertCall = calls.find((c) => c.metodo === 'upsert')
      expect(upsertCall).toBeDefined()
      const payload = upsertCall?.args[0] as Array<Record<string, unknown>>
      expect(payload).toHaveLength(3)
      expect(upsertCall?.args[1]).toMatchObject({ ignoreDuplicates: true })
      // Every row carries the same evento_id + included=true.
      for (const row of payload) {
        expect(row.evento_id).toBe('e-1')
        expect(row.incluido).toBe(true)
        expect(row.precio_venta).toBeNull()
        expect(row.margen).toBeNull()
      }
    })

    it('does not upsert existing rows, preserving their persisted markups', async () => {
      __pushSupabaseResponse<ProductoLite[]>({
        data: [mkProducto({ id: 'p-1' }), mkProducto({ id: 'p-2' })],
        error: null,
      })
      __pushSupabaseResponse<Array<{ producto_id: string }>>({
        data: [{ producto_id: 'p-1' }, { producto_id: 'p-2' }],
        error: null,
      })

      const { data, error } = await makeService().inicializarDesdeCatalogo('e-1')

      expect(error).toBeNull()
      expect(data).toEqual([])
      const calls = __getSupabaseMockCalls()
      expect(calls.some((c) => c.metodo === 'upsert')).toBe(false)
    })

    it('returns empty array when the catalog has no productos', async () => {
      __pushSupabaseResponse<ProductoLite[]>({ data: [], error: null })

      const { data, error } = await makeService().inicializarDesdeCatalogo('e-1')

      expect(error).toBeNull()
      expect(data).toEqual([])
      const calls = __getSupabaseMockCalls()
      // No upsert call when there's nothing to upsert.
      expect(calls.some((c) => c.metodo === 'upsert')).toBe(false)
    })

    it('surfaces supabase error from the productos list', async () => {
      __pushSupabaseResponse<ProductoLite[]>({
        data: null,
        error: { code: 'PGRST301', message: 'connection refused' },
      })

      const { data, error } = await makeService().inicializarDesdeCatalogo('e-1')

      expect(data).toBeNull()
      expect(error?.code).toBe('PGRST301')
    })
  })
})

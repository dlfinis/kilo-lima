// event-product-management-refactor: producto_produccion service
// contract. Factory pattern (OCP/DIP) — caller supplies supabase.
// Never-throw (LSP) — every method returns { data, error }.
// UPSERT on UNIQUE(evento_producto_id) keeps the production row
// idempotent per event product.
import { beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

import {
  __getSupabaseMockCalls,
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import type { ProductoProduccion } from '@/types'
import { crearProductoProduccionService } from './productoProduccion.service'

const mkPP = (overrides: Partial<ProductoProduccion> = {}): ProductoProduccion => ({
  id: 'pp-1',
  evento_producto_id: 'ep-1',
  unidades_a_producir: 50,
  created_at: '2026-07-13T00:00:00Z',
  ...overrides,
})

const makeService = () => crearProductoProduccionService(createClient('http://x', 'anon'))

describe('crearProductoProduccionService', () => {
  beforeEach(() => {
    __resetSupabaseMock()
  })

  describe('listarPorEvento', () => {
    it('returns all producto_produccion rows for the evento via join', async () => {
      // The service joins through evento_productos to filter by event.
      // The mock returns raw rows with the join envelope; the service
      // strips the envelope and returns flat ProductoProduccion[].
      const raw = [
        { id: 'pp-1', evento_producto_id: 'ep-1', unidades_a_producir: 50, created_at: '2026-07-13T00:00:00Z', evento_productos: { evento_id: 'e-1' } },
        { id: 'pp-2', evento_producto_id: 'ep-2', unidades_a_producir: 30, created_at: '2026-07-13T00:00:00Z', evento_productos: { evento_id: 'e-1' } },
      ]
      __pushSupabaseResponse<typeof raw>({ data: raw, error: null })

      const { data, error } = await makeService().listarPorEvento('e-1')

      expect(error).toBeNull()
      expect(data).toHaveLength(2)
      // Envelope stripped — flat ProductoProduccion[].
      expect(data?.[0]?.id).toBe('pp-1')
      expect(data?.[0]?.evento_producto_id).toBe('ep-1')
      expect(data?.[0]?.unidades_a_producir).toBe(50)
      expect(data?.[1]?.id).toBe('pp-2')
      const calls = __getSupabaseMockCalls()
      expect(calls.some((c) => c.metodo === 'from' && c.args[0] === 'producto_produccion')).toBe(true)
      // Join filter uses evento_productos.evento_id.
      expect(calls.some((c) => c.metodo === 'eq' && c.args[0] === 'evento_productos.evento_id' && c.args[1] === 'e-1')).toBe(true)
    })

    it('returns empty array when the event has no production rows', async () => {
      __pushSupabaseResponse<[]>({ data: [], error: null })

      const { data, error } = await makeService().listarPorEvento('e-1')

      expect(error).toBeNull()
      expect(data).toEqual([])
    })

    it('returns null + error on supabase failure', async () => {
      __pushSupabaseResponse<null>({
        data: null,
        error: { code: 'PGRST301', message: 'connection refused' },
      })

      const { data, error } = await makeService().listarPorEvento('e-1')

      expect(data).toBeNull()
      expect(error?.code).toBe('PGRST301')
    })
  })

  describe('upsertByEventoProductoId', () => {
    it('upserts a single row on UNIQUE(evento_producto_id)', async () => {
      const row = mkPP({ id: 'pp-1' })
      __pushSupabaseResponse<ProductoProduccion>({ data: row, error: null })

      const { data, error } = await makeService().upsertByEventoProductoId('ep-1', 50)

      expect(error).toBeNull()
      expect(data?.id).toBe('pp-1')
      expect(data?.evento_producto_id).toBe('ep-1')
      expect(data?.unidades_a_producir).toBe(50)
      const calls = __getSupabaseMockCalls()
      expect(calls.some((c) => c.metodo === 'upsert')).toBe(true)
      const upsertCall = calls.find((c) => c.metodo === 'upsert')
      const payload = upsertCall?.args[0] as Array<Record<string, unknown>>
      // Only evento_producto_id + unidades_a_producir (no id/created_at).
      expect(payload[0]).toMatchObject({
        evento_producto_id: 'ep-1',
        unidades_a_producir: 50,
      })
      // onConflict targets the UNIQUE constraint.
      const opts = upsertCall?.args[1] as { onConflict?: string }
      expect(opts?.onConflict).toBe('evento_producto_id')
    })

    it('sanitizes payload — only DB-writable fields (no id, no created_at)', async () => {
      const row = mkPP()
      __pushSupabaseResponse<ProductoProduccion>({ data: row, error: null })

      await makeService().upsertByEventoProductoId('ep-1', 25)

      const calls = __getSupabaseMockCalls()
      const upsertCall = calls.find((c) => c.metodo === 'upsert')
      const payload = upsertCall?.args[0] as Array<Record<string, unknown>>
      // No id or created_at in the payload.
      expect(payload[0]).not.toHaveProperty('id')
      expect(payload[0]).not.toHaveProperty('created_at')
    })

    it('surfaces supabase error on upsert failure', async () => {
      __pushSupabaseResponse<ProductoProduccion>({
        data: null,
        error: { code: '23505', message: 'duplicate key' },
      })

      const { data, error } = await makeService().upsertByEventoProductoId('ep-1', 50)

      expect(data).toBeNull()
      expect(error?.code).toBe('23505')
    })
  })
})

// REQ-ABASTECIMIENTO-1..3: service-level tests for the abastecimiento
// service. Uses the global Supabase mock (tests/setup.ts) — same pattern
// as stockMovements.service.spec.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

import {
  __pushSupabaseResponse,
  __resetSupabaseMock,
  __getSupabaseMockCalls,
} from '../../tests/setup'
import type { CompraInsumo, StockMovement } from '@/types'
import { crearAbastecimientoService } from './abastecimiento.service'

const mkCompra = (overrides: Partial<CompraInsumo> = {}): CompraInsumo => ({
  id: 'ci-1',
  evento_id: 'ev-1',
  socio_id: 's-1',
  materia_prima_id: 'mp-1',
  cantidad: 10,
  costo_total: 25,
  fecha: '2026-07-14',
  descripcion: null,
  created_at: '2026-07-14T12:00:00Z',
  ...overrides,
})

const mkMovement = (overrides: Partial<StockMovement> = {}): StockMovement => ({
  id: 'sm-1',
  materia_prima_id: 'mp-1',
  cantidad: 10,
  tipo: 'compra',
  evento_id: 'ev-1',
  compra_insumo_id: 'ci-1',
  venta_id: null,
  movimiento_corregido_id: null,
  costo_unitario_snapshot: 2.5,
  motivo: null,
  fecha: '2026-07-14',
  created_at: '2026-07-14T12:00:00Z',
  created_by: null,
  ...overrides,
})

const supabase = createClient('http://x', 'anon')
const servicio = crearAbastecimientoService(supabase)

beforeEach(() => {
  __resetSupabaseMock()
})

describe('crearAbastecimientoService', () => {
  describe('listarCompras', () => {
    it('fetches compras_insumos for an evento ordered by fecha desc', async () => {
      __pushSupabaseResponse<CompraInsumo[]>({
        data: [mkCompra({ id: 'ci-2', fecha: '2026-07-15' }), mkCompra({ id: 'ci-1', fecha: '2026-07-14' })],
        error: null,
      })
      const { data, error } = await servicio.listarCompras('ev-1')
      expect(error).toBeNull()
      expect(data).toHaveLength(2)
      expect(data?.[0]?.id).toBe('ci-2')
    })

    it('returns error when supabase fails', async () => {
      __pushSupabaseResponse<CompraInsumo[]>({
        data: null,
        error: { code: 'PGRST301', message: 'connection refused' },
      })
      const { data, error } = await servicio.listarCompras('ev-1')
      expect(data).toBeNull()
      expect(error?.code).toBe('PGRST301')
    })
  })

  describe('crearCompra', () => {
    it('inserts a compra_insumos row and returns it', async () => {
      const nueva = mkCompra({ id: 'ci-new' })
      __pushSupabaseResponse<CompraInsumo>({ data: nueva, error: null })

      const { data, error } = await servicio.crearCompra({
        evento_id: 'ev-1',
        socio_id: 's-1',
        materia_prima_id: 'mp-1',
        cantidad: 10,
        costo_total: 25,
        fecha: '2026-07-14',
        descripcion: null,
      })
      expect(error).toBeNull()
      expect(data?.id).toBe('ci-new')
      expect(data?.cantidad).toBe(10)
    })
  })

  describe('eliminarCompra', () => {
    it('deletes a compra_insumos row by id', async () => {
      __pushSupabaseResponse<null>({ data: null, error: null })

      const { data, error } = await servicio.eliminarCompra('ci-1')
      expect(error).toBeNull()
      expect(data).toBeNull()
    })
  })

  describe('registrarCompraInsumo', () => {
    it('calls the registrar_compra_insumo RPC and returns the movement', async () => {
      __pushSupabaseResponse<StockMovement>({ data: mkMovement(), error: null })

      const { data, error } = await servicio.registrarCompraInsumo({
        socio_id: 's-1',
        materia_prima_id: 'mp-1',
        cantidad: 10,
        costo_unitario: 2.5,
        costo_total: 25,
        evento_id: 'ev-1',
        descripcion: 'Test purchase',
        fecha: '2026-07-14',
      })
      expect(error).toBeNull()
      expect(data?.tipo).toBe('compra')
      expect(data?.cantidad).toBe(10)

      const calls = __getSupabaseMockCalls()
      expect(calls.some((c) => c.metodo === 'rpc')).toBe(true)
    })

    it('maps CANTIDAD_INVALIDA error from the RPC', async () => {
      __pushSupabaseResponse<StockMovement>({
        data: null,
        error: { code: 'P0001', message: 'CANTIDAD_INVALIDA' },
      })

      const { data, error } = await servicio.registrarCompraInsumo({
        socio_id: 's-1',
        materia_prima_id: 'mp-1',
        cantidad: 0,
        costo_unitario: 2.5,
        costo_total: 0,
        evento_id: 'ev-1',
      })
      expect(data).toBeNull()
      expect(error?.code).toBe('CANTIDAD_INVALIDA')
    })

    it('maps COSTO_INVALIDO error from the RPC', async () => {
      __pushSupabaseResponse<StockMovement>({
        data: null,
        error: { code: 'P0001', message: 'COSTO_INVALIDO' },
      })

      const { data, error } = await servicio.registrarCompraInsumo({
        socio_id: 's-1',
        materia_prima_id: 'mp-1',
        cantidad: 5,
        costo_unitario: -1,
        costo_total: 25,
        evento_id: 'ev-1',
      })
      expect(data).toBeNull()
      expect(error?.code).toBe('COSTO_INVALIDO')
    })

    it('maps unknown errors preserving the original code and message', async () => {
      __pushSupabaseResponse<StockMovement>({
        data: null,
        error: { code: '23505', message: 'unique_violation' },
      })

      const { data, error } = await servicio.registrarCompraInsumo({
        socio_id: 's-1',
        materia_prima_id: 'mp-1',
        cantidad: 10,
        costo_unitario: 2.5,
        costo_total: 25,
        evento_id: 'ev-1',
      })
      expect(data).toBeNull()
      expect(error?.code).toBe('23505')
    })
  })
})

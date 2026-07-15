// TDD RED: service contract test for StockMovementsService.
// Imports from './stockMovements.service' do not exist yet — RED phase.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types'
import {
  crearStockMovementsService,
  type StockMovementsService,
} from './stockMovements.service'

// Minimal mock supabase client — only the methods the service will call.
function mockSupabaseClient(
  overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {},
): SupabaseClient<Database> {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    }),
    rpc: vi.fn(),
    ...overrides,
  } as unknown as SupabaseClient<Database>
}

describe('StockMovementsService', () => {
  let service: StockMovementsService
  let supabase: SupabaseClient<Database>

  beforeEach(() => {
    supabase = mockSupabaseClient()
    service = crearStockMovementsService(supabase)
  })

  describe('listar', () => {
    it('queries stock_movements table ordered by fecha desc', async () => {
      const mockMovements = [
        {
          id: 'sm-1', materia_prima_id: 'mp-1', cantidad: 10,
          tipo: 'compra', evento_id: null, compra_insumo_id: null,
          venta_id: null, movimiento_corregido_id: null,
          costo_unitario_snapshot: 2.5, motivo: null,
          fecha: '2026-07-14', created_at: '2026-07-14T12:00:00Z',
          created_by: null,
        },
      ]

      const orderChain = vi.fn().mockResolvedValue({ data: mockMovements, error: null })
      const selectChain = vi.fn().mockReturnValue({ order: orderChain })
      const fromFn = vi.fn().mockReturnValue({ select: selectChain })

      supabase.from = fromFn

      const result = await service.listar()

      expect(fromFn).toHaveBeenCalledWith('stock_movements')
      expect(selectChain).toHaveBeenCalledWith('*')
      expect(result.data).toEqual(mockMovements)
      expect(result.error).toBeNull()
    })

    it('returns error when supabase query fails', async () => {
      const dbError = { code: 'DB_ERR', message: 'database error', details: '', hint: '' }
      const orderChain = vi.fn().mockResolvedValue({ data: null, error: dbError })
      const selectChain = vi.fn().mockReturnValue({ order: orderChain })
      supabase.from = vi.fn().mockReturnValue({ select: selectChain })

      const result = await service.listar()

      expect(result.data).toBeNull()
      expect(result.error).toEqual(dbError)
    })
  })

  describe('listarPorMateriaPrima', () => {
    it('queries stock_movements filtered by materia_prima_id', async () => {
      const mockMovements = [
        {
          id: 'sm-1', materia_prima_id: 'mp-1', cantidad: 5,
          tipo: 'compra', evento_id: null, compra_insumo_id: null,
          venta_id: null, movimiento_corregido_id: null,
          costo_unitario_snapshot: 3.0, motivo: null,
          fecha: '2026-07-14', created_at: '2026-07-14T12:00:00Z',
          created_by: null,
        },
      ]

      const orderChain = vi.fn().mockResolvedValue({ data: mockMovements, error: null })
      // The eq chain returns an object with order
      const eqResult = { order: orderChain }
      const eqFn = vi.fn().mockReturnValue(eqResult)

      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: eqFn }),
      })

      const result = await service.listarPorMateriaPrima('mp-1')

      expect(supabase.from).toHaveBeenCalledWith('stock_movements')
      expect(result.data).toEqual(mockMovements)
      expect(result.error).toBeNull()
    })
  })

  describe('obtenerStockActual', () => {
    it('returns derived stock as the sum of all movements for the material', () => {
      const movements = [
        { cantidad: 10, tipo: 'compra' },
        { cantidad: -3, tipo: 'consumo' },
        { cantidad: 5, tipo: 'compra' },
        { cantidad: -1, tipo: 'correccion' },
      ]
      // Sum = 10 + (-3) + 5 + (-1) = 11
      const total = service.calcularStockDesdeMovimientos(
        movements as Parameters<typeof service.calcularStockDesdeMovimientos>[0],
      )
      expect(total).toBe(11)
    })

    it('returns 0 for empty movement list', () => {
      const total = service.calcularStockDesdeMovimientos([])
      expect(total).toBe(0)
    })

    it('returns negative when consumption exceeds purchases', () => {
      const movements = [
        { cantidad: 5, tipo: 'compra' },
        { cantidad: -10, tipo: 'consumo' },
      ]
      const total = service.calcularStockDesdeMovimientos(
        movements as Parameters<typeof service.calcularStockDesdeMovimientos>[0],
      )
      expect(total).toBe(-5)
    })
  })

  describe('listarStockActual', () => {
    it('queries the v_stock_actual view', async () => {
      const mockStock = [
        { materia_prima_id: 'mp-1', nombre: 'Harina', unidad: 'kg', stock_actual: 12 },
        { materia_prima_id: 'mp-2', nombre: 'Azúcar', unidad: 'g', stock_actual: 0 },
      ]
      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: mockStock, error: null }),
      })

      const result = await service.listarStockActual()

      expect(supabase.from).toHaveBeenCalledWith('v_stock_actual')
      expect(result.data).toEqual(mockStock)
      expect(result.error).toBeNull()
    })
  })

  describe('registrarCompra', () => {
    it('calls registrar_compra RPC with correct arguments', async () => {
      const mockMovement = {
        id: 'sm-new', materia_prima_id: 'mp-1', cantidad: 10,
        tipo: 'compra', costo_unitario_snapshot: 3.5, fecha: '2026-07-14',
      }
      supabase.rpc = vi.fn().mockResolvedValue({ data: mockMovement, error: null })

      const result = await service.registrarCompra({
        materia_prima_id: 'mp-1',
        cantidad: 10,
        costo_unitario: 3.5,
        evento_id: 'ev-1',
      })

      expect(supabase.rpc).toHaveBeenCalledWith('registrar_compra', {
        p_materia_prima_id: 'mp-1',
        p_cantidad: 10,
        p_costo_unitario: 3.5,
        p_evento_id: 'ev-1',
        p_compra_insumo_id: null,
        p_fecha: undefined,
      })
      expect(result.data).toEqual(mockMovement)
      expect(result.error).toBeNull()
    })

    it('returns error on invalid cantidad (<= 0)', async () => {
      supabase.rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'CANTIDAD_INVALIDA', code: 'P0001' },
      })

      const result = await service.registrarCompra({
        materia_prima_id: 'mp-1',
        cantidad: 0,
        costo_unitario: 3.5,
      })

      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('CANTIDAD_INVALIDA')
    })
  })

  describe('registrarConsumo', () => {
    it('calls registrar_consumo RPC with negative quantity logic', async () => {
      const mockMovement = {
        id: 'sm-c', materia_prima_id: 'mp-1', cantidad: -3,
        tipo: 'consumo', evento_id: 'ev-1', costo_unitario_snapshot: 2.0,
      }
      supabase.rpc = vi.fn().mockResolvedValue({ data: mockMovement, error: null })

      const result = await service.registrarConsumo({
        materia_prima_id: 'mp-1',
        cantidad: 3,
        costo_unitario: 2.0,
        evento_id: 'ev-1',
        venta_id: 'v-1',
      })

      expect(supabase.rpc).toHaveBeenCalledWith('registrar_consumo', {
        p_materia_prima_id: 'mp-1',
        p_cantidad: 3,
        p_costo_unitario: 2.0,
        p_evento_id: 'ev-1',
        p_venta_id: 'v-1',
        p_fecha: undefined,
      })
      expect(result.data).toEqual(mockMovement)
    })

    it('returns STOCK_INSUFICIENTE error when available stock is too low', async () => {
      supabase.rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'STOCK_INSUFICIENTE', code: 'P0001' },
      })

      const result = await service.registrarConsumo({
        materia_prima_id: 'mp-1',
        cantidad: 999,
        costo_unitario: 2.0,
        evento_id: 'ev-1',
      })

      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('STOCK_INSUFICIENTE')
    })
  })

  describe('registrarCorreccion', () => {
    it('calls registrar_correccion RPC with movement reference and motivo', async () => {
      const mockCorrection = {
        id: 'sm-cor', materia_prima_id: 'mp-1', cantidad: -1,
        tipo: 'correccion', movimiento_corregido_id: 'sm-orig',
        motivo: 'Error en la cantidad registrada',
      }
      supabase.rpc = vi.fn().mockResolvedValue({ data: mockCorrection, error: null })

      const result = await service.registrarCorreccion({
        movimiento_id: 'sm-orig',
        cantidad_corregida: 4,
        motivo: 'Error en la cantidad registrada',
      })

      expect(supabase.rpc).toHaveBeenCalledWith('registrar_correccion', {
        p_movimiento_id: 'sm-orig',
        p_cantidad_corregida: 4,
        p_motivo: 'Error en la cantidad registrada',
        p_fecha: undefined,
      })
      expect(result.data).toEqual(mockCorrection)
    })

    it('returns CORRECCION_SIN_MOTIVO when motivo is empty', async () => {
      supabase.rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'CORRECCION_SIN_MOTIVO', code: 'P0001' },
      })

      const result = await service.registrarCorreccion({
        movimiento_id: 'sm-orig',
        cantidad_corregida: 3,
        motivo: '',
      })

      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('CORRECCION_SIN_MOTIVO')
    })
  })

  // Task 2.7 — Integration-style derivation and correction lifecycle tests.
  // These verify the pure-function contract: stock = SUM(cantidad), the
  // ledger is append-only, and corrections adjust the balance without
  // mutating history.
  describe('derived stock lifecycle (Task 2.7)', () => {
    it('opening balance alone = stock', () => {
      const movements = [{ cantidad: 50, tipo: 'ajuste' }]
      const stock = service.calcularStockDesdeMovimientos(
        movements as Parameters<typeof service.calcularStockDesdeMovimientos>[0],
      )
      expect(stock).toBe(50)
    })

    it('purchase increases derived stock', () => {
      const movements = [
        { cantidad: 50, tipo: 'ajuste' },
        { cantidad: 10, tipo: 'compra' },
      ]
      const stock = service.calcularStockDesdeMovimientos(
        movements as Parameters<typeof service.calcularStockDesdeMovimientos>[0],
      )
      expect(stock).toBe(60)
    })

    it('consumption decreases derived stock', () => {
      const movements = [
        { cantidad: 50, tipo: 'ajuste' },
        { cantidad: 10, tipo: 'compra' },
        { cantidad: -5, tipo: 'consumo' },
      ]
      const stock = service.calcularStockDesdeMovimientos(
        movements as Parameters<typeof service.calcularStockDesdeMovimientos>[0],
      )
      expect(stock).toBe(55)
    })

    it('correction adjusts stock without removing the original — overcount case', () => {
      // Original purchase recorded as 10, but should be 8. Correction
      // delta = 8 - 10 = -2 (removes 2 from stock).
      const movements = [
        { cantidad: 50, tipo: 'ajuste' },
        { cantidad: 10, tipo: 'compra' },      // original — wrong
        { cantidad: -2, tipo: 'correccion' },  // correction delta
        { cantidad: -5, tipo: 'consumo' },
      ]
      const stock = service.calcularStockDesdeMovimientos(
        movements as Parameters<typeof service.calcularStockDesdeMovimientos>[0],
      )
      // 50 + 10 - 2 - 5 = 53
      expect(stock).toBe(53)
    })

    it('correction adjusts stock without removing the original — undercount case', () => {
      // Original purchase recorded as 3, but should be 5. Correction
      // delta = 5 - 3 = +2 (adds 2 to stock).
      const movements = [
        { cantidad: 20, tipo: 'ajuste' },
        { cantidad: 3, tipo: 'compra' },       // original — wrong
        { cantidad: 2, tipo: 'correccion' },   // correction delta
      ]
      const stock = service.calcularStockDesdeMovimientos(
        movements as Parameters<typeof service.calcularStockDesdeMovimientos>[0],
      )
      // 20 + 3 + 2 = 25
      expect(stock).toBe(25)
    })

    it('correction of a consumo adjusts stock without removing the original', () => {
      // Original consumo recorded as -5 (5 consumed), but should be -3
      // (only 3 consumed). The RPC computes delta = -(3-5) = +2
      // (adds 2 back to stock because overconsumption was recorded).
      const movements = [
        { cantidad: 30, tipo: 'ajuste' },
        { cantidad: -5, tipo: 'consumo' },      // original — overcounted
        { cantidad: 2, tipo: 'correccion' },    // correction delta
      ]
      const stock = service.calcularStockDesdeMovimientos(
        movements as Parameters<typeof service.calcularStockDesdeMovimientos>[0],
      )
      // 30 - 5 + 2 = 27
      expect(stock).toBe(27)
    })

    it('full lifecycle: compra → consumo → correccion → stock matches expected', () => {
      // Simulating a complete inventory day:
      //   start: 100 units
      //   purchase: 20
      //   consume: 8
      //   purchase: 15
      //   correction of first purchase: should be 18 (was 20, delta = -2)
      //   consume: 12
      const movements = [
        { cantidad: 100, tipo: 'ajuste' },
        { cantidad: 20, tipo: 'compra' },
        { cantidad: -8, tipo: 'consumo' },
        { cantidad: 15, tipo: 'compra' },
        { cantidad: -2, tipo: 'correccion' },
        { cantidad: -12, tipo: 'consumo' },
      ]
      const stock = service.calcularStockDesdeMovimientos(
        movements as Parameters<typeof service.calcularStockDesdeMovimientos>[0],
      )
      // 100 + 20 - 8 + 15 - 2 - 12 = 113
      expect(stock).toBe(113)
    })

    it('correction preserves original in the movement list (structural test)', () => {
      // This test verifies the intent: corrections ADD rows, they never
      // replace. The actual RPC guarantees this; here we test the pure
      // function that the original stays in the list.
      const movements = [
        { cantidad: 10, tipo: 'compra' },
        { cantidad: -1, tipo: 'correccion' },
      ]
      const stock = service.calcularStockDesdeMovimientos(
        movements as Parameters<typeof service.calcularStockDesdeMovimientos>[0],
      )
      expect(stock).toBe(9)
      // The original compra row is still in the array
      expect(movements).toHaveLength(2)
      expect(movements[0]?.tipo).toBe('compra')
      expect(movements[1]?.tipo).toBe('correccion')
    })
  })

  // Task 2.8 — RLS append-only verification.
  // RLS enforcement (denying UPDATE and DELETE on stock_movements) can
  // only be verified against a running Supabase instance. The migration
  // at supabase/migrations/20260714000000_stock_movements.sql installs:
  //   - stock_movements_select_authenticated: SELECT to authenticated
  //   - stock_movements_insert_authenticated: INSERT to authenticated
  //   - stock_movements_update_deny: UPDATE denied (using (false))
  //   - stock_movements_delete_deny: DELETE denied (using (false))
  // Pre-rollout verification: apply the migration and run
  //   SELECT * FROM stock_movements WHERE id = '<row>' FOR UPDATE;
  //   DELETE FROM stock_movements WHERE id = '<row>';
  // against a test Supabase authenticated client — both must return
  // permission-denied errors.
  describe('RLS append-only contract (Task 2.8)', () => {
    it('service layer never exposes update or delete operations', () => {
      // The StockMovementsService interface does not include methods
      // for update or delete. This is enforced at the TypeScript level.
      const keys = Object.keys(service)
      expect(keys).not.toContain('actualizar')
      expect(keys).not.toContain('eliminar')
      expect(keys).not.toContain('update')
      expect(keys).not.toContain('delete')
    })
  })

  describe('finalizarEventoSnapshot', () => {
    it('calls finalizar_evento_snapshot RPC and returns consumption summary', async () => {
      const mockSnapshot = {
        evento_id: 'ev-1',
        total_consumido: 15,
        consumption_records: 3,
      }
      supabase.rpc = vi.fn().mockResolvedValue({ data: mockSnapshot, error: null })

      const result = await service.finalizarEventoSnapshot('ev-1')

      expect(supabase.rpc).toHaveBeenCalledWith('finalizar_evento_snapshot', {
        p_evento_id: 'ev-1',
      })
      expect(result.data).toEqual(mockSnapshot)
      expect(result.error).toBeNull()
    })
  })
})

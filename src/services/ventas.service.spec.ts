// REQ-POS-12, REQ-POS-13, REQ-POS-17, REQ-POS-19, REQ-POS-52,
// REQ-POS-53: ventas service — factory pattern (OCP/DIP), never-throw
// (LSP). `registrarVenta` chains header insert + N item inserts via
// Promise.all so a single item failure is surfaced immediately; on
// failure the service best-effort rolls back the header so the caller
// (store) can retry without orphaned venta rows.
//
// The mock tests cover both the happy path and the rollback path
// without exercising real Supabase transactions — the design §2
// decision to NOT wrap in an RPC is explicit (atomic in v2).
import { beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import {
  __getSupabaseMockCalls,
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import { crearVentasService } from './ventas.service'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, VentaConItems, VentaItem, VentaItemInput } from '@/types'

const mkItemInput = (overrides: Partial<VentaItemInput> = {}): VentaItemInput => ({
  producto_id: 'p-1',
  cantidad: 1,
  precio_unitario: 5,
  subtotal: 5,
  ...overrides,
})

const mkItem = (overrides: Partial<VentaItem> = {}): VentaItem => ({
  id: 'vi-1',
  venta_id: 'v-1',
  producto_id: 'p-1',
  cantidad: 1,
  precio_unitario: 5,
  subtotal: 5,
  costo_unitario: null,
  margen_aplicado: null,
  created_at: '2026-06-19T00:00:00Z',
  ...overrides,
})

const mkVenta = (overrides: Partial<VentaConItems> = {}): VentaConItems => ({
  id: 'v-1',
  evento_id: 'e-1',
  fecha: '2026-06-19T00:00:00Z',
  total: 5,
  metodo_pago: 'efectivo',
  monto_recibido: null,
  cambio: null,
  comprobante_numero: null,
  created_at: '2026-06-19T00:00:00Z',
  items: [],
  ...overrides,
})

let servicio: ReturnType<typeof crearVentasService>

beforeEach(() => {
  __resetSupabaseMock()
  // The mocked `createClient` returns a chainable builder. Cast
  // through unknown so the typed SupabaseClient accepts the mock.
  servicio = crearVentasService(
    createClient('http://x', 'anon') as unknown as SupabaseClient<Database>,
  )
})

describe('ventas.service — registrarVenta (REQ-POS-12, REQ-POS-13)', () => {
  it('inserts the venta header then all items and returns the joined VentaConItems', async () => {
    const header = mkVenta({ id: 'v-1', total: 13.5 })
    const items = [
      mkItem({ id: 'vi-1', venta_id: 'v-1', producto_id: 'p-1', cantidad: 2, precio_unitario: 5, subtotal: 10 }),
      mkItem({ id: 'vi-2', venta_id: 'v-1', producto_id: 'p-2', cantidad: 1, precio_unitario: 3.5, subtotal: 3.5 }),
    ]
    // The chain is header (insert.select.single) then item-1 then item-2
    // (both are plain insert().select() thenables).
    __pushSupabaseResponse<VentaConItems>({ data: header, error: null })
    __pushSupabaseResponse<VentaItem[]>({ data: [items[0]!], error: null })
    __pushSupabaseResponse<VentaItem[]>({ data: [items[1]!], error: null })

    const res = await servicio.registrarVenta({
      evento_id: 'e-1',
      metodo_pago: 'efectivo',
      total: 13.5,
      items: [
        mkItemInput({ producto_id: 'p-1', cantidad: 2, precio_unitario: 5, subtotal: 10 }),
        mkItemInput({ producto_id: 'p-2', cantidad: 1, precio_unitario: 3.5, subtotal: 3.5 }),
      ],
    })

    expect(res.error).toBeNull()
    expect(res.data?.id).toBe('v-1')
    expect(res.data?.items).toHaveLength(2)
    // Items should be tagged with the new venta_id from the header insert.
    expect(res.data?.items[0]?.venta_id).toBe('v-1')
    expect(res.data?.items[1]?.venta_id).toBe('v-1')
  })

  it('forwards costo_unitario + margen_aplicado to the venta_items insert (REQ-FIN-12, REQ-FIN-31)', async () => {
    const header = mkVenta({ id: 'v-1', total: 10 })
    const insertedItem = mkItem({
      id: 'vi-1',
      venta_id: 'v-1',
      producto_id: 'p-1',
      cantidad: 2,
      precio_unitario: 5,
      subtotal: 10,
      costo_unitario: 3.5,
      margen_aplicado: 0.4,
    })
    __pushSupabaseResponse<VentaConItems>({ data: header, error: null })
    __pushSupabaseResponse<VentaItem[]>({ data: [insertedItem], error: null })

    const res = await servicio.registrarVenta({
      evento_id: 'e-1',
      metodo_pago: 'efectivo',
      total: 10,
      items: [
        {
          producto_id: 'p-1',
          cantidad: 2,
          precio_unitario: 5,
          subtotal: 10,
          costo_unitario: 3.5,
          margen_aplicado: 0.4,
        },
      ],
    })

    expect(res.error).toBeNull()
    expect(res.data?.items[0]?.costo_unitario).toBe(3.5)
    expect(res.data?.items[0]?.margen_aplicado).toBeCloseTo(0.4, 4)
    // Verify the actual Supabase insert payload carried the new columns.
    const llamadas = __getSupabaseMockCalls()
    const insertLlamadas = llamadas.filter((l) => l.metodo === 'insert')
    // Last insert is the item — its arg shape is the item payload object.
    const itemInsert = insertLlamadas[insertLlamadas.length - 1]
    const payload = itemInsert?.args[0] as Record<string, unknown>
    expect(payload.costo_unitario).toBe(3.5)
    expect(payload.margen_aplicado).toBeCloseTo(0.4, 4)
  })

  it('forwards null COGS snapshot when not provided (legacy-safe, REQ-FIN-8)', async () => {
    const header = mkVenta({ id: 'v-1', total: 5 })
    const insertedItem = mkItem({ id: 'vi-1', costo_unitario: null, margen_aplicado: null })
    __pushSupabaseResponse<VentaConItems>({ data: header, error: null })
    __pushSupabaseResponse<VentaItem[]>({ data: [insertedItem], error: null })

    await servicio.registrarVenta({
      evento_id: 'e-1',
      metodo_pago: 'efectivo',
      total: 5,
      items: [mkItemInput()],
    })

    const llamadas = __getSupabaseMockCalls()
    const insertLlamadas = llamadas.filter((l) => l.metodo === 'insert')
    const itemInsert = insertLlamadas[insertLlamadas.length - 1]
    const payload = itemInsert?.args[0] as Record<string, unknown>
    expect(payload.costo_unitario).toBeNull()
    expect(payload.margen_aplicado).toBeNull()
  })

  it('rejects when the cart has zero items (REQ-POS-17)', async () => {
    const res = await servicio.registrarVenta({
      evento_id: 'e-1',
      metodo_pago: 'efectivo',
      total: 0,
      items: [],
    })
    expect(res.error?.code).toBe('VENTA_SIN_ITEMS')
    expect(res.data).toBeNull()
    // No Supabase call should have happened — short-circuit before the
    // header insert.
    const llamadas = __getSupabaseMockCalls()
    expect(llamadas.find((l) => l.metodo === 'insert')).toBeUndefined()
  })

  it('returns the first item error and best-effort deletes the header (REQ-POS-12, REQ-POS-19)', async () => {
    const header = mkVenta({ id: 'v-1', total: 10 })
    // Header succeeds.
    __pushSupabaseResponse<VentaConItems>({ data: header, error: null })
    // Item 1 fails.
    __pushSupabaseResponse<VentaItem[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection lost' },
    })
    // Item 2 — never consumed (Promise.all rejects on first error).
    // Header rollback delete succeeds.
    __pushSupabaseResponse<null>({ data: null, error: null })

    const res = await servicio.registrarVenta({
      evento_id: 'e-1',
      metodo_pago: 'efectivo',
      total: 10,
      items: [
        mkItemInput({ producto_id: 'p-1' }),
        mkItemInput({ producto_id: 'p-2' }),
      ],
    })

    expect(res.error).toEqual({ code: 'PGRST301', message: 'connection lost' })
    expect(res.data).toBeNull()
    // Rollback delete should be recorded.
    const llamadas = __getSupabaseMockCalls()
    const insertCount = llamadas.filter((l) => l.metodo === 'insert').length
    const deleteCount = llamadas.filter((l) => l.metodo === 'delete').length
    expect(insertCount).toBeGreaterThanOrEqual(1)
    expect(deleteCount).toBeGreaterThanOrEqual(1)
  })

  it('returns the header error when the header insert fails (no rollback needed)', async () => {
    __pushSupabaseResponse<VentaConItems>({
      data: null,
      error: { code: '42501', message: 'RLS denied' },
    })

    const res = await servicio.registrarVenta({
      evento_id: 'e-1',
      metodo_pago: 'efectivo',
      total: 5,
      items: [mkItemInput()],
    })

    expect(res.error?.code).toBe('42501')
    expect(res.data).toBeNull()
    // No item inserts should have happened.
    const llamadas = __getSupabaseMockCalls()
    expect(llamadas.filter((l) => l.metodo === 'insert').length).toBe(1)
  })
})

describe('ventas.service — listarPorEvento (REQ-POS-12)', () => {
  it('returns the ventas with their items for the evento', async () => {
    __pushSupabaseResponse<VentaConItems[]>({
      data: [mkVenta({ id: 'v-1', items: [mkItem({ id: 'vi-1' })] })],
      error: null,
    })

    const res = await servicio.listarPorEvento('e-1')
    expect(res.error).toBeNull()
    expect(res.data).toHaveLength(1)
    expect(res.data?.[0]?.items).toHaveLength(1)
    const llamadas = __getSupabaseMockCalls()
    expect(llamadas.some((l) => l.metodo === 'from' && l.args[0] === 'ventas')).toBe(true)
    expect(llamadas.some((l) => l.metodo === 'eq' && l.args[0] === 'evento_id' && l.args[1] === 'e-1')).toBe(true)
  })
})

describe('ventas.service — eliminar (REQ-POS-12, REQ-POS-19)', () => {
  it('deletes the venta row (CASCADE removes items)', async () => {
    __pushSupabaseResponse<null>({ data: null, error: null })
    const res = await servicio.eliminar('v-1')
    expect(res.error).toBeNull()
    const llamadas = __getSupabaseMockCalls()
    expect(llamadas.some((l) => l.metodo === 'delete')).toBe(true)
    expect(llamadas.some((l) => l.metodo === 'eq' && l.args[0] === 'id' && l.args[1] === 'v-1')).toBe(true)
  })
})

// pos-redesign (REQ-POS-COMPROBANTE-4): sequential comprobante_numero
// generation per evento. The mocked Supabase chain returns `count:
// undefined`, so the service falls back to `count + 1 = 1` → "V-001".
describe('ventas.service — generarComprobanteNumero (REQ-POS-COMPROBANTE-4)', () => {
  it('returns V-001 for the first comprobante in an evento', async () => {
    __pushSupabaseResponse<unknown>({ data: null, error: null })
    const res = await servicio.generarComprobanteNumero('e-1')
    expect(res).toBe('V-001')
    // Verify the query shape: from ventas, scoped to evento_id, and
    // filtered by comprobante_numero NOT NULL (legacy-safe count).
    const llamadas = __getSupabaseMockCalls()
    expect(llamadas.some((l) => l.metodo === 'from' && l.args[0] === 'ventas')).toBe(true)
    expect(
      llamadas.some(
        (l) => l.metodo === 'select' && (l.args[0] as string).includes('*'),
      ),
    ).toBe(true)
    expect(llamadas.some((l) => l.metodo === 'eq' && l.args[0] === 'evento_id' && l.args[1] === 'e-1')).toBe(true)
    expect(
      llamadas.some(
        (l) =>
          l.metodo === 'not' &&
          l.args[0] === 'comprobante_numero' &&
          l.args[1] === 'is' &&
          l.args[2] === null,
      ),
    ).toBe(true)
  })

  it('returns a 3-digit zero-padded comprobante_numero (format invariant)', async () => {
    __pushSupabaseResponse<unknown>({ data: null, error: null })
    const res = await servicio.generarComprobanteNumero('e-1')
    // V-001 is the only format the helper produces.
    expect(res).toMatch(/^V-\d{3}$/)
  })
})
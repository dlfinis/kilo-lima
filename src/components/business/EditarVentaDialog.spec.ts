// EditarVentaDialog.spec.ts
// Tests for the sale-correction dialog. The dialog shows the
// before/after snapshot side-by-side, requires a motivo, and emits
// the input payload for the store's corregirVenta to apply.
// Pure presentational — receives the original venta, emits a typed
// payload on submit. The parent owns the store call.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import EditarVentaDialog from './EditarVentaDialog.vue'
import type { VentaConItems, VentaItemInput } from '@/types'

const vuetify = createVuetify({ components, directives })

let wrappersActivos: VueWrapper[] = []

beforeEach(() => {
  wrappersActivos = []
})

afterEach(() => {
  for (const w of wrappersActivos) w.unmount()
  wrappersActivos = []
})

const mkVenta = (overrides: Partial<VentaConItems> = {}): VentaConItems => ({
  id: 'v-1',
  evento_id: 'e-1',
  fecha: '2026-07-15T13:45:00Z',
  total: 25,
  metodo_pago: 'efectivo',
  monto_recibido: 30,
  cambio: 5,
  comprobante_numero: 'V-001',
  created_at: '2026-07-15T13:45:00Z',
  items: [
    {
      id: 'vi-1',
      venta_id: 'v-1',
      producto_id: 'p-1',
      cantidad: 2,
      precio_unitario: 10,
      subtotal: 20,
      costo_unitario: null,
      margen_aplicado: null,
      // Review finding #6: evento_producto_id now lives on
      // VentaItem (was previously omitted from the hand-rolled
      // domain type even though the DB column exists).
      evento_producto_id: null,
      created_at: '2026-07-15T13:45:00Z',
    },
    {
      id: 'vi-2',
      venta_id: 'v-1',
      producto_id: 'p-2',
      cantidad: 1,
      precio_unitario: 5,
      subtotal: 5,
      costo_unitario: null,
      margen_aplicado: null,
      evento_producto_id: null,
      created_at: '2026-07-15T13:45:00Z',
    },
  ],
  ...overrides,
})

const mountDialog = (props?: {
  modelValue?: boolean
  venta?: VentaConItems | null
  productosDisponibles?: Array<{ id: string; nombre: string; precio_venta: number }>
}) => {
  const p = props ?? {}
  const wrapper = mount(EditarVentaDialog, {
    attachTo: document.body,
    props: {
      modelValue: p.modelValue ?? true,
      venta: p.venta === undefined ? mkVenta() : p.venta,
      productosDisponibles: p.productosDisponibles ?? [
        { id: 'p-1', nombre: 'Brownies', precio_venta: 10 },
        { id: 'p-2', nombre: 'Galletas', precio_venta: 5 },
      ],
    },
    global: { plugins: [vuetify] },
  })
  wrappersActivos.push(wrapper)
  return wrapper
}

describe('EditarVentaDialog', () => {
  it('renders the comprobante_numero and total in the header', () => {
    mountDialog()
    expect(document.body.textContent).toContain('V-001')
    expect(document.body.textContent).toMatch(/25[.,]00/)
  })

  it('disables the submit button when motivo is empty (REQ-POS-CORRECCION-3)', async () => {
    const wrapper = mountDialog()
    await wrapper.vm.$nextTick()
    const boton = document.querySelector(
      '[data-testid="editar-venta-aplicar"]',
    ) as HTMLButtonElement | null
    expect(boton).toBeTruthy()
    expect(boton?.disabled).toBe(true)
  })

  it('enables submit only when motivo has non-whitespace text', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as { motivo: string }
    vm.motivo = 'Cliente pidió factura'
    await wrapper.vm.$nextTick()
    const boton = document.querySelector(
      '[data-testid="editar-venta-aplicar"]',
    ) as HTMLButtonElement | null
    expect(boton?.disabled).toBe(false)
  })

  it('emits the correction payload on submit (REQ-POS-CORRECCION-1)', async () => {
    const venta = mkVenta({ id: 'v-1', comprobante_numero: 'V-001' })
    const wrapper = mountDialog({ venta })
    const vm = wrapper.vm as unknown as {
      motivo: string
      aplicar: () => void
    }
    vm.motivo = 'ajuste'
    await wrapper.vm.$nextTick()
    vm.aplicar()
    await wrapper.vm.$nextTick()
    const emits = wrapper.emitted('corregir') ?? []
    expect(emits).toHaveLength(1)
    const payload = emits[0]?.[0] as {
      ventaId: string
      nuevoTotal: number
      motivo: string
      nuevosItems: VentaItemInput[]
    }
    expect(payload.ventaId).toBe('v-1')
    expect(payload.motivo).toBe('ajuste')
    expect(payload.nuevoTotal).toBe(25)
    // items carry the original product/cantidad/pricing
    expect(payload.nuevosItems).toHaveLength(2)
    expect(payload.nuevosItems[0]?.producto_id).toBe('p-1')
    expect(payload.nuevosItems[0]?.cantidad).toBe(2)
  })

  // Issue: stale state on cancel → reopen of the same sale.
  //
  // The watcher on `props.venta` only fires when the prop REFERENCE
  // changes. When the operator cancels the dialog for sale A and
  // reopens it for the SAME sale A, Vue hands the same venta object
  // back so the watcher never re-runs and the previous motivo/items/
  // payment edits leak into the new session.
  //
  // Fix: also reset local state on the false→true transition of
  // `modelValue`. The cancel→reopen path is the canonical case
  // (modelValue toggles but the venta reference does not change).
  it('resets motivo / items / payment when the dialog reopens for the same sale', async () => {
    const venta = mkVenta({ id: 'v-1' })
    const wrapper = mountDialog({ venta, modelValue: true })
    const vm = wrapper.vm as unknown as {
      motivo: string
      items: VentaItemInput[]
      metodoPago: string
      montoRecibido: number | null
    }
    // Operator types a motivo + tweaks payment + removes a line.
    vm.motivo = 'cliente pidió factura'
    vm.metodoPago = 'transferencia'
    vm.montoRecibido = null
    // Simulate "eliminar la segunda línea" by emptying items.
    vm.items = [vm.items[0]!]
    await wrapper.vm.$nextTick()
    expect(vm.motivo).toBe('cliente pidió factura')
    expect(vm.items).toHaveLength(1)

    // Cancel: parent flips modelValue to false (venta reference is
    // unchanged because the parent never reassigned it).
    await wrapper.setProps({ modelValue: false })
    // Reopen for the SAME sale (no venta prop change).
    await wrapper.setProps({ modelValue: true })
    await wrapper.vm.$nextTick()

    // Local state must be reset to the fresh sale snapshot, not the
    // stale edit. motivo is required-empty (so the submit button is
    // disabled until the operator types again), items are back to
    // the full original list, payment is back to the original.
    expect(vm.motivo).toBe('')
    expect(vm.items).toHaveLength(2)
    expect(vm.metodoPago).toBe('efectivo')
    expect(vm.montoRecibido).toBe(30)
  })

  it('still resets state when the operator opens a DIFFERENT sale (ventas watcher path)', async () => {
    // Triangulation: the cancel→reopen fix should not regress the
    // existing "switch to a different sale" path. The watcher on
    // `props.venta` already resets state when the venta reference
    // changes; we want both paths to converge on the same fresh state.
    const ventaA = mkVenta({ id: 'v-1' })
    const ventaB = mkVenta({ id: 'v-2', total: 7 })
    const wrapper = mountDialog({ venta: ventaA, modelValue: true })
    const vm = wrapper.vm as unknown as {
      motivo: string
      items: VentaItemInput[]
    }
    vm.motivo = 'edit en venta A'
    await wrapper.vm.$nextTick()

    // Open the dialog for venta B (same modelValue=true — the parent
    // just swaps the venta). The ventas watcher must reset state.
    await wrapper.setProps({ venta: ventaB })
    await wrapper.vm.$nextTick()

    expect(vm.motivo).toBe('')
    expect(vm.items).toHaveLength(2)
  })
})
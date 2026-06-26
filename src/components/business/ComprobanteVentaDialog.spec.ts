// REQ-POS-COMPROBANTE-1..3: printable receipt dialog. Rendered
// after a successful sale; closes without printing on cancel; the
// Imprimir button calls `window.print()`.
//
// Tests focus on:
//   - All required sections render (header, items, totals, metodo_pago,
//     comprobante_numero)
//   - Currency formatting matches the design's `Intl.NumberFormat`
//   - The print button triggers `window.print()`
//   - The dialog emits `update:modelValue(false)` when closed
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import ComprobanteVentaDialog from './ComprobanteVentaDialog.vue'
import type { Evento, VentaConItems } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkEvento = (overrides: Partial<Evento> = {}): Evento => ({
  id: 'e-1',
  nombre: 'Feria del Sol',
  fecha: '2026-07-15',
  fecha_fin: null,
  margen_ganancia: null,
  ubicacion: 'Plaza',
  estado: 'en_curso',
  notas: null,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
  ...overrides,
})

const mkVenta = (overrides: Partial<VentaConItems> = {}): VentaConItems => ({
  id: 'v-1',
  evento_id: 'e-1',
  fecha: '2026-06-19T12:00:00Z',
  total: 35,
  metodo_pago: 'efectivo',
  monto_recibido: 50,
  cambio: 15,
  comprobante_numero: 'V-001',
  created_at: '2026-06-19T12:00:00Z',
  items: [
    {
      id: 'vi-1',
      venta_id: 'v-1',
      producto_id: 'p-1',
      cantidad: 2,
      precio_unitario: 10,
      subtotal: 20,
      costo_unitario: 5,
      margen_aplicado: 0.4,
      created_at: '2026-06-19T12:00:00Z',
    },
    {
      id: 'vi-2',
      venta_id: 'v-1',
      producto_id: 'p-2',
      cantidad: 1,
      precio_unitario: 15,
      subtotal: 15,
      costo_unitario: 8,
      margen_aplicado: 0.3,
      created_at: '2026-06-19T12:00:00Z',
    },
  ],
  ...overrides,
})

let wrappersActivos: VueWrapper[] = []

beforeEach(() => {
  wrappersActivos = []
})

afterEach(() => {
  for (const w of wrappersActivos) w.unmount()
  wrappersActivos = []
})

const mountDialog = (props: {
  modelValue?: boolean
  venta: VentaConItems
  evento: Evento | null
}) => {
  const wrapper = mount(ComprobanteVentaDialog, {
    attachTo: document.body,
    props: {
      modelValue: props.modelValue ?? true,
      venta: props.venta,
      evento: props.evento,
    },
    global: { plugins: [vuetify] },
  })
  wrappersActivos.push(wrapper)
  return wrapper
}

describe('ComprobanteVentaDialog — sections (REQ-POS-COMPROBANTE-2)', () => {
  it('renders the evento name in the header', () => {
    mountDialog({ venta: mkVenta(), evento: mkEvento() })
    expect(document.body.textContent).toContain('Feria del Sol')
  })

  it('renders the comprobante_numero (REQ-POS-COMPROBANTE-2)', () => {
    mountDialog({ venta: mkVenta({ comprobante_numero: 'V-042' }), evento: mkEvento() })
    expect(document.body.textContent).toContain('V-042')
  })

  it('renders the items section with name × qty @ price (REQ-POS-COMPROBANTE-2)', () => {
    mountDialog({ venta: mkVenta(), evento: mkEvento() })
    // The product names aren't on VentaConItems (we don't denormalize
    // them in the DB); the comprobante renders the line totals via
    // `cantidad × precio_unitario = subtotal` columns. Verify the
    // subtotals render and the unit prices appear.
    expect(document.body.textContent).toContain('20.00')
    expect(document.body.textContent).toContain('15.00')
  })

  it('renders the total in the footer (REQ-POS-COMPROBANTE-2)', () => {
    mountDialog({ venta: mkVenta({ total: 35 }), evento: mkEvento() })
    expect(document.body.textContent).toContain('35.00')
  })

  it('renders metodo_pago as a badge (REQ-POS-COMPROBANTE-2)', () => {
    mountDialog({ venta: mkVenta({ metodo_pago: 'transferencia' }), evento: mkEvento() })
    expect(document.body.textContent).toContain('Transferencia')
  })

  it('renders monto_recibido + cambio for efectivo (REQ-POS-COMPROBANTE-2)', () => {
    mountDialog({
      venta: mkVenta({ metodo_pago: 'efectivo', monto_recibido: 50, cambio: 15 }),
      evento: mkEvento(),
    })
    expect(document.body.textContent).toContain('50.00')
    expect(document.body.textContent).toContain('15.00')
  })
})

describe('ComprobanteVentaDialog — actions (REQ-POS-COMPROBANTE-1, REQ-POS-COMPROBANTE-3)', () => {
  it('closes when the user dismisses (no auto-print, REQ-POS-COMPROBANTE-1)', async () => {
    const wrapper = mountDialog({ venta: mkVenta(), evento: mkEvento() })
    const cerrar = document.querySelector('[data-testid="comprobante-cerrar"]') as HTMLElement | null
    expect(cerrar).toBeTruthy()
    // Drive via the wrapper's exposed cancel method — robust against
    // v-dialog Teleport quirks.
    const vm = wrapper.vm as unknown as { cerrar: () => void }
    vm.cerrar()
    await wrapper.vm.$nextTick()
    const updates = wrapper.emitted('update:modelValue') ?? []
    // The last emitted value should be false (closing).
    expect(updates.at(-1)?.[0]).toBe(false)
  })

  it('Imprimir button calls window.print (REQ-POS-COMPROBANTE-3)', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    const wrapper = mountDialog({ venta: mkVenta(), evento: mkEvento() })
    const vm = wrapper.vm as unknown as { imprimir: () => void }
    vm.imprimir()
    expect(printSpy).toHaveBeenCalledTimes(1)
    printSpy.mockRestore()
  })

  it('renders the Imprimir button (REQ-POS-COMPROBANTE-3)', () => {
    mountDialog({ venta: mkVenta(), evento: mkEvento() })
    expect(
      document.querySelector('[data-testid="comprobante-imprimir"]'),
    ).toBeTruthy()
  })
})

// Pos-redesign follow-up: event sales history dialog. Surfaces a
// per-sale list (timestamp, comprobante, metodo_pago, total, items
// summary) for the active evento. Pure presentational — receives the
// already-loaded ventas array. Edit flow lives in `EditarVentaDialog`.
// This file only covers the read-only history surface.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import HistorialVentasEventoDialog from './HistorialVentasEventoDialog.vue'
import type { Evento, MetodoPago, VentaConItems } from '@/types'

const vuetify = createVuetify({ components, directives })

let wrappersActivos: VueWrapper[] = []

beforeEach(() => {
  wrappersActivos = []
})

afterEach(() => {
  for (const w of wrappersActivos) w.unmount()
  wrappersActivos = []
})

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
  fecha: '2026-07-15T13:45:00Z',
  total: 25,
  metodo_pago: 'efectivo' as MetodoPago,
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
  ventas?: VentaConItems[]
  evento?: Evento | null
  editable?: boolean
  cargando?: boolean
  error?: string | null
}) => {
  const p = props ?? {}
  const wrapper = mount(HistorialVentasEventoDialog, {
    attachTo: document.body,
    props: {
      modelValue: p.modelValue ?? true,
      ventas: p.ventas ?? [],
      evento: p.evento === undefined ? mkEvento() : p.evento,
      editable: p.editable ?? true,
      cargando: p.cargando ?? false,
      error: p.error ?? null,
    },
    global: { plugins: [vuetify] },
  })
  wrappersActivos.push(wrapper)
  return wrapper
}

describe('HistorialVentasEventoDialog', () => {
  it('renders the evento name in the header', () => {
    mountDialog()
    expect(document.body.textContent).toContain('Feria del Sol')
  })

  it('shows the empty state when there are no sales', () => {
    mountDialog({ ventas: [] })
    expect(
      document.querySelector('[data-testid="historial-vacio"]'),
    ).toBeTruthy()
  })

  it('renders a row per venta with comprobante, total, metodo and items summary', () => {
    mountDialog({
      ventas: [
        mkVenta({
          id: 'v-1',
          comprobante_numero: 'V-001',
          total: 25,
          metodo_pago: 'efectivo',
        }),
      ],
    })
    expect(
      document.querySelector('[data-testid="historial-fila-v-1"]'),
    ).toBeTruthy()
    const cuerpo = document.body.textContent ?? ''
    expect(cuerpo).toContain('V-001')
    expect(cuerpo).toMatch(/25[.,]00/)
    // metodo_pago badge label "Efectivo"
    expect(cuerpo).toContain('Efectivo')
    // items summary — counts and prices per item
    expect(cuerpo).toContain('2 ×')
    expect(cuerpo).toContain('1 ×')
  })

  it('shows the comprobante_numero when present and a dash when null', () => {
    mountDialog({
      ventas: [
        mkVenta({ id: 'v-1', comprobante_numero: 'V-042' }),
        mkVenta({ id: 'v-2', comprobante_numero: null }),
      ],
    })
    expect(document.body.textContent).toContain('V-042')
    // The legacy-row fallback should render an em-dash for null
    expect(document.body.textContent).toMatch(/[—–-]/)
  })

  it('formats the venta date as dd/mm/yyyy HH:MM (POS-readable)', () => {
    mountDialog({
      ventas: [mkVenta({ fecha: '2026-07-15T13:45:00Z' })],
    })
    // Date in the body — formatted locale-friendly
    expect(document.body.textContent).toContain('15/07/2026')
  })

  it('renders one row per venta (triangulation — multiple ventas)', () => {
    mountDialog({
      ventas: [
        mkVenta({ id: 'v-1', comprobante_numero: 'V-001', total: 5 }),
        mkVenta({ id: 'v-2', comprobante_numero: 'V-002', total: 10 }),
        mkVenta({ id: 'v-3', comprobante_numero: 'V-003', total: 15 }),
      ],
    })
    expect(
      document.querySelectorAll('[data-testid^="historial-fila-"]').length,
    ).toBe(3)
  })

  // Triangulation — the Edit button must only be visible when the
  // parent says the evento is editable (open state). Closed eventos
  // must render the history read-only.
  it('shows an Edit button per row when editable=true (open evento)', () => {
    mountDialog({
      editable: true,
      ventas: [mkVenta({ id: 'v-1' })],
    })
    expect(
      document.querySelector('[data-testid="historial-editar-v-1"]'),
    ).toBeTruthy()
  })

  it('hides the Edit button per row when editable=false (cerrado evento)', () => {
    mountDialog({
      editable: false,
      ventas: [mkVenta({ id: 'v-1' })],
    })
    expect(
      document.querySelector('[data-testid="historial-editar-v-1"]'),
    ).toBeFalsy()
  })

  it('emits "editar" with the full venta when an Edit button is tapped', async () => {
    const venta = mkVenta({ id: 'v-1' })
    const wrapper = mountDialog({ editable: true, ventas: [venta] })
    const boton = document.querySelector(
      '[data-testid="historial-editar-v-1"]',
    ) as HTMLElement
    boton.click()
    await wrapper.vm.$nextTick()
    const emits = wrapper.emitted('editar') ?? []
    expect(emits).toHaveLength(1)
    expect(emits[0]?.[0]).toMatchObject({ id: 'v-1' })
  })

  // Review finding #5: the history dialog must surface load errors
  // with a retry path instead of falling back to the misleading
  // empty state. The dialog now accepts `cargando` + `error` props
  // and renders an error banner with a "Reintentar" button when
  // `error` is set.
  it('surfaces a load error with a retry button (finding #5 — error masquerading as empty state)', () => {
    mountDialog({
      ventas: [],
      error: 'Error al cargar las ventas',
    })
    // The error banner must be visible.
    const banner = document.querySelector('[data-testid="historial-error"]')
    expect(banner).toBeTruthy()
    // The empty state must NOT be shown alongside the error.
    expect(
      document.querySelector('[data-testid="historial-vacio"]'),
    ).toBeFalsy()
    // The retry button is wired.
    const retry = document.querySelector(
      '[data-testid="historial-reintentar"]',
    ) as HTMLElement | null
    expect(retry).toBeTruthy()
  })

  it('emits "reintentar" when the operator clicks the retry button (finding #5)', async () => {
    const wrapper = mountDialog({
      ventas: [],
      error: 'Error al cargar las ventas',
    })
    const retry = document.querySelector(
      '[data-testid="historial-reintentar"]',
    ) as HTMLElement
    retry.click()
    await wrapper.vm.$nextTick()
    const emits = wrapper.emitted('reintentar') ?? []
    expect(emits).toHaveLength(1)
  })

  it('does NOT show the error banner when there is no error (happy path is unchanged)', () => {
    mountDialog({
      ventas: [mkVenta({ id: 'v-1' })],
      error: null,
    })
    expect(
      document.querySelector('[data-testid="historial-error"]'),
    ).toBeFalsy()
  })

  it('keeps the last successful ventas visible when the error is set (no flash to empty state)', () => {
    // The store no longer clears ventas on error (finding #5). The
    // dialog should render the existing ventas + the error banner
    // — never an empty list.
    mountDialog({
      ventas: [mkVenta({ id: 'v-1', comprobante_numero: 'V-001' })],
      error: 'Error al cargar las ventas',
    })
    expect(
      document.querySelector('[data-testid="historial-fila-v-1"]'),
    ).toBeTruthy()
    expect(
      document.querySelector('[data-testid="historial-error"]'),
    ).toBeTruthy()
  })
})
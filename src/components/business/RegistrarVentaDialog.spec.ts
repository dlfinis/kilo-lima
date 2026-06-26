// REQ-POS-12, REQ-POS-48, REQ-POS-54: confirmation dialog for
// registering a venta. Shows the total, the active evento, and a
// metodo_pago selector. The dialog is purely presentational — emits
// `confirmar` with the chosen metodo_pago so the parent view owns
// the actual `registrarVenta` call (the optimistic UI / revert
// lives in the store, not here).
//
// v-dialog uses Teleport, so button click flows are exercised in
// PosView.spec.ts at the integration level. This component spec
// focuses on the structure + default metodo_pago.
//
// pos-redesign (REQ-POS-CAMBIO-1, REQ-POS-CAMBIO-3, REQ-POS-57): when
// metodo_pago === 'efectivo', the dialog shows a monto_recibido input,
// a live cambio preview, and an EXACTO button. The confirm emit now
// carries the optional monto_recibido so the store can validate.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import RegistrarVentaDialog from './RegistrarVentaDialog.vue'
import type { Evento, MetodoPago } from '@/types'

const vuetify = createVuetify({ components, directives })

// Each test mounts the dialog with `attachTo: document.body` (v-dialog
// uses Teleport). Without cleanup, prior dialogs linger in the body
// and `document.querySelector` returns the wrong instance. Track
// wrappers and unmount them between tests.
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

const mountDialog = (props?: {
  modelValue?: boolean
  total?: number
  evento?: Evento | null
  metodoPago?: MetodoPago
}) => {
  const p = props ?? {}
  const wrapper = mount(RegistrarVentaDialog, {
    attachTo: document.body,
    props: {
      modelValue: p.modelValue ?? true,
      total: p.total ?? 13.5,
      evento: p.evento === undefined ? mkEvento() : p.evento,
    },
    global: { plugins: [vuetify] },
  })
  wrappersActivos.push(wrapper)
  return wrapper
}

// Switches metodo_pago on a mounted dialog and awaits the DOM update.
// The component exposes `establecerMetodoPago` so the test can mutate
// the same ref the v-select binds to (mutating `vm.metodoPago` from
// outside script-setup doesn't update the underlying ref via the
// test-utils proxy).
async function cambiarMetodoPago(
  wrapper: ReturnType<typeof mountDialog>,
  metodo: MetodoPago,
): Promise<void> {
  const vm = wrapper.vm as unknown as {
    establecerMetodoPago: (m: MetodoPago) => void
  }
  vm.establecerMetodoPago(metodo)
  await wrapper.vm.$nextTick()
}

describe('RegistrarVentaDialog', () => {
  it('shows the total and the evento name (REQ-POS-12, REQ-POS-48)', () => {
    mountDialog({ total: 13.5 })
    expect(document.body.textContent).toContain('Feria del Sol')
    expect(document.body.textContent).toMatch(/13[.,]50/)
  })

  it('defaults the metodo_pago to efectivo (REQ-POS-12)', () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as { metodoPago: MetodoPago }
    expect(vm.metodoPago).toBe('efectivo')
  })

  it('renders Registrar + Cancelar buttons inside the dialog (REQ-POS-12)', () => {
    mountDialog()
    const confirmar = document.querySelector(
      '[data-testid="registrar-venta-confirmar"]',
    )
    const cancelar = document.querySelector(
      '[data-testid="registrar-venta-cancelar"]',
    )
    expect(confirmar?.textContent).toContain('Registrar')
    expect(cancelar?.textContent).toContain('Cancelar')
  })

  it('offers all 4 metodo_pago options in the selector (REQ-POS-12)', () => {
    const wrapper = mountDialog()
    const opciones = (wrapper.vm as unknown as {
      opciones: { value: MetodoPago; label: string }[]
    }).opciones
    const values = opciones.map((o) => o.value)
    expect(values).toEqual(['efectivo', 'transferencia', 'tarjeta', 'mixto'])
  })

  it('renders without an evento (the view still allows the dialog)', () => {
    mountDialog({ evento: null })
    expect(document.body.textContent).toContain('Sin evento')
  })
})

// pos-redesign: efectivo-specific surface (REQ-POS-CAMBIO-1, REQ-POS-CAMBIO-3,
// REQ-POS-57). monto_recibido input + live cambio + EXACTO button.
describe('RegistrarVentaDialog — efectivo UX (REQ-POS-CAMBIO-1, REQ-POS-CAMBIO-3)', () => {
  it('shows the monto_recibido input when metodo_pago is efectivo', async () => {
    const wrapper = mountDialog()
    await cambiarMetodoPago(wrapper, 'efectivo')
    expect(
      document.querySelector('[data-testid="registrar-venta-monto"]'),
    ).toBeTruthy()
  })

  it('shows the EXACTO button when metodo_pago is efectivo (REQ-POS-CAMBIO-3)', async () => {
    const wrapper = mountDialog()
    await cambiarMetodoPago(wrapper, 'efectivo')
    expect(
      document.querySelector('[data-testid="registrar-venta-exacto"]'),
    ).toBeTruthy()
  })

  it('hides monto_recibido + EXACTO when metodo_pago is transferencia (REQ-POS-CAMBIO-1)', async () => {
    const wrapper = mountDialog()
    await cambiarMetodoPago(wrapper, 'transferencia')
    expect(
      document.querySelector('[data-testid="registrar-venta-monto"]'),
    ).toBeFalsy()
    expect(
      document.querySelector('[data-testid="registrar-venta-exacto"]'),
    ).toBeFalsy()
  })

  it('hides monto_recibido + EXACTO when metodo_pago is tarjeta', async () => {
    const wrapper = mountDialog()
    await cambiarMetodoPago(wrapper, 'tarjeta')
    expect(
      document.querySelector('[data-testid="registrar-venta-monto"]'),
    ).toBeFalsy()
    expect(
      document.querySelector('[data-testid="registrar-venta-exacto"]'),
    ).toBeFalsy()
  })

  it('EXACTO sets montoRecibido = total (REQ-POS-CAMBIO-3)', async () => {
    const wrapper = mountDialog({ total: 50 })
    await cambiarMetodoPago(wrapper, 'efectivo')
    const vm = wrapper.vm as unknown as {
      montoRecibido: number | null
      exacto: () => void
    }
    vm.exacto()
    expect(vm.montoRecibido).toBe(50)
  })

  it('cambio is computed live = montoRecibido - total (REQ-POS-CAMBIO-2)', async () => {
    const wrapper = mountDialog({ total: 35 })
    await cambiarMetodoPago(wrapper, 'efectivo')
    const vm = wrapper.vm as unknown as {
      montoRecibido: number | null
      cambio: number | null
    }
    vm.montoRecibido = 51
    await wrapper.vm.$nextTick()
    expect(vm.cambio).toBe(16)
  })

  it('confirmar emits { metodoPago, montoRecibido? } (REQ-POS-CAMBIO-3, widened contract)', async () => {
    const wrapper = mountDialog({ total: 35 })
    await cambiarMetodoPago(wrapper, 'efectivo')
    const vm = wrapper.vm as unknown as {
      montoRecibido: number | null
      alConfirmar: () => void
    }
    vm.montoRecibido = 51
    await wrapper.vm.$nextTick()
    // The RegistrarVentaDialog uses v-dialog → Teleport, so the
    // button isn't reachable via wrapper.find. PosView.spec.ts uses
    // the same approach: drive the emit directly through the
    // script-setup exposed function.
    vm.alConfirmar()
    const emits = wrapper.emitted('confirmar') ?? []
    expect(emits).toHaveLength(1)
    // The new emit shape is an object { metodoPago, montoRecibido? }.
    expect(emits[0]?.[0]).toEqual({ metodoPago: 'efectivo', montoRecibido: 51 })
  })

  it('confirmar emits { metodoPago } (no montoRecibido) for transferencia (REQ-POS-CAMBIO-3)', async () => {
    const wrapper = mountDialog({ total: 35 })
    await cambiarMetodoPago(wrapper, 'transferencia')
    const vm = wrapper.vm as unknown as { alConfirmar: () => void }
    vm.alConfirmar()
    const emits = wrapper.emitted('confirmar') ?? []
    expect(emits).toHaveLength(1)
    // Non-efectivo methods do NOT carry montoRecibido in the payload.
    expect(emits[0]?.[0]).toEqual({ metodoPago: 'transferencia' })
  })
})
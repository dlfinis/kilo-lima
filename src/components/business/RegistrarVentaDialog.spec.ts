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
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import RegistrarVentaDialog from './RegistrarVentaDialog.vue'
import type { Evento, MetodoPago } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkEvento = (overrides: Partial<Evento> = {}): Evento => ({
  id: 'e-1',
  nombre: 'Feria del Sol',
  fecha: '2026-07-15',
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
}) => {
  const p = props ?? {}
  return mount(RegistrarVentaDialog, {
    attachTo: document.body,
    props: {
      modelValue: p.modelValue ?? true,
      total: p.total ?? 13.5,
      evento: p.evento === undefined ? mkEvento() : p.evento,
    },
    global: { plugins: [vuetify] },
  })
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
    mountDialog()
    // The v-select renders the labels as chips once open. Assert the
    // source options are available by checking the script-rendered
    // options list is non-empty (the component already exposes a
    // computed label for the current value, so we use the open API).
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
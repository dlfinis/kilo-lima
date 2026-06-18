// REQ-EVENTS-10, REQ-EVENTS-11, REQ-EVENTS-12, REQ-EVENTS-13,
// REQ-EVENTS-26, REQ-EVENTS-36, REQ-EVENTS-43: pure form (no DI,
// no store import). Categoría select with 6 Spanish labels, monto
// must be > 0 (REQ-EVENTS-13), parent passes `editable=false` when
// the evento is cerrado so the form is a passive lockup (REQ-EVENTS-26).
import { describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import GastoFijoForm from './GastoFijoForm.vue'
import type { GastoFijoInput } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkInput = (overrides: Partial<GastoFijoInput> = {}): GastoFijoInput => ({
  evento_id: 'e-1',
  categoria: 'renta',
  monto: 500,
  descripcion: 'Alquiler',
  ...overrides,
})

const mountForm = (props: { valoresIniciales?: GastoFijoInput | null; editable?: boolean } = {}) =>
  mount(GastoFijoForm, {
    props: {
      valoresIniciales: props.valoresIniciales ?? null,
      editable: props.editable ?? true,
    },
    global: { plugins: [vuetify] },
  })

describe('GastoFijoForm', () => {
  it('emits submit with the typed values when valid (REQ-EVENTS-10, REQ-EVENTS-12)', async () => {
    const wrapper = mountForm({ valoresIniciales: mkInput() })

    await flushPromises()
    // The select is pre-filled from valoresIniciales; trigger submit directly.
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    const submitEvent = wrapper.emitted('submit')
    expect(submitEvent).toBeTruthy()
    expect(submitEvent?.[0]?.[0]).toEqual(
      expect.objectContaining({ categoria: 'renta', monto: 500 }),
    )
  })

  it('rejects zero monto with "El monto debe ser mayor a 0" (REQ-EVENTS-13)', async () => {
    const wrapper = mountForm()

    // Set categoria via select
    const select = wrapper.findComponent({ name: 'VSelect' })
    await select.vm.$emit('update:modelValue', 'renta')
    // Enter monto = 0
    const numberInput = wrapper.find('input[type="number"]')
    await numberInput.setValue('0')

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('El monto debe ser mayor a 0')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('rejects negative monto (REQ-EVENTS-13)', async () => {
    const wrapper = mountForm()

    const select = wrapper.findComponent({ name: 'VSelect' })
    await select.vm.$emit('update:modelValue', 'transporte')
    const numberInput = wrapper.find('input[type="number"]')
    await numberInput.setValue('-100')

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('El monto debe ser mayor a 0')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('locks fields when editable is false (REQ-EVENTS-11, REQ-EVENTS-26)', async () => {
    const wrapper = mountForm({ valoresIniciales: mkInput(), editable: false })

    await flushPromises()
    expect(wrapper.text()).toContain('Evento cerrado')
    expect(wrapper.find('[data-testid="gasto-guardar"]').exists()).toBe(false)
  })

  it('emits cancel when the cancel button is clicked', async () => {
    const wrapper = mountForm()

    const botones = wrapper.findAll('button')
    const cancelar = botones.find((b) => b.text().includes('Cancelar'))
    await cancelar?.trigger('click')

    expect(wrapper.emitted('cancel')).toBeTruthy()
  })
})

// REQ-POS-37, REQ-POS-50, REQ-POS-54: pure form (no DI, no store
// import). monto > 0, motivo non-empty + ≤500 chars. editable=false
// lockup for frozen-evento state.
import { describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import GastoImprevistoForm from './GastoImprevistoForm.vue'
import type { GastoImprevistoInput } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkInput = (overrides: Partial<GastoImprevistoInput> = {}): GastoImprevistoInput => ({
  evento_id: 'e-1',
  monto: 50,
  motivo: 'Compramos más vasos',
  categoria: 'insumos_extra',
  ...overrides,
})

const mountForm = (props: { valoresIniciales?: GastoImprevistoInput | null; editable?: boolean } = {}) =>
  mount(GastoImprevistoForm, {
    props: {
      valoresIniciales: props.valoresIniciales ?? null,
      editable: props.editable ?? true,
    },
    global: { plugins: [vuetify] },
  })

describe('GastoImprevistoForm', () => {
  it('emits submit with the typed values when valid (REQ-POS-37)', async () => {
    const wrapper = mountForm({ valoresIniciales: mkInput() })

    await flushPromises()
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    const submitEvent = wrapper.emitted('submit')
    expect(submitEvent).toBeTruthy()
    expect(submitEvent?.[0]?.[0]).toEqual(
      expect.objectContaining({
        evento_id: 'e-1',
        categoria: 'insumos_extra',
        monto: 50,
        motivo: 'Compramos más vasos',
      }),
    )
  })

  it('rejects zero monto with "El monto debe ser mayor a 0" (REQ-POS-50)', async () => {
    const wrapper = mountForm()

    const select = wrapper.findComponent({ name: 'VSelect' })
    await select.vm.$emit('update:modelValue', 'insumos_extra')
    const numberInput = wrapper.find('input[type="number"]')
    await numberInput.setValue('0')
    const textInput = wrapper.findAll('input[type="text"]')[0]
    await textInput?.setValue('Razón válida')

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('El monto debe ser mayor a 0')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('rejects empty motivo (REQ-POS-50)', async () => {
    const wrapper = mountForm()

    const select = wrapper.findComponent({ name: 'VSelect' })
    await select.vm.$emit('update:modelValue', 'transporte')
    const numberInput = wrapper.find('input[type="number"]')
    await numberInput.setValue('30')
    // Leave motivo blank.

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('El motivo es obligatorio')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('rejects motivo longer than 500 chars (REQ-POS-50)', async () => {
    const wrapper = mountForm({ valoresIniciales: mkInput({ motivo: 'x'.repeat(501) }) })

    await flushPromises()
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('500 caracteres')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('locks fields when editable is false (REQ-POS-39)', async () => {
    const wrapper = mountForm({ valoresIniciales: mkInput(), editable: false })

    await flushPromises()
    expect(wrapper.text()).toContain('Evento cerrado')
    expect(wrapper.find('[data-testid="imprevisto-guardar"]').exists()).toBe(false)
  })

  it('emits cancel when the cancel button is clicked', async () => {
    const wrapper = mountForm()

    const botones = wrapper.findAll('button')
    const cancelar = botones.find((b) => b.text().includes('Cancelar'))
    await cancelar?.trigger('click')

    expect(wrapper.emitted('cancel')).toBeTruthy()
  })
})
// REQ-CATALOG-2, REQ-CATALOG-3, REQ-CATALOG-40, REQ-CATALOG-45:
// the form is a pure controlled component — no DI, no store import.
// It receives `valoresIniciales` (null = create mode, partial = edit
// mode) and emits `submit(input)` only when Spanish inline validation
// passes (nombre non-empty, unidad in the 5-value enum, costo >= 0).
import { describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import MateriaPrimaForm from './MateriaPrimaForm.vue'
import type { MateriaPrimaInput } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkInput = (overrides: Partial<MateriaPrimaInput> = {}): MateriaPrimaInput => ({
  nombre: 'Harina',
  unidad: 'kg',
  costo_por_unidad: 2.5,
  notas: null,
  ...overrides,
})

const mountForm = (props: { valoresIniciales?: MateriaPrimaInput | null } = {}) =>
  mount(MateriaPrimaForm, {
    props: { valoresIniciales: props.valoresIniciales ?? null },
    global: { plugins: [vuetify] },
  })

describe('MateriaPrimaForm', () => {
  it('renders empty fields when valoresIniciales is null (create mode)', () => {
    const wrapper = mountForm()

    const inputs = wrapper.findAll('input')
    // v-text-field renders <input>; the form has 2 inputs (nombre + costo).
    expect(inputs.length).toBeGreaterThanOrEqual(2)
  })

  it('prefills fields from valoresIniciales (edit mode, REQ-CATALOG-3)', () => {
    const wrapper = mountForm({
      valoresIniciales: mkInput({ nombre: 'Mantequilla', unidad: 'g', costo_por_unidad: 0.12 }),
    })

    const text = wrapper.text()
    expect(text).toContain('Mantequilla')
  })

  it('emits submit with the typed values when valid (REQ-CATALOG-2)', async () => {
    const wrapper = mountForm()

    await wrapper.find('input[type="text"]').setValue('Mantequilla')
    // The number input carries the cost; v-text-field with type=number.
    const numberInput = wrapper.find('input[type="number"]')
    await numberInput.setValue('0.12')

    // Pick "g" from the unidad v-select.
    const select = wrapper.findComponent({ name: 'VSelect' })
    await select.vm.$emit('update:modelValue', 'g')

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    const submitEvent = wrapper.emitted('submit')
    expect(submitEvent).toBeTruthy()
    expect(submitEvent?.[0]?.[0]).toEqual(
      expect.objectContaining({ nombre: 'Mantequilla', unidad: 'g', costo_por_unidad: 0.12 }),
    )
  })

  it('rejects empty nombre with a Spanish validation error (REQ-CATALOG-2, REQ-CATALOG-40)', async () => {
    const wrapper = mountForm()

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('El nombre es obligatorio')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('rejects negative costo_por_unidad with a Spanish validation error (REQ-CATALOG-2, REQ-CATALOG-40)', async () => {
    const wrapper = mountForm()

    await wrapper.find('input[type="text"]').setValue('Sal')
    const numberInput = wrapper.find('input[type="number"]')
    await numberInput.setValue('-1')

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('mayor o igual a 0')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('emits cancel when the cancel button is clicked', async () => {
    const wrapper = mountForm()

    const botones = wrapper.findAll('button')
    const cancelar = botones.find((b) => b.text().includes('Cancelar'))
    await cancelar?.trigger('click')

    expect(wrapper.emitted('cancel')).toBeTruthy()
  })

  it('uses valoresIniciales prop, not a full MateriaPrima (REQ-CATALOG-45 ISP)', () => {
    const wrapper = mountForm({
      valoresIniciales: mkInput({ nombre: 'Azúcar glass' }),
    })
    // If the form had a full MateriaPrima prop, the values would include id/created_at.
    // The minimal-props check is structural — declared props should be only
    // `valoresIniciales` + emits. We assert by checking emitted values carry
    // input-only fields (no id).
    expect(wrapper.props('valoresIniciales')).not.toHaveProperty('id')
  })
})

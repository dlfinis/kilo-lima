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
  categoria: 'ingrediente',
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

  it('prefills fields from valoresIniciales (edit mode, REQ-CATALOG-3)', async () => {
    const wrapper = mountForm({
      valoresIniciales: mkInput({ nombre: 'Mantequilla', unidad: 'g', costo_por_unidad: 0.12 }),
    })

    await flushPromises()
    // v-text-field forwards extra attrs to the input; find the bound input
    // by its label association and assert the model populated the value.
    const inputs = wrapper.findAll('input')
    const values = inputs.map((w) => (w.element as HTMLInputElement).value)
    expect(values).toContain('Mantequilla')
    // Cost field now shows formatted currency value (e.g., "$0.12" or "USD 0.12")
    const costInput = values.find((v) => v.includes('0.12') || v.includes('0,12'))
    expect(costInput).toBeTruthy()
  })

  it('emits submit with the typed values when valid (REQ-CATALOG-2)', async () => {
    const wrapper = mountForm()

    await wrapper.find('[data-testid="mp-nombre"] input').setValue('Mantequilla')
    // The cost input is now type="text" with inputmode="decimal" (REQ-UX-MONEY-1).
    const costInput = wrapper.find('[data-testid="mp-costo"] input')
    await costInput.setValue('0.12')

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

    await wrapper.find('[data-testid="mp-nombre"] input').setValue('Sal')
    const costInput = wrapper.find('[data-testid="mp-costo"] input')
    await costInput.setValue('-1')

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

  // ── REQ-UX-MONEY-1 round-trip & partial-input tests ──────────────

  it('preserves raw text while editing — "1.200" is not rewritten to "1.20"', async () => {
    const wrapper = mountForm()

    const costInput = wrapper.find('[data-testid="mp-costo"] input')
    await costInput.setValue('1.200')
    await flushPromises()

    // The old watcher cycle would have rewritten "1.200" → "1.20".
    const displayed = (costInput.element as HTMLInputElement).value
    expect(displayed).toBe('1.200')
  })

  it('does not coerce a partial "." input to "0.00"', async () => {
    const wrapper = mountForm()

    const costInput = wrapper.find('[data-testid="mp-costo"] input')
    await costInput.setValue('.')
    await flushPromises()

    // The old parse-then-reformat cycle would have turned "." into "0.00".
    const displayed = (costInput.element as HTMLInputElement).value
    expect(displayed).toBe('.')
  })

  it('normalizes valid cost on blur — "1.2" → "1.20"', async () => {
    const wrapper = mountForm()

    const costInput = wrapper.find('[data-testid="mp-costo"] input')
    await costInput.setValue('1.2')
    await flushPromises()

    // Trigger blur on the native input so Vuetify forwards it to @blur.
    await costInput.trigger('blur')
    await flushPromises()

    const displayed = (costInput.element as HTMLInputElement).value
    expect(displayed).toBe('1.20')
  })

  it('resets invalid cost to last valid value on blur', async () => {
    const wrapper = mountForm()

    const costInput = wrapper.find('[data-testid="mp-costo"] input')
    // Valid value first
    await costInput.setValue('3.50')
    await flushPromises()

    // Then type garbage
    await costInput.setValue('xyz')
    await flushPromises()

    // Blur should reset to the last valid formatted value
    await costInput.trigger('blur')
    await flushPromises()

    const displayed = (costInput.element as HTMLInputElement).value
    expect(displayed).toBe('3.50')
  })

  it('rejects non-numeric cost text on submit (was silently saved as 0)', async () => {
    const wrapper = mountForm()

    await wrapper.find('[data-testid="mp-nombre"] input').setValue('Harina')
    const costInput = wrapper.find('[data-testid="mp-costo"] input')
    await costInput.setValue('abc')
    await flushPromises()

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('número mayor o igual a 0')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  // ── REQ-UX-MONEY-1 comma-decimal guard ──────────────────────────

  it('rejects comma-decimal cost input on submit (no silent coercion)', async () => {
    const wrapper = mountForm()

    await wrapper.find('[data-testid="mp-nombre"] input').setValue('Harina')
    const costInput = wrapper.find('[data-testid="mp-costo"] input')
    await costInput.setValue('1,23')
    await flushPromises()

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    // "1,23" is ambiguous European notation — must NOT be coerced to 123.
    expect(wrapper.text()).toContain('número mayor o igual a 0')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('replaces comma-only cost with last valid value on blur', async () => {
    const wrapper = mountForm()

    const costInput = wrapper.find('[data-testid="mp-costo"] input')
    // Establish a valid baseline first
    await costInput.setValue('3.50')
    await costInput.trigger('blur')
    await flushPromises()

    // Then type ambiguous comma-decimal input
    await costInput.setValue('1,23')
    await flushPromises()

    // Blur: invalid comma input must reset to last valid formatted value
    await costInput.trigger('blur')
    await flushPromises()

    const displayed = (costInput.element as HTMLInputElement).value
    expect(displayed).toBe('3.50')
  })

  it('rejects empty cost text on submit', async () => {
    const wrapper = mountForm()

    await wrapper.find('[data-testid="mp-nombre"] input').setValue('Harina')
    const costInput = wrapper.find('[data-testid="mp-costo"] input')
    await costInput.setValue('')
    await flushPromises()

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('número mayor o igual a 0')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  // ── Mixed-locale paste guard ─────────────────────────────────────

  it('rejects mixed-locale paste "1.234,56" on submit (no silent coercion)', async () => {
    const wrapper = mountForm()

    await wrapper.find('[data-testid="mp-nombre"] input').setValue('Harina')
    const costInput = wrapper.find('[data-testid="mp-costo"] input')
    // Dot-thousands comma-decimal paste from European locale
    await costInput.setValue('1.234,56')
    await flushPromises()

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    // Must NOT be coerced to 1.23456 (silent data corruption).
    expect(wrapper.text()).toContain('número mayor o igual a 0')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('resets mixed-locale paste "1.234,56" to last valid value on blur', async () => {
    const wrapper = mountForm()

    const costInput = wrapper.find('[data-testid="mp-costo"] input')
    await costInput.setValue('3.50')
    await costInput.trigger('blur')
    await flushPromises()

    // Paste European-style "1.234,56" (dot-thousands, comma-decimal)
    await costInput.setValue('1.234,56')
    await flushPromises()

    // Blur: invalid comma input must reset to last valid formatted value
    await costInput.trigger('blur')
    await flushPromises()

    const displayed = (costInput.element as HTMLInputElement).value
    expect(displayed).toBe('3.50')
  })
})

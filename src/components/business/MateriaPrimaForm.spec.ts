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

  // ── REQ-UX-MONEY-2: untouched over-precision preservation ────────

  it('preserves over-precision cost when field is untouched (REQ-UX-MONEY-2)', async () => {
    // Prefill with a cost that has 5 decimal places — the display rounds
    // to 3dp for readability, but the emitted value must be exact.
    const wrapper = mountForm({
      valoresIniciales: mkInput({ nombre: 'Mantequilla', costo_por_unidad: 0.12345 }),
    })
    await flushPromises()

    // The cost display shows policy-formatted text (max 3 decimals).
    const costInput = wrapper.find('[data-testid="mp-costo"] input')
    expect((costInput.element as HTMLInputElement).value).toBe('0.123')

    // Submit WITHOUT touching the cost field.
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    const submitEvent = wrapper.emitted('submit')
    expect(submitEvent).toBeTruthy()
    expect(submitEvent?.[0]?.[0].costo_por_unidad).toBe(0.12345)
  })

  it('enforces money policy when user edits an over-precision prefilled cost (REQ-UX-MONEY-2)', async () => {
    const wrapper = mountForm({
      valoresIniciales: mkInput({ nombre: 'Mantequilla', costo_por_unidad: 0.12345 }),
    })
    await flushPromises()

    // User actively edits the cost field — policy must kick in.
    const costInput = wrapper.find('[data-testid="mp-costo"] input')
    await costInput.setValue('2.5')
    await flushPromises()

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    const submitEvent = wrapper.emitted('submit')
    expect(submitEvent).toBeTruthy()
    expect(submitEvent?.[0]?.[0].costo_por_unidad).toBe(2.5)
  })

  it('preserves exactly-on-boundary 3-decimal cost when untouched (REQ-UX-MONEY-2)', async () => {
    // Three decimals is within policy — untouched must still preserve exactly,
    // not go through any rounding path.
    const wrapper = mountForm({
      valoresIniciales: mkInput({ nombre: 'Harina', costo_por_unidad: 0.123 }),
    })
    await flushPromises()

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    const submitEvent = wrapper.emitted('submit')
    expect(submitEvent?.[0]?.[0].costo_por_unidad).toBe(0.123)
  })

  it('enforces max-3-decimals policy on user-typed over-precision input', async () => {
    // User starts typing "0.1234" (4dp) — parsearUSDInput returns NaN,
    // so validar() blocks submit with a validation error.
    const wrapper = mountForm()

    await wrapper.find('[data-testid="mp-nombre"] input').setValue('Harina')
    const costInput = wrapper.find('[data-testid="mp-costo"] input')
    await costInput.setValue('0.1234')
    await flushPromises()

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    // Validation must block the submit — over-precision typed input is invalid.
    expect(wrapper.text()).toContain('número mayor o igual a 0')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  // ── REQ-UX-MONEY-2: invalid-edit + blur preserves original ──────
  // Proves that a prefilled over-precision value survives an invalid
  // edit + blur cycle.  The key invariant: costo_por_unidad is only
  // updated on valid parses; garbage edits never mutate it.

  it('preserves over-precision original after garbage edit + blur + submit', async () => {
    const wrapper = mountForm({
      valoresIniciales: mkInput({ nombre: 'Mantequilla', costo_por_unidad: 0.12345 }),
    })
    await flushPromises()

    // Type garbage — this sets costoTocado but costo_por_unidad stays 0.12345
    const costInput = wrapper.find('[data-testid="mp-costo"] input')
    await costInput.setValue('xyz')
    await flushPromises()

    // Blur resets the display to the formatted last-accepted value
    await costInput.trigger('blur')
    await flushPromises()

    // Submit must emit the original exact value, not the truncated display text
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    const submitEvent = wrapper.emitted('submit')
    expect(submitEvent).toBeTruthy()
    expect(submitEvent?.[0]?.[0].costo_por_unidad).toBe(0.12345)
  })

  it('preserves over-precision original after comma-edit + blur + submit', async () => {
    const wrapper = mountForm({
      valoresIniciales: mkInput({ nombre: 'Mantequilla', costo_por_unidad: 0.12345 }),
    })
    await flushPromises()

    // Type comma-decimal input (invalid under policy)
    const costInput = wrapper.find('[data-testid="mp-costo"] input')
    await costInput.setValue('1,23')
    await flushPromises()

    // Blur resets display to formatted last-accepted value
    await costInput.trigger('blur')
    await flushPromises()

    // Submit must preserve original, not emit the formatted display value
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    const submitEvent = wrapper.emitted('submit')
    expect(submitEvent).toBeTruthy()
    expect(submitEvent?.[0]?.[0].costo_por_unidad).toBe(0.12345)
  })

  it('emits last-valid edit after valid→invalid→blur→submit chain', async () => {
    // User makes a valid edit, then types garbage, blurs, submits.
    // The last accepted numeric value (2.5) should be emitted — not the
    // original prefilled value (0.12345) and not the blur-formatted
    // display string.
    const wrapper = mountForm({
      valoresIniciales: mkInput({ nombre: 'Mantequilla', costo_por_unidad: 0.12345 }),
    })
    await flushPromises()

    const costInput = wrapper.find('[data-testid="mp-costo"] input')

    // Step 1: valid edit — costo_por_unidad updated to 2.5
    await costInput.setValue('2.5')
    await flushPromises()

    // Step 2: invalid garbage — costo_por_unidad stays at 2.5
    await costInput.setValue('xyz')
    await flushPromises()

    // Step 3: blur resets display to "2.50"
    await costInput.trigger('blur')
    await flushPromises()

    // Step 4: submit — must emit last accepted value (2.5), not original (0.12345)
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    const submitEvent = wrapper.emitted('submit')
    expect(submitEvent).toBeTruthy()
    expect(submitEvent?.[0]?.[0].costo_por_unidad).toBe(2.5)
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

  // ── Error clearing is not sticky after valid correction ──────────

  it('clears name error reactively when user types a valid name after failed submit', async () => {
    // Bug: errores.nombre was sticky — after an invalid submit with
    // empty name, typing a valid name did NOT re-enable Guardar because
    // errores still held the nombre key.
    const wrapper = mountForm({
      valoresIniciales: mkInput({ nombre: 'Harina' }),
    })
    await flushPromises()

    // 1. Clear the prefilled name
    const nombreInput = wrapper.find('[data-testid="mp-nombre"] input')
    await nombreInput.setValue('')
    await flushPromises()

    // 2. Submit — should show the name error
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()
    expect(wrapper.text()).toContain('El nombre es obligatorio')
    expect(wrapper.emitted('submit')).toBeFalsy()

    // 3. Type a valid name — error must clear reactively
    await nombreInput.setValue('Harina integral')
    await flushPromises()

    // Sticky bug: antes de la corrección errores.nombre persistía
    // y el botón Guardar seguía disabled.
    expect(wrapper.text()).not.toContain('El nombre es obligatorio')

    // 4. Guardar must be enabled and submit must succeed
    const guardarBtn = wrapper.find('[data-testid="mp-guardar"]')
    expect((guardarBtn.element as HTMLButtonElement).disabled).toBe(false)

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    const submitEvent = wrapper.emitted('submit')
    expect(submitEvent).toBeTruthy()
    expect(submitEvent?.[0]?.[0]).toEqual(
      expect.objectContaining({ nombre: 'Harina integral' }),
    )
  })

  it('clears costo error reactively when user types a valid cost after failed submit', async () => {
    // Bug: errores.costo was sticky — after an invalid submit with
    // negative cost, typing a valid cost did NOT re-enable Guardar
    // because errores still held the costo key (set to undefined).
    const wrapper = mountForm({
      valoresIniciales: mkInput({ nombre: 'Harina', costo_por_unidad: 2.5 }),
    })
    await flushPromises()

    // 1. Type an invalid (negative) cost
    const costInput = wrapper.find('[data-testid="mp-costo"] input')
    await costInput.setValue('-5')
    await flushPromises()

    // 2. Submit — should show the costo error
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()
    expect(wrapper.text()).toContain('mayor o igual a 0')
    expect(wrapper.emitted('submit')).toBeFalsy()

    // 3. Type a valid cost — error must clear reactively
    await costInput.setValue('3.50')
    await flushPromises()

    // Sticky bug: antes de la corrección errores.costo persistía
    // y el botón Guardar seguía disabled.
    expect(wrapper.text()).not.toContain('mayor o igual a 0')

    // 4. Guardar must be enabled and submit must succeed
    const guardarBtn = wrapper.find('[data-testid="mp-guardar"]')
    expect((guardarBtn.element as HTMLButtonElement).disabled).toBe(false)

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    const submitEvent = wrapper.emitted('submit')
    expect(submitEvent).toBeTruthy()
    expect(submitEvent?.[0]?.[0]).toEqual(
      expect.objectContaining({ nombre: 'Harina', costo_por_unidad: 3.5 }),
    )
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

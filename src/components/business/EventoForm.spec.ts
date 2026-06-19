// REQ-EVENTS-2, REQ-EVENTS-3, REQ-EVENTS-26, REQ-EVENTS-36,
// REQ-EVENTS-43: pure form component (no DI, no store import). Spanish
// inline validation runs before `submit` fires. Reads-only when
// `editable === false` (set by the parent view after checking
// `estadoEsEditable`). The parent owns the freeze gate; the form is
// a passive lockup so the same component works for both create and
// edit flows.
import { describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import EventoForm from './EventoForm.vue'
import type { EventoInput } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkInput = (overrides: Partial<EventoInput> = {}): EventoInput => ({
  nombre: 'Feria del Sol',
  fecha: '2026-07-15',
  fecha_fin: null,
  margen_ganancia: 0.4,
  ubicacion: 'Plaza Central',
  estado: 'planificacion',
  notas: null,
  ...overrides,
})

const mountForm = (props: { valoresIniciales?: EventoInput | null; editable?: boolean } = {}) =>
  mount(EventoForm, {
    props: {
      valoresIniciales: props.valoresIniciales ?? null,
      editable: props.editable ?? true,
    },
    global: { plugins: [vuetify] },
  })

describe('EventoForm', () => {
  it('emits submit with the typed values when valid (REQ-EVENTS-2)', async () => {
    const wrapper = mountForm()

    await wrapper.find('input[type="text"]').setValue('Feria del Sol')
    // Date input
    const dateInput = wrapper.find('input[type="date"]')
    await dateInput.setValue('2026-07-15')
    // Textarea for notas (optional)
    const textarea = wrapper.find('textarea')
    if (textarea.exists()) await textarea.setValue('Traer cambio')

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    const submitEvent = wrapper.emitted('submit')
    expect(submitEvent).toBeTruthy()
    expect(submitEvent?.[0]?.[0]).toEqual(
      expect.objectContaining({ nombre: 'Feria del Sol', fecha: '2026-07-15', estado: 'planificacion' }),
    )
  })

  it('rejects empty nombre with "El nombre es obligatorio" (REQ-EVENTS-2)', async () => {
    const wrapper = mountForm()

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('El nombre es obligatorio')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('rejects invalid date with "La fecha no es válida" (REQ-EVENTS-2)', async () => {
    const wrapper = mountForm()

    await wrapper.find('input[type="text"]').setValue('Feria')
    // Empty date → invalid
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('La fecha no es válida')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('locks all fields and hides submit when editable is false (REQ-EVENTS-3, REQ-EVENTS-26)', async () => {
    const wrapper = mountForm({
      valoresIniciales: mkInput({ estado: 'cerrado' }),
      editable: false,
    })

    await flushPromises()
    expect(wrapper.text()).toContain('Evento cerrado')
    // The submit button is hidden
    expect(wrapper.find('[data-testid="evento-guardar"]').exists()).toBe(false)
  })

  it('emits cancel when the cancel button is clicked', async () => {
    const wrapper = mountForm()

    const botones = wrapper.findAll('button')
    const cancelar = botones.find((b) => b.text().includes('Cancelar'))
    await cancelar?.trigger('click')

    expect(wrapper.emitted('cancel')).toBeTruthy()
  })
})

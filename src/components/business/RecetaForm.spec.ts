// REQ-CATALOG-10, REQ-CATALOG-11, REQ-CATALOG-40, REQ-CATALOG-45:
// the recipe form is a controlled component with N dynamic ingredient
// rows. Each row pairs a `SelectorMateriaPrima` autocomplete with a
// `cantidad` number input. The form validates in Spanish before
// emitting `submit({ ...RecetaInput, ingredientes: IngredienteRecetaInput[] })`.
import { describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import RecetaForm from './RecetaForm.vue'
import SelectorMateriaPrima from './SelectorMateriaPrima.vue'
import type { MateriaPrima, RecetaInputCompleto } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkMateria = (id: string, nombre: string, unidad: MateriaPrima['unidad']): MateriaPrima => ({
  id,
  nombre,
  unidad,
  costo_por_unidad: 1,
  notas: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

const mkProps = (overrides: { valoresIniciales?: RecetaInputCompleto | null; materiasPrimas?: MateriaPrima[] } = {}) => ({
  valoresIniciales: overrides.valoresIniciales ?? null,
  materiasPrimas: overrides.materiasPrimas ?? [mkMateria('mp-1', 'Harina', 'kg'), mkMateria('mp-2', 'Azúcar', 'g')],
})

const mountForm = (props: ReturnType<typeof mkProps>) =>
  mount(RecetaForm, {
    props,
    global: { plugins: [vuetify] },
  })

describe('RecetaForm', () => {
  it('starts with one empty ingredient row in create mode', () => {
    const wrapper = mountForm(mkProps())

    const filas = wrapper.findAll('[data-testid="receta-linea"]')
    expect(filas.length).toBe(1)
  })

  it('adds a new empty row when the user clicks Agregar ingrediente', async () => {
    const wrapper = mountForm(mkProps())

    const botonAgregar = wrapper.findAll('button').find((b) => b.text().includes('Agregar ingrediente'))
    await botonAgregar?.trigger('click')
    await flushPromises()

    const filas = wrapper.findAll('[data-testid="receta-linea"]')
    expect(filas.length).toBe(2)
  })

  it('removes a row when the user clicks the remove button on that row', async () => {
    const wrapper = mountForm(mkProps())

    const botonAgregar = wrapper.findAll('button').find((b) => b.text().includes('Agregar ingrediente'))
    await botonAgregar?.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="receta-linea"]').length).toBe(2)

    const botonesQuitar = wrapper.findAll('[data-testid="receta-quitar"]')
    await botonesQuitar[0]?.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="receta-linea"]').length).toBe(1)
  })

  it('rejects empty nombre with a Spanish validation error (REQ-CATALOG-10)', async () => {
    const wrapper = mountForm(mkProps())

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('El nombre de la receta es obligatorio')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('keeps at least one ingredient row — the remove button is hidden when only one row remains (REQ-CATALOG-10)', async () => {
    const wrapper = mountForm(mkProps())
    expect(wrapper.findAll('[data-testid="receta-linea"]').length).toBe(1)
    expect(wrapper.find('[data-testid="receta-quitar"]').exists()).toBe(false)
  })

  it('rejects zero or negative cantidad with a Spanish validation error (REQ-CATALOG-10)', async () => {
    const wrapper = mountForm(mkProps())

    await wrapper.find('[data-testid="receta-nombre"] input').setValue('Galleta')
    await flushPromises()
    await wrapper.find('[data-testid="receta-cantidad"] input').setValue('0')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('La cantidad debe ser mayor a 0')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('emits submit with the typed values when valid (REQ-CATALOG-10)', async () => {
    const wrapper = mountForm(mkProps())

    // Drive the form through the public event surface (the same path
    // a real user takes): set the autocomplete, set the number, type
    // the name, then submit. flushPromises after each input so the
    // computed `formularioValido` settles before submit fires.
    const selector = wrapper.findComponent(SelectorMateriaPrima)
    await selector.vm.$emit('update:modelValue', 'mp-1')
    await flushPromises()
    await wrapper.find('[data-testid="receta-cantidad"] input').setValue('0.5')
    await flushPromises()
    await wrapper.find('[data-testid="receta-nombre"] input').setValue('Galleta')
    await flushPromises()
    // The submit button is `:disabled` while invalid; reach the form's
    // submit handler directly so the disabled button is bypassed.
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const submitEvent = wrapper.emitted('submit')
    expect(submitEvent).toBeTruthy()
    expect(submitEvent?.[0]?.[0]).toEqual(
      expect.objectContaining({
        nombre: 'Galleta',
        ingredientes: [expect.objectContaining({ materia_prima_id: 'mp-1', cantidad: 0.5 })],
      }),
    )
  })

  it('rejects zero or negative cantidad with a Spanish validation error (REQ-CATALOG-10)', async () => {
    const wrapper = mountForm(mkProps())

    await wrapper.find('[data-testid="receta-nombre"] input').setValue('Galleta')
    await flushPromises()
    await wrapper.find('[data-testid="receta-cantidad"] input').setValue('0')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('La cantidad debe ser mayor a 0')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('emits cancel when the cancel button is clicked', async () => {
    const wrapper = mountForm(mkProps())

    const cancelar = wrapper.findAll('button').find((b) => b.text().includes('Cancelar'))
    await cancelar?.trigger('click')

    expect(wrapper.emitted('cancel')).toBeTruthy()
  })

  it('uses valoresIniciales to prefill the form in edit mode (REQ-CATALOG-11)', async () => {
    const wrapper = mountForm(
      mkProps({
        valoresIniciales: {
          nombre: 'Pan básico',
          descripcion: null,
          rendimiento_unidades: 2,
          notas: null,
          ingredientes: [{ materia_prima_id: 'mp-1', cantidad: 1 }],
        },
      }),
    )
    await flushPromises()

    const inputs = wrapper.findAll('input')
    const values = inputs.map((w) => (w.element as HTMLInputElement).value)
    expect(values).toContain('Pan básico')
  })
})

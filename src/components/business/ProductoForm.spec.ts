// REQ-POS-46, REQ-POS-50, REQ-POS-54: producto form is a controlled
// component that emits a typed `submit` payload. In create mode the
// parent passes a `recetaId` so the producto is locked to that receta;
// the `recetas` list is consulted in edit mode (no recetaId) so the
// user can re-target if needed (kept optional, the catalog slice
// never edits the FK in practice).
//
// Validations (REQ-POS-50):
//   - precio_venta > 0
//   - receta_id selected
//   - orden integer ≥ 0
// Submit button is disabled until the form is valid (REQ-POS-50).
import { describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import ProductoForm from './ProductoForm.vue'
import type { Producto } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkProducto = (overrides: Partial<Producto> = {}): Producto => ({
  id: 'p-1',
  receta_id: 'r-1',
  // catalog-domain-refactor / Slice 1
  nombre: 'Producto de prueba',
  categoria: 'dulce',
  precio_venta: null,
  disponible: true,
  orden: 0,
  descripcion: null,
  icono: null,
  color: null,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
  ...overrides,
})

const mountForm = (props: {
  valoresIniciales?: Producto | null
  recetas?: { id: string; nombre: string }[]
  recetaIdInicial?: string
}) =>
  mount(ProductoForm, {
    props: {
      valoresIniciales: props.valoresIniciales ?? null,
      recetas: props.recetas ?? [{ id: 'r-1', nombre: 'Pan básico' }],
      recetaIdInicial: props.recetaIdInicial ?? '',
    },
    global: { plugins: [vuetify] },
  })

describe('ProductoForm', () => {
  it('disables the submit button until nombre and receta are set (REQ-POS-50)', async () => {
    const wrapper = mountForm({})

    const guardar = wrapper.find('[data-testid="producto-guardar"]')
    expect((guardar.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('rejects missing receta_id with a Spanish validation error (REQ-POS-50)', async () => {
    const wrapper = mountForm({})
    await wrapper.find('[data-testid="producto-nombre"] input').setValue('Test')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('Selecciona una receta')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  // catalog-domain-refactor: empty nombre is rejected client-side before
  // the submit payload is emitted. Mirrors the UNIQUE constraint at DB level.
  it('rejects empty nombre with a Spanish validation error', async () => {
    const wrapper = mountForm({ recetaIdInicial: 'r-1' })
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('El nombre comercial es requerido')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('emits submit with the typed values when valid (REQ-POS-1)', async () => {
    const wrapper = mountForm({ recetaIdInicial: 'r-1' })
    // catalog-domain-refactor: nombre is now required and validated client-side.
    await wrapper.find('[data-testid="producto-nombre"] input').setValue('Brownie Feria')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    const submit = wrapper.emitted('submit')
    expect(submit).toBeTruthy()
    expect(submit?.[0]?.[0]).toEqual(
      expect.objectContaining({
        receta_id: 'r-1',
        nombre: 'Brownie Feria',
        disponible: true,
        orden: 0,
      }),
    )
  })

  it('persists the selected visual palette and food icon values', async () => {
    const wrapper = mountForm({ recetaIdInicial: 'r-1' })
    await wrapper.find('[data-testid="producto-nombre"] input').setValue('Limonada Feria')
    await wrapper.find('[data-testid="selector-color-orange"]').trigger('click')
    await wrapper.find('[data-testid="selector-icono-mdi-juice"]').trigger('click')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual(
      expect.objectContaining({ color: 'orange', icono: 'mdi-juice' }),
    )
  })

  // catalog-domain-refactor / Slice 2: when creating a new product,
  // selecting a receta prefills the commercial name from the receta
  // name. The operator can then edit it before saving.
  it('prefills nombre from selected receta name when nombre is empty', async () => {
    const wrapper = mountForm({
      recetas: [{ id: 'r-1', nombre: 'Brownie Clásico' }],
    })
    await flushPromises()

    // Select the receta
    // v-select in Vuetify 3: interact via the internal model
    await wrapper.setData({ recetaId: 'r-1' })
    await wrapper.vm.$nextTick()
    await flushPromises()

    // Nombre should be prefilled from the receta
    const nombreInput = wrapper.find('[data-testid="producto-nombre"] input')
    expect((nombreInput.element as HTMLInputElement).value).toBe('Brownie Clásico')

    // Operator can override
    await nombreInput.setValue('Brownie Feria')
    expect((nombreInput.element as HTMLInputElement).value).toBe('Brownie Feria')
  })

  it('prefills the form when valoresIniciales is provided (REQ-POS-1)', async () => {
    const wrapper = mountForm({
      valoresIniciales: mkProducto({ disponible: false, orden: 2 }),
      recetas: [
        { id: 'r-1', nombre: 'Pan básico' },
        { id: 'r-2', nombre: 'Galleta' },
      ],
    })
    await flushPromises()

    expect((wrapper.find('[data-testid="producto-nombre"] input').element as HTMLInputElement).value).toBe('Producto de prueba')
  })

  it('emits cancel when the cancel button is clicked', async () => {
    const wrapper = mountForm({ recetaIdInicial: 'r-1' })

    const cancelar = wrapper.findAll('button').find((b) => b.text().includes('Cancelar'))
    await cancelar?.trigger('click')

    expect(wrapper.emitted('cancel')).toBeTruthy()
  })

  // productos-mejoras / producto-descripcion: descripcion flows into
  // the submit payload so the DB row persists the free-text field.
  it('emits descripcion in the submit payload when filled', async () => {
    const wrapper = mountForm({ recetaIdInicial: 'r-1' })
    // catalog-domain-refactor: nombre is required before the form validates.
    await wrapper.find('[data-testid="producto-nombre"] input').setValue('Test Product')
    await wrapper.find('[data-testid="producto-descripcion"] textarea').setValue('Pan de masa madre artesanal')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    const submit = wrapper.emitted('submit')
    expect(submit?.[0]?.[0]).toEqual(
      expect.objectContaining({
        receta_id: 'r-1',
        descripcion: 'Pan de masa madre artesanal',
      }),
    )
  })

  // Empty descripcion is coerced to null so the DB row matches the
  // nullable contract instead of storing an empty string.
  it('emits descripcion=null when the textarea is left empty', async () => {
    const wrapper = mountForm({ recetaIdInicial: 'r-1' })
    // catalog-domain-refactor: nombre is required.
    await wrapper.find('[data-testid="producto-nombre"] input').setValue('Test Product')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    const submit = wrapper.emitted('submit')
    expect(submit?.[0]?.[0]).toEqual(
      expect.objectContaining({ receta_id: 'r-1', descripcion: null }),
    )
  })

  // productos-mejoras / producto-descripcion: 500-char cap matches
  // the DB CHECK constraint; the form blocks the save.
  it('blocks the submit when descripcion exceeds 500 chars', async () => {
    const wrapper = mountForm({ recetaIdInicial: 'r-1' })
    const longText = 'a'.repeat(501)
    await wrapper
      .find('[data-testid="producto-descripcion"] textarea')
      .setValue(longText)
    await wrapper.find('[data-testid="producto-nombre"] input').setValue('Test Product')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('Maximo 500 caracteres')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('prefills descripcion from valoresIniciales (REQ-POS-1)', async () => {
    const wrapper = mountForm({
      valoresIniciales: mkProducto({
        descripcion: 'Brownie húmedo de chocolate',
      }),
      recetas: [{ id: 'r-1', nombre: 'Brownie' }],
    })
    await flushPromises()

    expect(
      (wrapper.find('[data-testid="producto-descripcion"] textarea').element as HTMLTextAreaElement)
        .value,
    ).toBe('Brownie húmedo de chocolate')
  })
})

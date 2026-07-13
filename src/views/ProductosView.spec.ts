// REQ-POS-1, REQ-POS-3, REQ-POS-4, REQ-POS-46, REQ-POS-49, REQ-POS-50:
// productos management view. Four UX states (loading/empty/error/data),
// filter by `disponible` (REQ-POS-46), create/edit/delete/toggle
// dialogs, and the global empty state with a link to /recetas (when
// no products exist at all — the user is expected to create them
// from the recipe detail page per REQ-POS-47).
import { beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import { __pushSupabaseResponse, __resetSupabaseMock } from '../../tests/setup'

import ProductosView from './ProductosView.vue'
import ProductoForm from '@/components/business/ProductoForm.vue'
import type { Database, Producto, RecetaConIngredientes } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkProducto = (id: string, overrides: Partial<Producto> = {}): Producto => ({
  id,
  receta_id: `r-${id}`,
  // catalog-domain-refactor / Slice 3: required fields
  nombre: `Producto ${id}`,
  categoria: null,
  precio_venta: null,
  disponible: true,
  orden: 0,
  descripcion: null,
  icono: 'mdi-food',
  color: null,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
  ...overrides,
})

const mkReceta = (id: string, nombre: string): RecetaConIngredientes => ({
  id,
  nombre,
  descripcion: null,
  rendimiento_unidades: 1,
  notas: null,
  ingredientes: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

let aplicacion: App

beforeEach(() => {
  setActivePinia(createPinia())
  __resetSupabaseMock()
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide('supabase', createClient('http://x', 'anon') as SupabaseClient<Database>)
})

async function mountView() {
  return mount(ProductosView, {
    attachTo: document.body,
    global: {
      plugins: [vuetify],
      provide: { supabase: createClient('http://x', 'anon') as SupabaseClient<Database> },
    },
  })
}

describe('ProductosView', () => {
  it('empty state links to /productos/preparaciones (catalog-domain-refactor / Slice 3)', async () => {
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })

    const wrapper = await mountView()
    await flushPromises()

    const irRecetasBtn = wrapper.find('[data-testid="productos-ir-recetas"]')
    expect(irRecetasBtn.exists()).toBe(true)
    expect(irRecetasBtn.attributes('href')).toBe('/productos/preparaciones')
  })

  it('shows the Productos title (REQ-POS-46)', async () => {
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })

    const wrapper = await mountView()
    await flushPromises()

    expect(wrapper.find('h1').text()).toContain('Productos')
  })

  it('shows the empty state when no productos exist (REQ-POS-24, REQ-POS-49)', async () => {
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })

    const wrapper = await mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('No hay productos')
    expect(wrapper.text()).toContain('Creá productos desde el Catálogo')
  })

  it('shows the error state with a Reintentar button when load fails (REQ-POS-49)', async () => {
    __pushSupabaseResponse<Producto[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection refused' },
    })

    const wrapper = await mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="productos-error"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Reintentar')
  })

  it('renders one card per producto when data loads (REQ-POS-46, REQ-POS-49)', async () => {
    __pushSupabaseResponse<Producto[]>({
      data: [mkProducto('p-1'), mkProducto('p-2', { precio_venta: 7.5 })],
      error: null,
    })
    __pushSupabaseResponse<RecetaConIngredientes[]>({
      data: [mkReceta('r-p-1', 'Pan básico'), mkReceta('r-p-2', 'Galleta')],
      error: null,
    })

    const wrapper = await mountView()
    await flushPromises()

    const cards = wrapper.findAll('[data-testid="producto-card-active"], [data-testid="producto-card-disabled"]')
    expect(cards.length).toBe(2)
  })

  it('hides unavailable products when the filter is "Disponibles" (REQ-POS-3, REQ-POS-46)', async () => {
    __pushSupabaseResponse<Producto[]>({
      data: [
        mkProducto('p-1', { disponible: true }),
        mkProducto('p-2', { disponible: false }),
      ],
      error: null,
    })
    __pushSupabaseResponse<RecetaConIngredientes[]>({
      data: [mkReceta('r-p-1', 'Pan básico'), mkReceta('r-p-2', 'Galleta')],
      error: null,
    })

    const wrapper = await mountView()
    await flushPromises()

    // Default is "Todos" — both visible.
    expect(wrapper.findAll('[data-testid="producto-card-active"], [data-testid="producto-card-disabled"]').length).toBe(2)

    // Click "Disponibles" tab/filter
    const filtro = wrapper.findAll('button').find((b) => b.text().includes('Disponibles'))
    await filtro?.trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="producto-card-active"], [data-testid="producto-card-disabled"]').length).toBe(1)
  })

  it('opens the create dialog when "Nuevo producto" is clicked (REQ-POS-46)', async () => {
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({
      data: [mkReceta('r-1', 'Pan básico')],
      error: null,
    })

    const wrapper = await mountView()
    await flushPromises()

    const botonNuevo = wrapper.findAll('button').find((b) => b.text().includes('Nuevo producto'))
    await botonNuevo?.trigger('click')
    await flushPromises()

    // v-dialog teleports content to document.body.
    expect(document.body.textContent).toContain('Nuevo producto')
    expect(document.querySelector('form.producto-form')).not.toBeNull()
  })

  it('shows a friendly Spanish message when creating a duplicate (REQ-POS-2)', async () => {
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({
      data: [mkReceta('r-1', 'Pan básico')],
      error: null,
    })
    // Then the create call returns DUPLICATE_RECETA.
    __pushSupabaseResponse<Producto>({
      data: null,
      error: { code: 'DUPLICATE_RECETA', message: 'Ya existe un producto para esta receta' },
    })

    const wrapper = await mountView()
    await flushPromises()

    const botonNuevo = wrapper.findAll('button').find((b) => b.text().includes('Nuevo producto'))
    await botonNuevo?.trigger('click')
    await flushPromises()

    // catalog-domain-refactor / Slice 3: ProductoInput requires nombre,
    // optional categoria; precio_venta is deprecated.
    const productoForm = wrapper.findComponent(ProductoForm)
    expect(productoForm.exists()).toBe(true)
    await productoForm.vm.$emit('submit', {
      receta_id: 'r-1',
      nombre: 'Producto Duplicado',
      disponible: true,
      orden: 0,
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Ya existe un producto para esta receta')
  })
})
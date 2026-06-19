// REQ-CATALOG-9, REQ-CATALOG-13, REQ-CATALOG-35, REQ-CATALOG-38..41:
// the recipe list view follows the same four-state pattern as
// `MateriasPrimasView` (loading/empty/error/data) plus row-click
// navigation to the detail route. The store is exercised via the real
// Pinia instance plus the supabase chainable mock from tests/setup.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createClient } from '@supabase/supabase-js'
import { createRouter, createMemoryHistory } from 'vue-router'

import { __pushSupabaseResponse, __resetSupabaseMock } from '../../tests/setup'

import RecetasView from './RecetasView.vue'
import RecetaForm from '@/components/business/RecetaForm.vue'
import type { RecetaConIngredientes } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkReceta = (id: string, overrides: Partial<RecetaConIngredientes> = {}): RecetaConIngredientes => ({
  id,
  nombre: 'Pan básico',
  descripcion: null,
  rendimiento_unidades: 2,
  notas: null,
  ingredientes: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

beforeEach(() => {
  setActivePinia(createPinia())
  __resetSupabaseMock()
  document.body.innerHTML = ''
})

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/recetas', name: 'recetas', component: RecetasView },
    { path: '/recetas/:id', name: 'receta-detalle', component: { template: '<div/>' } },
  ],
})

const montarVista = async () => {
  router.push('/recetas')
  await router.isReady()
  return mount({
    components: { RecetasView },
    template: '<v-app><RecetasView /></v-app>',
  }, {
    attachTo: document.body,
    global: {
      plugins: [vuetify, router],
      provide: { supabase: createClient('http://x', 'anon') },
    },
  })
}

describe('RecetasView', () => {
  it('triggers cargarTodas on mount and renders the empty-state CTA when the list is empty (REQ-CATALOG-13)', async () => {
    const wrapper = await montarVista()
    await flushPromises()

    expect(wrapper.text()).toContain('No hay recetas')
    expect(wrapper.text()).toContain('Crear primera receta')
  })

  it('renders the list when data is present (REQ-CATALOG-9)', async () => {
    const wrapper = await montarVista()
    await flushPromises()
    const { useRecipesStore } = await import('@/stores/recipes.store')
    const store = useRecipesStore()
    store.recetas.push(
      mkReceta('r-1', { nombre: 'Pan básico' }),
      mkReceta('r-2', { nombre: 'Galleta de chocolate' }),
    )
    await flushPromises()

    expect(wrapper.text()).toContain('Pan básico')
    expect(wrapper.text()).toContain('Galleta de chocolate')
  })

  it('shows a loading indicator while cargando is true (REQ-CATALOG-38)', async () => {
    const wrapper = await montarVista()
    // Between mount and the awaited load, cargando is true.
    const html = wrapper.html()
    expect(html).toMatch(/v-progress-linear|progress/i)
  })

  it('shows a v-alert error with Reintentar button on fetch failure (REQ-CATALOG-8, REQ-CATALOG-39)', async () => {
    const wrapper = await montarVista()
    await flushPromises()
    const { useRecipesStore } = await import('@/stores/recipes.store')
    const store = useRecipesStore()
    store.error = 'Error al cargar las recetas'
    await flushPromises()

    expect(wrapper.text()).toContain('Error al cargar las recetas')
    expect(wrapper.text()).toContain('Reintentar')
  })

  it('opens the create dialog when the FAB is clicked (REQ-UX-22)', async () => {
    const wrapper = await montarVista()
    await flushPromises()
    const fab = wrapper.find('[data-testid="receta-fab-nuevo"]')
    expect(fab.exists()).toBe(true)
    expect(fab.attributes('aria-label')).toBe('Nueva receta')
    await fab.trigger('click')
    await flushPromises()

    expect(document.body.textContent ?? '').toContain('Nueva receta')
  })

  it('emits create flow: dialog → submit → store.crear is called', async () => {
    const wrapper = await montarVista()
    await flushPromises()
    const { useIngredientsStore } = await import('@/stores/ingredients.store')
    useIngredientsStore().materiasPrimas.push({
      id: 'mp-1',
      nombre: 'Harina',
      unidad: 'kg',
      costo_por_unidad: 2.5,
      notas: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    await wrapper.find('[data-testid="receta-fab-nuevo"]').trigger('click')
    await flushPromises()

    const creada = mkReceta('r-new', { nombre: 'Galleta' })
    __pushSupabaseResponse<RecetaConIngredientes>({ data: creada, error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })

    const form = wrapper.findComponent(RecetaForm)
    await form.vm.$emit('submit', {
      nombre: 'Galleta',
      descripcion: null,
      rendimiento_unidades: 24,
      notas: null,
      ingredientes: [{ materia_prima_id: 'mp-1', cantidad: 0.5 }],
    })
    await flushPromises()

    const { useRecipesStore } = await import('@/stores/recipes.store')
    const store = useRecipesStore()
    expect(store.recetas.some((r) => r.nombre === 'Galleta')).toBe(true)
  })

  it('delete button opens a confirmation dialog with the item name (REQ-CATALOG-41)', async () => {
    const wrapper = await montarVista()
    await flushPromises()
    const { useRecipesStore } = await import('@/stores/recipes.store')
    const store = useRecipesStore()
    store.recetas.push(mkReceta('r-1', { nombre: 'Galleta' }))
    await flushPromises()

    const deleteBtn = wrapper.find('[data-testid="receta-delete-r-1"]')
    expect(deleteBtn.exists()).toBe(true)
    await deleteBtn.trigger('click')
    await flushPromises()

    const texto = document.body.textContent ?? ''
    expect(texto).toContain('¿Eliminar Galleta?')
    expect(texto).toContain('Cancelar')
    expect(texto).toContain('Eliminar')
  })
})

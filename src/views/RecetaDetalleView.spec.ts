// REQ-CATALOG-14, REQ-CATALOG-15, REQ-CATALOG-16, REQ-CATALOG-30:
// the recipe detail view reads the route param `:id`, finds the
// recipe in the store, and renders the cost breakdown via
// `<RecetaCostoDesglose>`. If the id resolves to no recipe (or to a
// recipe whose id is unknown), the view shows a "Preparación no encontrada"
// state — never a blank page.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createClient } from '@supabase/supabase-js'
import { createRouter, createMemoryHistory } from 'vue-router'

import { __resetSupabaseMock } from '../../tests/setup'

import RecetaDetalleView from './RecetaDetalleView.vue'
import RecetaCostoDesglose from '@/components/business/RecetaCostoDesglose.vue'
import type { RecetaConIngredientes } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkReceta = (id: string, ingredientes: RecetaConIngredientes['ingredientes'] = []): RecetaConIngredientes => ({
  id,
  nombre: 'Pan básico',
  descripcion: 'Pan de harina',
  rendimiento_unidades: 2,
  notas: null,
  ingredientes,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

const mkLinea = (id: string, materiaPrimaId: string, cantidad: number): RecetaConIngredientes['ingredientes'][number] => ({
  id,
  receta_id: 'r-1',
  materia_prima_id: materiaPrimaId,
  cantidad,
  created_at: '2026-01-01T00:00:00Z',
})

let router: ReturnType<typeof createRouter>
let aplicacion: App

beforeEach(() => {
  setActivePinia(createPinia())
  __resetSupabaseMock()
  document.body.innerHTML = ''
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/productos/preparaciones', name: 'recetas', component: { template: '<div/>' } },
      { path: '/productos/preparaciones/:id', name: 'receta-detalle', component: RecetaDetalleView },
    ],
  })
  // The stores use `inject('supabase')` at setup. Provide it via a
  // real Vue app + runWithContext so the test can mutate state.
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide('supabase', createClient('http://x', 'anon'))
})

const montarVista = async (id: string) => {
  router.push(`/productos/preparaciones/${id}`)
  await router.isReady()
  return mount(RecetaDetalleView, {
    attachTo: document.body,
    global: {
      plugins: [vuetify, router],
      provide: { supabase: createClient('http://x', 'anon') },
    },
  })
}

describe('RecetaDetalleView', () => {
  it('shows the recipe title and renders the cost breakdown (REQ-CATALOG-14)', async () => {
    const wrapper = await montarVista('r-1')
    const { useRecipesStore } = await import('@/stores/recipes.store')
    const { useIngredientsStore } = await import('@/stores/ingredients.store')
    await aplicacion.runWithContext(async () => {
      useIngredientsStore().materiasPrimas.push({
        id: 'mp-1',
        nombre: 'Harina',
        unidad: 'kg',
        costo_por_unidad: 2.5,
        notas: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      })
      useRecipesStore().recetas.push(mkReceta('r-1', [mkLinea('ri-1', 'mp-1', 1)]))
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Pan básico')
    const desglose = wrapper.findComponent(RecetaCostoDesglose)
    expect(desglose.exists()).toBe(true)
    expect(desglose.props('calculo')).toBeTruthy()
  })

  it('shows "Preparación no encontrada" when the id resolves to no recipe (REQ-CATALOG-30)', async () => {
    const wrapper = await montarVista('nonexistent')
    const { useRecipesStore } = await import('@/stores/recipes.store')
    await aplicacion.runWithContext(() => {
      useRecipesStore().recetas.push({ ...mkReceta('r-other'), nombre: 'Otra receta' })
    })
    await flushPromises()

    expect(wrapper.text()).toMatch(/Preparación no encontrada/)
  })

  it('hides null descriptions gracefully (REQ-CATALOG-14)', async () => {
    const wrapper = await montarVista('r-1')
    const { useRecipesStore } = await import('@/stores/recipes.store')
    await aplicacion.runWithContext(() => {
      useRecipesStore().recetas.push({ ...mkReceta('r-1'), descripcion: null })
    })
    await flushPromises()

    expect(wrapper.text()).not.toContain('null')
  })

  it('shows the MATERIA_PRIMA_FALTANTE warning when an ingredient FK is broken (REQ-CATALOG-16)', async () => {
    const wrapper = await montarVista('r-1')
    const { useRecipesStore } = await import('@/stores/recipes.store')
    await aplicacion.runWithContext(() => {
      useRecipesStore().recetas.push(mkReceta('r-1', [mkLinea('ri-1', 'mp-missing', 1)]))
    })
    await flushPromises()

    const desglose = wrapper.findComponent(RecetaCostoDesglose)
    expect(desglose.exists()).toBe(true)
    const calculo = desglose.props('calculo') as { ingredientes: { advertencia?: string }[] }
    expect(calculo.ingredientes[0]?.advertencia).toBe('MATERIA_PRIMA_FALTANTE')
  })

  // REQ-POS-47 cross-slice: when the receta has no producto yet, the
  // detail view shows a "Vender esta preparación" button that opens a
  // quick-create dialog. The actual crear call lands via the productos
  // store; for the spec we only assert the button + dialog surface.

  // REQ-UX-29: the local Volver button is gone — the global AppBar
  // back button owns that affordance. Asserting the testid is absent
  // guards against accidental re-introduction.
  it('does not render the local volver button (REQ-UX-29)', async () => {
    const wrapper = await montarVista('r-1')
    const { useRecipesStore } = await import('@/stores/recipes.store')
    await aplicacion.runWithContext(() => {
      useRecipesStore().recetas.push(mkReceta('r-1'))
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="receta-detalle-volver"]').exists()).toBe(false)
  })

  it('shows "Vender esta preparación" when the receta has no producto yet (REQ-POS-47)', async () => {
    const wrapper = await montarVista('r-1')
    const { useRecipesStore } = await import('@/stores/recipes.store')
    await aplicacion.runWithContext(() => {
      useRecipesStore().recetas.push(mkReceta('r-1'))
    })
    await flushPromises()

    const boton = wrapper.find('[data-testid="receta-detalle-vender"]')
    expect(boton.exists()).toBe(true)
    expect(boton.text()).toContain('Vender esta preparación')
  })

  it('opens the quick-create dialog with precio_venta input when "Vender esta preparación" is clicked (REQ-POS-47)', async () => {
    const wrapper = await montarVista('r-1')
    const { useRecipesStore } = await import('@/stores/recipes.store')
    await aplicacion.runWithContext(() => {
      useRecipesStore().recetas.push(mkReceta('r-1'))
    })
    await flushPromises()

    await wrapper.find('[data-testid="receta-detalle-vender"]').trigger('click')
    await flushPromises()

    // Dialog teleports to body; check globally.
    expect(document.body.textContent).toContain('Vender esta preparación')
    expect(document.querySelector('form.producto-form')).not.toBeNull()
  })
})

// REQ-EVENTS-15, REQ-EVENTS-16, REQ-EVENTS-17, REQ-EVENTS-19,
// REQ-EVENTS-36: the grid wraps N PlanProduccionRow components and
// owns the local form state (add row, delete row, save). It runs
// the duplicate-receta client-side check (REQ-EVENTS-17) and
// disables all controls when `editable` is false (REQ-EVENTS-16).
// The save button calls `guardarPlan` from the plans store; on
// success the parent can navigate away or refresh.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createClient } from '@supabase/supabase-js'

import PlanProduccionGrid from './PlanProduccionGrid.vue'
import { useProductosStore } from '@/stores/productos.store'
import { useRecipesStore } from '@/stores/recipes.store'
import type { PlanProduccionInput, Producto, RecetaConIngredientes } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkReceta = (id: string, overrides: Partial<RecetaConIngredientes> = {}): RecetaConIngredientes => ({
  id,
  nombre: id,
  descripcion: null,
  rendimiento_unidades: 4,
  notas: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ingredientes: [],
  ...overrides,
})

const mkProducto = (overrides: Partial<Producto> & { id: string; receta_id: string; nombre: string }): Producto => ({
  categoria: null,
  precio_venta: null,
  disponible: true,
  orden: 0,
  descripcion: null,
  icono: null,
  color: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

let aplicacion: App

beforeEach(() => {
  setActivePinia(createPinia())
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide('supabase', createClient('http://x', 'anon'))
})

const mountGrid = (
  props: {
    eventoId?: string
    filasIniciales?: PlanProduccionInput[]
    editable?: boolean
    productos?: Partial<Producto> & { id: string; receta_id: string; nombre: string }[]
  } = {},
) => {
  setActivePinia(createPinia())
  // Seed the recipes store with the two recetas used in the tests.
  aplicacion.runWithContext(() => {
    const recipesStore = useRecipesStore()
    recipesStore.recetas.push(
      mkReceta('r-1', { nombre: 'Pan de muerto' }),
      mkReceta('r-2', { nombre: 'Galletas' }),
    )
    // Seed productos store when provided (Stage B).
    if (props.productos) {
      const productosStore = useProductosStore()
      productosStore.productos.push(...props.productos.map((p) => mkProducto(p)))
    }
  })
  return mount(PlanProduccionGrid, {
    props: {
      eventoId: props.eventoId ?? 'e-1',
      filasIniciales: props.filasIniciales ?? [],
      editable: props.editable ?? true,
    },
    global: {
      plugins: [vuetify],
      provide: { supabase: createClient('http://x', 'anon') },
    },
  })
}

describe('PlanProduccionGrid', () => {
  it('renders an empty state with an "Agregar fila" button when there are no rows (REQ-EVENTS-15, REQ-EVENTS-36)', () => {
    const wrapper = mountGrid()

    expect(wrapper.text()).toContain('Agregar fila')
    expect(wrapper.text()).toContain('Sin filas en el plan')
  })

  it('adds a new row when "Agregar fila" is clicked (REQ-EVENTS-15)', async () => {
    const wrapper = mountGrid()
    await wrapper.find('[data-testid="plan-agregar-fila"]').trigger('click')

    const filas = wrapper.findAll('[data-testid="plan-fila"]')
    expect(filas).toHaveLength(1)
  })

  it('blocks adding a duplicate receta and shows "Esta receta ya está en el plan" (REQ-EVENTS-17)', async () => {
    const wrapper = mountGrid({
      filasIniciales: [
        { evento_id: 'e-1', receta_id: 'r-1', unidades_a_producir: 5 },
      ],
    })
    await wrapper.find('[data-testid="plan-agregar-fila"]').trigger('click')
    await flushPromises()

    // Set the new row's receta to r-1 (already in the grid).
    const filas = wrapper.findAll('[data-testid="plan-fila"]')
    expect(filas).toHaveLength(2)
    const nuevoSelector = filas[1]?.findComponent({ name: 'SelectorReceta' })
    expect(nuevoSelector).toBeTruthy()
    await nuevoSelector!.vm.$emit('update:modelValue', 'r-1')
    await flushPromises()

    expect(wrapper.text()).toContain('Esta receta ya está en el plan')
  })

  it('emits save with the filas when "Guardar plan" is clicked (REQ-EVENTS-19)', async () => {
    const wrapper = mountGrid({
      filasIniciales: [
        { evento_id: 'e-1', receta_id: 'r-1', unidades_a_producir: 10 },
      ],
    })

    await wrapper.find('[data-testid="plan-guardar"]').trigger('click')
    await flushPromises()

    const emits = wrapper.emitted('save')
    expect(emits).toBeTruthy()
    const payload = emits?.[0]?.[0] as PlanProduccionInput[]
    expect(payload).toHaveLength(1)
    expect(payload[0]?.receta_id).toBe('r-1')
  })

  it('hides the add and save buttons when editable is false (REQ-EVENTS-16)', () => {
    const wrapper = mountGrid({ editable: false })

    expect(wrapper.find('[data-testid="plan-agregar-fila"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="plan-guardar"]').exists()).toBe(false)
  })

  // Stage B: product-name enrichment
  it('passes enriched recetas with producto.nombre when a linked product exists', () => {
    const wrapper = mountGrid({
      filasIniciales: [
        { evento_id: 'e-1', receta_id: 'r-1', unidades_a_producir: 5 },
      ],
      productos: [{ id: 'p-1', receta_id: 'r-1', nombre: 'Pan de muerto 6-pack' }],
    })

    const filas = wrapper.findAll('[data-testid="plan-fila"]')
    expect(filas).toHaveLength(1)
    const selector = filas[0]?.findComponent({ name: 'SelectorReceta' })
    expect(selector).toBeTruthy()
    const recetasProp = selector!.props('recetas') as RecetaConIngredientes[]
    const r1 = recetasProp.find((r) => r.id === 'r-1')
    expect(r1?.nombre).toBe('Pan de muerto 6-pack')
  })

  it('falls back to receta.nombre when no linked product exists', () => {
    const wrapper = mountGrid({
      filasIniciales: [
        { evento_id: 'e-1', receta_id: 'r-2', unidades_a_producir: 3 },
      ],
    })

    const filas = wrapper.findAll('[data-testid="plan-fila"]')
    expect(filas).toHaveLength(1)
    const selector = filas[0]?.findComponent({ name: 'SelectorReceta' })
    expect(selector).toBeTruthy()
    const recetasProp = selector!.props('recetas') as RecetaConIngredientes[]
    const r2 = recetasProp.find((r) => r.id === 'r-2')
    expect(r2?.nombre).toBe('Galletas')
  })
})
// mobile-ux-redesign Phase 4: Inventario store — reactive inventory
// computed properties consuming ingredients + recipes stores.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, MateriaPrima, RecetaConIngredientes } from '@/types'
import { useInventarioStore } from './inventario.store'
import { useIngredientsStore } from './ingredients.store'
import { useRecipesStore } from './recipes.store'

const mkMateria = (id: string, overrides: Partial<MateriaPrima> = {}): MateriaPrima => ({
  id,
  nombre: 'Harina',
  unidad: 'kg',
  costo_por_unidad: 2.5,
  categoria: 'ingrediente',
  notas: null,
  cantidad_disponible: 100,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const mkReceta = (id: string, overrides: Partial<RecetaConIngredientes> = {}): RecetaConIngredientes => ({
  id,
  nombre: 'Brownies',
  descripcion: null,
  rendimiento_unidades: 12,
  notas: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ingredientes: [],
  ...overrides,
})

let aplicacion: App

beforeEach(() => {
  setActivePinia(createPinia())
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide(
    'supabase',
    createClient('http://x', 'anon') as SupabaseClient<Database>,
  )
})

function conContexto<T>(callback: () => T): T {
  return aplicacion.runWithContext(callback)
}

describe('useInventarioStore', () => {
  it('items reflects all ingredients from the ingredients store', () => {
    conContexto(() => {
      const ingStore = useIngredientsStore()
      ingStore.materiasPrimas.push(
        mkMateria('mp-1', { nombre: 'Harina', cantidad_disponible: 500 }),
        mkMateria('mp-2', { nombre: 'Azúcar', cantidad_disponible: 200 }),
      )
      const store = useInventarioStore()
      expect(store.items).toHaveLength(2)
    })
  })

  it('stockCritico counts ingredients below 20% of recipe need', () => {
    conContexto(() => {
      const ingStore = useIngredientsStore()
      const recStore = useRecipesStore()

      ingStore.materiasPrimas.push(
        mkMateria('mp-1', { nombre: 'Harina', cantidad_disponible: 10 }),
        mkMateria('mp-2', { nombre: 'Azúcar', cantidad_disponible: 200 }),
        mkMateria('mp-3', { nombre: 'Huevos', cantidad_disponible: 5 }),
      )

      recStore.recetas.push(mkReceta('rec-1', {
        ingredientes: [
          { id: 'ri-1', receta_id: 'rec-1', materia_prima_id: 'mp-1', cantidad: 100, created_at: '' },
          { id: 'ri-2', receta_id: 'rec-1', materia_prima_id: 'mp-2', cantidad: 100, created_at: '' },
          { id: 'ri-3', receta_id: 'rec-1', materia_prima_id: 'mp-3', cantidad: 100, created_at: '' },
        ],
      }))

      const store = useInventarioStore()
      // 10/100=10% crítico, 200/100=200% normal, 5/100=5% crítico → 2
      expect(store.stockCritico).toBe(2)
    })
  })

  it('unidadesPosiblesPorProducto maps receta_id to producible units', () => {
    conContexto(() => {
      const ingStore = useIngredientsStore()
      const recStore = useRecipesStore()

      ingStore.materiasPrimas.push(
        mkMateria('mp-1', { nombre: 'Harina', cantidad_disponible: 500 }),
        mkMateria('mp-2', { nombre: 'Azúcar', cantidad_disponible: 200 }),
      )

      recStore.recetas.push(mkReceta('rec-1', {
        ingredientes: [
          { id: 'ri-1', receta_id: 'rec-1', materia_prima_id: 'mp-1', cantidad: 200, created_at: '' },
          { id: 'ri-2', receta_id: 'rec-1', materia_prima_id: 'mp-2', cantidad: 100, created_at: '' },
        ],
      }))

      const store = useInventarioStore()
      // min(500/200=2, 200/100=2) = 2
      expect(store.unidadesPosiblesPorProducto.get('rec-1')).toBe(2)
    })
  })

  it('is reactive to changes in ingredients store', () => {
    conContexto(() => {
      const ingStore = useIngredientsStore()
      const store = useInventarioStore()

      expect(store.items).toEqual([])

      ingStore.materiasPrimas.push(mkMateria('mp-1', { nombre: 'Nuevo' }))
      expect(store.items).toHaveLength(1)
    })
  })

  it('stockCritico is 0 when no recipes exist (no need)', () => {
    conContexto(() => {
      const ingStore = useIngredientsStore()
      ingStore.materiasPrimas.push(
        mkMateria('mp-1', { nombre: 'Harina', cantidad_disponible: 0 }),
      )
      const store = useInventarioStore()
      // No recipes → necesidadTotal = 0 → alertLevel(0, 0) = 'normal' → 0 crítico
      expect(store.stockCritico).toBe(0)
    })
  })
})

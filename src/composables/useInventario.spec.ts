// mobile-ux-redesign Phase 4: useInventario composable unit tests.
// Tests the pure functions alertLevel and unidadesPosibles, plus
// store-integrated reactive properties.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  alertLevel,
  unidadesPosibles,
  useInventario,
} from './useInventario'
import { useIngredientsStore } from '@/stores/ingredients.store'
import { useRecipesStore } from '@/stores/recipes.store'
import { useStockMovementsStore } from '@/stores/stockMovements.store'
import type { Database, MateriaPrima, RecetaConIngredientes } from '@/types'

// ---------------------------------------------------------------------------
// Task 4.7 — alertLevel
// ---------------------------------------------------------------------------

describe('alertLevel', () => {
  it('returns "normal" when stock is at 100% of need', () => {
    expect(alertLevel(100, 100)).toBe('normal')
  })

  it('returns "normal" when stock is at exactly 50% of need', () => {
    expect(alertLevel(50, 100)).toBe('normal')
  })

  it('returns "bajo" when stock is below 50% but at or above 20%', () => {
    expect(alertLevel(49, 100)).toBe('bajo')
  })

  it('returns "bajo" at exactly 20% of need', () => {
    expect(alertLevel(20, 100)).toBe('bajo')
  })

  it('returns "crítico" when stock is below 20% of need', () => {
    expect(alertLevel(19, 100)).toBe('crítico')
  })

  it('returns "crítico" at near-zero stock (1%)', () => {
    expect(alertLevel(1, 100)).toBe('crítico')
  })

  it('returns "crítico" when stockActual is 0', () => {
    expect(alertLevel(0, 100)).toBe('crítico')
  })

  it('returns "normal" when stockNecesario is 0 (no need)', () => {
    expect(alertLevel(5, 0)).toBe('normal')
  })

  it('returns "normal" when both stockActual and stockNecesario are 0', () => {
    expect(alertLevel(0, 0)).toBe('normal')
  })

  it('handles decimal values correctly', () => {
    expect(alertLevel(19.9, 100)).toBe('crítico')
    expect(alertLevel(20.0, 100)).toBe('bajo')
    expect(alertLevel(49.9, 100)).toBe('bajo')
    expect(alertLevel(50.0, 100)).toBe('normal')
  })
})

// ---------------------------------------------------------------------------
// Task 4.8 — unidadesPosibles
// ---------------------------------------------------------------------------

describe('unidadesPosibles', () => {
  it('calculates producible units from two ingredients', () => {
    const stock = new Map<string, number>([
      ['mp-harina', 1000],
      ['mp-azucar', 500],
    ])
    const receta = [
      { materia_prima_id: 'mp-harina', cantidad: 200 },
      { materia_prima_id: 'mp-azucar', cantidad: 100 },
    ]
    // 1000/200 = 5, 500/100 = 5 → min = 5
    expect(unidadesPosibles(stock, receta)).toBe(5)
  })

  it('returns capacity limited by the scarcest ingredient', () => {
    const stock = new Map<string, number>([
      ['mp-harina', 1000],
      ['mp-azucar', 100],
    ])
    const receta = [
      { materia_prima_id: 'mp-harina', cantidad: 200 },
      { materia_prima_id: 'mp-azucar', cantidad: 100 },
    ]
    // 1000/200 = 5, 100/100 = 1 → min = 1
    expect(unidadesPosibles(stock, receta)).toBe(1)
  })

  it('floors to integer (does not return decimals)', () => {
    const stock = new Map<string, number>([['mp-harina', 350]])
    const receta = [{ materia_prima_id: 'mp-harina', cantidad: 200 }]
    // 350/200 = 1.75 → floored to 1
    expect(unidadesPosibles(stock, receta)).toBe(1)
  })

  it('returns 0 when any ingredient is out of stock', () => {
    const stock = new Map<string, number>([
      ['mp-harina', 1000],
      ['mp-azucar', 0],
    ])
    const receta = [
      { materia_prima_id: 'mp-harina', cantidad: 200 },
      { materia_prima_id: 'mp-azucar', cantidad: 100 },
    ]
    // 1000/200 = 5, 0/100 = 0 → min = 0
    expect(unidadesPosibles(stock, receta)).toBe(0)
  })

  it('returns 0 for an empty recipe', () => {
    const stock = new Map<string, number>([['mp-harina', 1000]])
    expect(unidadesPosibles(stock, [])).toBe(0)
  })

  it('returns 0 when a required ingredient is not in the stock map', () => {
    const stock = new Map<string, number>([['mp-harina', 1000]])
    const receta = [
      { materia_prima_id: 'mp-harina', cantidad: 200 },
      { materia_prima_id: 'mp-desconocido', cantidad: 100 },
    ]
    // 1000/200 = 5, missing ingredient → 0
    expect(unidadesPosibles(stock, receta)).toBe(0)
  })

  it('handles a single ingredient recipe', () => {
    const stock = new Map<string, number>([['mp-sal', 500]])
    const receta = [{ materia_prima_id: 'mp-sal', cantidad: 50 }]
    expect(unidadesPosibles(stock, receta)).toBe(10)
  })

  it('returns 0 when stock map is empty', () => {
    const stock = new Map<string, number>()
    const receta = [{ materia_prima_id: 'mp-x', cantidad: 10 }]
    expect(unidadesPosibles(stock, receta)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Task 4.2 & 4.10 — Store-integrated composable
// ---------------------------------------------------------------------------

let aplicacion: App

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

describe('useInventario (store-integrated)', () => {
  it('items reflects all materias primas from the store', () => {
    conContexto(() => {
      const store = useIngredientsStore()
      store.materiasPrimas.push(
        mkMateria('mp-1', { nombre: 'Harina', cantidad_disponible: 500 }),
        mkMateria('mp-2', { nombre: 'Azúcar', cantidad_disponible: 200 }),
      )
      const { items } = useInventario()
      expect(items.value).toHaveLength(2)
      expect(items.value.map((i) => i.nombre)).toEqual(['Harina', 'Azúcar'])
    })
  })

  it('returns empty items when store has no data', () => {
    conContexto(() => {
      const { items } = useInventario()
      expect(items.value).toEqual([])
    })
  })

  it('stockCritico counts items with alert level crítico — ledger-backed stock', () => {
    conContexto(() => {
      const ingStore = useIngredientsStore()
      const recStore = useRecipesStore()
      const stockStore = useStockMovementsStore()

      // Ingredients: cantidad_disponible is the OLD field; stockActual from
      // ledger should be preferred. Set them to DIFFERENT values to prove
      // the composable reads the ledger.
      ingStore.materiasPrimas.push(
        mkMateria('mp-1', { nombre: 'Harina', cantidad_disponible: 9999 }),
        mkMateria('mp-2', { nombre: 'Azúcar', cantidad_disponible: 9999 }),
        mkMateria('mp-3', { nombre: 'Huevos', cantidad_disponible: 9999 }),
      )

      // Ledger says: Harina=10, Azúcar=200, Huevos=5
      stockStore.stockActual = [
        { materia_prima_id: 'mp-1', nombre: 'Harina', unidad: 'kg', stock_actual: 10 },
        { materia_prima_id: 'mp-2', nombre: 'Azúcar', unidad: 'kg', stock_actual: 200 },
        { materia_prima_id: 'mp-3', nombre: 'Huevos', unidad: 'unidad', stock_actual: 5 },
      ]

      // Recipe needs 100 of each
      recStore.recetas.push(mkReceta('rec-1', {
        ingredientes: [
          { id: 'ri-1', receta_id: 'rec-1', materia_prima_id: 'mp-1', cantidad: 100, created_at: '' },
          { id: 'ri-2', receta_id: 'rec-1', materia_prima_id: 'mp-2', cantidad: 100, created_at: '' },
          { id: 'ri-3', receta_id: 'rec-1', materia_prima_id: 'mp-3', cantidad: 100, created_at: '' },
        ],
      }))

      const { stockCritico } = useInventario()
      // Harina: 10/100 = 10% crítico
      // Azúcar: 200/100 = 200% normal
      // Huevos: 5/100 = 5% crítico
      expect(stockCritico.value).toBe(2)
    })
  })

  it('stockCritico is 0 when all ingredients have normal stock — ledger-backed', () => {
    conContexto(() => {
      const ingStore = useIngredientsStore()
      const recStore = useRecipesStore()
      const stockStore = useStockMovementsStore()

      // Ingredients with high flat cantidad_disponible
      ingStore.materiasPrimas.push(
        mkMateria('mp-1', { nombre: 'Harina', cantidad_disponible: 1000 }),
        mkMateria('mp-2', { nombre: 'Azúcar', cantidad_disponible: 800 }),
      )

      // Ledger confirms high stock too
      stockStore.stockActual = [
        { materia_prima_id: 'mp-1', nombre: 'Harina', unidad: 'kg', stock_actual: 1000 },
        { materia_prima_id: 'mp-2', nombre: 'Azúcar', unidad: 'kg', stock_actual: 800 },
      ]

      // Recipe needs 100 each → both at 800%+ → normal
      recStore.recetas.push(mkReceta('rec-1', {
        ingredientes: [
          { id: 'ri-1', receta_id: 'rec-1', materia_prima_id: 'mp-1', cantidad: 100, created_at: '' },
          { id: 'ri-2', receta_id: 'rec-1', materia_prima_id: 'mp-2', cantidad: 100, created_at: '' },
        ],
      }))

      const { stockCritico } = useInventario()
      expect(stockCritico.value).toBe(0)
    })
  })

  it('unidadesPosiblesPorProducto calculates capacity from ledger stock', () => {
    conContexto(() => {
      const ingStore = useIngredientsStore()
      const recStore = useRecipesStore()
      const stockStore = useStockMovementsStore()

      // Ingredients: cantidad_disponible set to DIFFERENT (old) values —
      // the composable must use ledger stock instead
      ingStore.materiasPrimas.push(
        mkMateria('mp-1', { nombre: 'Harina', cantidad_disponible: 9999 }),
        mkMateria('mp-2', { nombre: 'Azúcar', cantidad_disponible: 9999 }),
      )

      // Ledger: 500g harina, 200g azúcar
      stockStore.stockActual = [
        { materia_prima_id: 'mp-1', nombre: 'Harina', unidad: 'g', stock_actual: 500 },
        { materia_prima_id: 'mp-2', nombre: 'Azúcar', unidad: 'g', stock_actual: 200 },
      ]

      // Recipe: Brownies needs 200g harina + 100g azúcar
      recStore.recetas.push(mkReceta('rec-1', {
        nombre: 'Brownies',
        rendimiento_unidades: 12,
        ingredientes: [
          { id: 'ri-1', receta_id: 'rec-1', materia_prima_id: 'mp-1', cantidad: 200, created_at: '' },
          { id: 'ri-2', receta_id: 'rec-1', materia_prima_id: 'mp-2', cantidad: 100, created_at: '' },
        ],
      }))

      const { unidadesPosiblesPorProducto } = useInventario()
      const capacity = unidadesPosiblesPorProducto.value
      // Brownies: min(500/200, 200/100) = min(2, 2) = 2
      expect(capacity.get('rec-1')).toBe(2)
    })
  })

  it('unidadesPosiblesPorProducto returns 0 when an ingredient is out of stock — ledger-backed', () => {
    conContexto(() => {
      const ingStore = useIngredientsStore()
      const recStore = useRecipesStore()
      const stockStore = useStockMovementsStore()

      ingStore.materiasPrimas.push(
        mkMateria('mp-1', { nombre: 'Harina', cantidad_disponible: 9999 }),
        mkMateria('mp-2', { nombre: 'Azúcar', cantidad_disponible: 200 }),
      )

      // Ledger: Harina has 0 stock
      stockStore.stockActual = [
        { materia_prima_id: 'mp-1', nombre: 'Harina', unidad: 'g', stock_actual: 0 },
        { materia_prima_id: 'mp-2', nombre: 'Azúcar', unidad: 'g', stock_actual: 200 },
      ]

      recStore.recetas.push(mkReceta('rec-1', {
        ingredientes: [
          { id: 'ri-1', receta_id: 'rec-1', materia_prima_id: 'mp-1', cantidad: 200, created_at: '' },
          { id: 'ri-2', receta_id: 'rec-1', materia_prima_id: 'mp-2', cantidad: 100, created_at: '' },
        ],
      }))

      const { unidadesPosiblesPorProducto } = useInventario()
      const capacity = unidadesPosiblesPorProducto.value
      expect(capacity.get('rec-1')).toBe(0)
    })
  })

  it('items are reactive to store changes', () => {
    conContexto(() => {
      const { items } = useInventario()
      const store = useIngredientsStore()

      expect(items.value).toEqual([])

      store.materiasPrimas.push(mkMateria('mp-1', { nombre: 'Nuevo' }))
      expect(items.value).toHaveLength(1)
      expect(items.value[0]!.nombre).toBe('Nuevo')
    })
  })

  // ---- Work Unit 4: ledger-backed stock ----

  it('stockDisponible reflects ledger stock and ignores cantidad_disponible', () => {
    conContexto(() => {
      const ingStore = useIngredientsStore()
      const stockStore = useStockMovementsStore()

      ingStore.materiasPrimas.push(
        mkMateria('mp-1', { nombre: 'Harina', cantidad_disponible: 500 }),
        mkMateria('mp-2', { nombre: 'Azúcar', cantidad_disponible: 200 }),
      )

      // Ledger says: Harina=300, Azúcar=100 — different from cantidad_disponible
      stockStore.stockActual = [
        { materia_prima_id: 'mp-1', nombre: 'Harina', unidad: 'g', stock_actual: 300 },
        { materia_prima_id: 'mp-2', nombre: 'Azúcar', unidad: 'g', stock_actual: 100 },
      ]

      const { stockDisponible } = useInventario()
      expect(stockDisponible.value.get('mp-1')).toBe(300)
      expect(stockDisponible.value.get('mp-2')).toBe(100)
    })
  })

  it('stockDisponible returns 0 for ingredients with no ledger entry', () => {
    conContexto(() => {
      const ingStore = useIngredientsStore()
      const stockStore = useStockMovementsStore()

      // Ingredient with high flat value but NO ledger entry
      ingStore.materiasPrimas.push(
        mkMateria('mp-1', { nombre: 'Huevos', cantidad_disponible: 999 }),
      )

      // Ledger has NO entry for mp-1
      stockStore.stockActual = []

      const { stockDisponible, stockCritico } = useInventario()
      // Falls back to 0, NOT to cantidad_disponible
      expect(stockDisponible.value.get('mp-1')).toBeUndefined()
      // stockCritico should see 0 stock (but no recipe needs it → normal)
      expect(stockCritico.value).toBe(0)
    })
  })

  it('stockCritico uses ledger stock, not cantidad_disponible — regression gate', () => {
    conContexto(() => {
      const ingStore = useIngredientsStore()
      const recStore = useRecipesStore()
      const stockStore = useStockMovementsStore()

      // Flat DB says: all fine (high stock)
      ingStore.materiasPrimas.push(
        mkMateria('mp-1', { nombre: 'Harina', cantidad_disponible: 500 }),
        mkMateria('mp-2', { nombre: 'Azúcar', cantidad_disponible: 500 }),
      )

      // But ledger reveals: both are critically low
      stockStore.stockActual = [
        { materia_prima_id: 'mp-1', nombre: 'Harina', unidad: 'g', stock_actual: 10 },
        { materia_prima_id: 'mp-2', nombre: 'Azúcar', unidad: 'g', stock_actual: 10 },
      ]

      recStore.recetas.push(mkReceta('rec-1', {
        ingredientes: [
          { id: 'ri-1', receta_id: 'rec-1', materia_prima_id: 'mp-1', cantidad: 100, created_at: '' },
          { id: 'ri-2', receta_id: 'rec-1', materia_prima_id: 'mp-2', cantidad: 100, created_at: '' },
        ],
      }))

      const { stockCritico } = useInventario()
      // 10/100 = 10% → crítico for both
      expect(stockCritico.value).toBe(2)
    })
  })

  it('unidadesPosiblesPorProducto uses ledger stock — regression gate', () => {
    conContexto(() => {
      const ingStore = useIngredientsStore()
      const recStore = useRecipesStore()
      const stockStore = useStockMovementsStore()

      // Flat DB says: plenty (9999 each → would give min(49, 99) = 49)
      ingStore.materiasPrimas.push(
        mkMateria('mp-1', { nombre: 'Harina', cantidad_disponible: 9999 }),
        mkMateria('mp-2', { nombre: 'Azúcar', cantidad_disponible: 9999 }),
      )

      // Ledger says: only 200g harina, 100g azúcar
      stockStore.stockActual = [
        { materia_prima_id: 'mp-1', nombre: 'Harina', unidad: 'g', stock_actual: 200 },
        { materia_prima_id: 'mp-2', nombre: 'Azúcar', unidad: 'g', stock_actual: 100 },
      ]

      recStore.recetas.push(mkReceta('rec-1', {
        ingredientes: [
          { id: 'ri-1', receta_id: 'rec-1', materia_prima_id: 'mp-1', cantidad: 200, created_at: '' },
          { id: 'ri-2', receta_id: 'rec-1', materia_prima_id: 'mp-2', cantidad: 100, created_at: '' },
        ],
      }))

      const { unidadesPosiblesPorProducto } = useInventario()
      // min(200/200, 100/100) = min(1, 1) = 1 — NOT min(49, 99) = 49
      expect(unidadesPosiblesPorProducto.value.get('rec-1')).toBe(1)
    })
  })

  it('stockCritico is reactive when ledger stock changes', () => {
    conContexto(() => {
      const ingStore = useIngredientsStore()
      const recStore = useRecipesStore()
      const stockStore = useStockMovementsStore()

      ingStore.materiasPrimas.push(
        mkMateria('mp-1', { nombre: 'Harina', cantidad_disponible: 0 }),
      )

      recStore.recetas.push(mkReceta('rec-1', {
        ingredientes: [
          { id: 'ri-1', receta_id: 'rec-1', materia_prima_id: 'mp-1', cantidad: 100, created_at: '' },
        ],
      }))

      // Ledger: critically low
      stockStore.stockActual = [
        { materia_prima_id: 'mp-1', nombre: 'Harina', unidad: 'g', stock_actual: 10 },
      ]

      const { stockCritico, stockDisponible } = useInventario()
      // 10/100 = 10% → crítico
      expect(stockCritico.value).toBe(1)

      // Replenish: now well above threshold
      stockStore.stockActual = [
        { materia_prima_id: 'mp-1', nombre: 'Harina', unidad: 'g', stock_actual: 200 },
      ]
      // 200/100 = 200% → normal
      expect(stockCritico.value).toBe(0)
      expect(stockDisponible.value.get('mp-1')).toBe(200)
    })
  })
})

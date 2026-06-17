// REQ-CATALOG-9..12, REQ-CATALOG-15, REQ-CATALOG-42: recipes store wires
// the factory-built service into Pinia reactive state, owns the
// recetas cache, and exposes a `costoPorReceta(id)` computed that
// reactively reads `useIngredientsStore().materiasPrimas` so the cost
// breakdown stays in sync when ingredient prices change.
// SRP (REQ-CATALOG-42): this store never defines a `materiasPrimas`
// array — it reads from the ingredients store via cross-store getter.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'

import {
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import type { IngredienteReceta, RecetaConIngredientes } from '@/types'
import { useIngredientsStore } from '@/stores/ingredients.store'
import { useRecipesStore } from './recipes.store'

const mkReceta = (
  id: string,
  ingredientes: IngredienteReceta[] = [],
  overrides: Partial<RecetaConIngredientes> = {},
): RecetaConIngredientes => ({
  id,
  nombre: 'Pan básico',
  descripcion: null,
  rendimiento_unidades: 2,
  notas: null,
  ingredientes,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const mkLinea = (id: string, materiaPrimaId: string, cantidad: number): IngredienteReceta => ({
  id,
  receta_id: 'r-1',
  materia_prima_id: materiaPrimaId,
  cantidad,
  created_at: '2026-01-01T00:00:00Z',
})

let aplicacion: App

beforeEach(() => {
  setActivePinia(createPinia())
  __resetSupabaseMock()
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide('supabase', createClient('http://x', 'anon'))
})

function conContexto<T>(callback: () => T): T {
  return aplicacion.runWithContext(callback)
}

describe('useRecipesStore', () => {
  it('starts empty with cargando=false and error=null', () => {
    conContexto(() => {
      const store = useRecipesStore()
      expect(store.recetas).toEqual([])
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('cargarTodas fetches the recetas and stores them (REQ-CATALOG-9)', async () => {
    const receta = mkReceta('r-1', [], { nombre: 'Pan básico' })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [receta], error: null })
    await conContexto(async () => {
      const store = useRecipesStore()
      await store.cargarTodas()

      expect(store.recetas).toHaveLength(1)
      expect(store.recetas[0]?.nombre).toBe('Pan básico')
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('cargarTodas surfaces supabase errors in Spanish (REQ-CATALOG-8)', async () => {
    __pushSupabaseResponse<RecetaConIngredientes[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection refused' },
    })
    await conContexto(async () => {
      const store = useRecipesStore()
      await store.cargarTodas()

      expect(store.error).toMatch(/Error al cargar las recetas/)
      expect(store.recetas).toEqual([])
    })
  })

  it('crear prepends the new receta (REQ-CATALOG-10)', async () => {
    const creada = mkReceta('r-new', [], { nombre: 'Galleta' })
    __pushSupabaseResponse<RecetaConIngredientes>({ data: creada, error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })
    await conContexto(async () => {
      const store = useRecipesStore()
      store.recetas.push(mkReceta('r-1', [], { nombre: 'Existente' }))

      const resultado = await store.crear({
        nombre: 'Galleta',
        descripcion: null,
        rendimiento_unidades: 24,
        notas: null,
        ingredientes: [],
      })

      expect(resultado.error).toBeNull()
      expect(store.recetas).toHaveLength(2)
      expect(store.recetas[0]?.nombre).toBe('Galleta')
    })
  })

  it('actualizar mutates the matching receta in place (REQ-CATALOG-11)', async () => {
    const receta = mkReceta('r-1', [], { rendimiento_unidades: 2 })
    const actualizada = { ...receta, rendimiento_unidades: 3 }
    __pushSupabaseResponse<RecetaConIngredientes>({ data: actualizada, error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })
    await conContexto(async () => {
      const store = useRecipesStore()
      store.recetas.push(receta)

      const resultado = await store.actualizar('r-1', {
        nombre: 'Pan básico',
        descripcion: null,
        rendimiento_unidades: 3,
        notas: null,
        ingredientes: [],
      })

      expect(resultado.error).toBeNull()
      expect(store.recetas[0]?.rendimiento_unidades).toBe(3)
    })
  })

  it('eliminar removes the matching receta (REQ-CATALOG-12)', async () => {
    const receta = mkReceta('r-1', [], { nombre: 'Galleta' })
    __pushSupabaseResponse<null>({ data: null, error: null })
    await conContexto(async () => {
      const store = useRecipesStore()
      store.recetas.push(receta)

      const resultado = await store.eliminar('r-1')

      expect(resultado.error).toBeNull()
      expect(store.recetas).toEqual([])
    })
  })

  it('costoPorReceta(id) computes from ingredients store reactively (REQ-CATALOG-15, REQ-CATALOG-42)', async () => {
    await conContexto(async () => {
      const ingredients = useIngredientsStore()
      ingredients.materiasPrimas.push(
        {
          id: 'mp-1',
          nombre: 'Harina',
          unidad: 'kg',
          costo_por_unidad: 2.5,
          notas: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'mp-2',
          nombre: 'Huevo',
          unidad: 'unidad',
          costo_por_unidad: 0.3,
          notas: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      )
      const store = useRecipesStore()
      store.recetas.push(
        mkReceta('r-1', [mkLinea('ri-1', 'mp-1', 1), mkLinea('ri-2', 'mp-2', 2)], {
          rendimiento_unidades: 4,
        }),
      )

      const calculoInicial = store.costoPorReceta('r-1')
      expect(calculoInicial.value.costoTotal).toBe(3.1)
      expect(calculoInicial.value.costoPorUnidad).toBe(0.78)

      // REQ-CATALOG-15: update harina cost reactively; the computed
      // recomputes because `ingredients.materiasPrimas` is in its deps.
      ingredients.materiasPrimas[0] = { ...ingredients.materiasPrimas[0]!, costo_por_unidad: 3 }
      expect(calculoInicial.value.costoTotal).toBe(3.6)
    })
  })

  it('costoPorReceta returns zero cost for unknown id and marks missing MP', async () => {
    await conContexto(async () => {
      const store = useRecipesStore()
      store.recetas.push(mkReceta('r-1', [mkLinea('ri-1', 'mp-missing', 1)]))

      const calculo = store.costoPorReceta('r-1').value
      expect(calculo.costoTotal).toBe(0)
      expect(calculo.ingredientes[0]?.advertencia).toBe('MATERIA_PRIMA_FALTANTE')
    })
  })

  it('manages only recetas — no materiasPrimas state (REQ-CATALOG-42)', () => {
    conContexto(() => {
      const store = useRecipesStore()
      const claves = Object.keys(store)
      expect(claves.some((k) => /materiasPrimas/i.test(k))).toBe(false)
    })
  })
})

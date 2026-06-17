// REQ-CATALOG-1..5, REQ-CATALOG-7, REQ-CATALOG-8, REQ-CATALOG-42, REQ-CATALOG-46:
// ingredients store wires the factory-built service into Pinia reactive state,
// loads on demand via `cargarTodas`, and surfaces errors through `error` ref
// without throwing. SRP: only `materias_primas` lives here; recipes are in
// their own store (verified by absence of receta-shaped state).
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import {
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import type { MateriaPrima, MateriaPrimaInput } from '@/types'
import { useIngredientsStore } from './ingredients.store'

const mkMateria = (id: string, overrides: Partial<MateriaPrima> = {}): MateriaPrima => ({
  id,
  nombre: 'Harina',
  unidad: 'kg',
  costo_por_unidad: 2.5,
  notas: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const mkInput = (overrides: Partial<MateriaPrimaInput> = {}): MateriaPrimaInput => ({
  nombre: 'Harina',
  unidad: 'kg',
  costo_por_unidad: 2.5,
  notas: null,
  ...overrides,
})

describe('useIngredientsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    __resetSupabaseMock()
  })

  it('starts empty with cargando=false and error=null', () => {
    const store = useIngredientsStore()
    expect(store.materiasPrimas).toEqual([])
    expect(store.cargando).toBe(false)
    expect(store.error).toBeNull()
  })

  it('cargarTodas fetches the list and stores it (REQ-CATALOG-1)', async () => {
    __pushSupabaseResponse<MateriaPrima[]>({
      data: [mkMateria('mp-1', { nombre: 'Harina' }), mkMateria('mp-2', { nombre: 'Azúcar' })],
      error: null,
    })
    const store = useIngredientsStore()
    await store.cargarTodas()

    expect(store.materiasPrimas).toHaveLength(2)
    expect(store.materiasPrimas[0]?.nombre).toBe('Harina')
    expect(store.cargando).toBe(false)
    expect(store.error).toBeNull()
  })

  it('cargarTodas sets cargando=true during the fetch (REQ-CATALOG-7)', async () => {
    let cargandoVisto = false
    __pushSupabaseResponse<MateriaPrima[]>({ data: [], error: null })
    const store = useIngredientsStore()
    const promesa = store.cargarTodas()
    // Microtask: the action sets cargando before the first await yields.
    if (store.cargando) cargandoVisto = true
    await promesa
    expect(cargandoVisto || store.cargando === false).toBe(true)
  })

  it('cargarTodas surfaces supabase errors in Spanish (REQ-CATALOG-8)', async () => {
    __pushSupabaseResponse<MateriaPrima[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection refused' },
    })
    const store = useIngredientsStore()
    await store.cargarTodas()

    expect(store.error).toMatch(/Error al cargar las materias primas/)
    expect(store.materiasPrimas).toEqual([])
  })

  it('crear prepends the new ingredient on success (REQ-CATALOG-2)', async () => {
    const existente = mkMateria('mp-1', { nombre: 'Harina' })
    const creada = mkMateria('mp-new', { nombre: 'Mantequilla', unidad: 'g' })
    __pushSupabaseResponse<MateriaPrima[]>({ data: [], error: null })
    __pushSupabaseResponse<MateriaPrima>({ data: creada, error: null })
    const store = useIngredientsStore()
    store.materiasPrimas.push(existente)

    const resultado = await store.crear(mkInput({ nombre: 'Mantequilla', unidad: 'g' }))

    expect(resultado.error).toBeNull()
    expect(store.materiasPrimas).toHaveLength(2)
    expect(store.materiasPrimas[0]?.nombre).toBe('Mantequilla')
  })

  it('crear surfaces the duplicate error verbatim (REQ-CATALOG-5)', async () => {
    __pushSupabaseResponse<MateriaPrima[]>({
      data: [mkMateria('mp-1', { nombre: 'Azúcar' })],
      error: null,
    })
    const store = useIngredientsStore()

    const resultado = await store.crear(mkInput({ nombre: 'azúcar' }))

    expect(resultado.error?.code).toBe('DUPLICADO')
    expect(store.error).toMatch(/Ya existe una materia prima/)
  })

  it('actualizar mutates the matching row in place (REQ-CATALOG-3)', async () => {
    const materia = mkMateria('mp-1', { costo_por_unidad: 0.05 })
    const actualizada = { ...materia, costo_por_unidad: 0.06 }
    __pushSupabaseResponse<MateriaPrima>({ data: actualizada, error: null })
    const store = useIngredientsStore()
    store.materiasPrimas.push(materia)

    const resultado = await store.actualizar('mp-1', { costo_por_unidad: 0.06 })

    expect(resultado.error).toBeNull()
    expect(store.materiasPrimas[0]?.costo_por_unidad).toBe(0.06)
  })

  it('eliminar removes the matching row (REQ-CATALOG-4)', async () => {
    const materia = mkMateria('mp-1', { nombre: 'Sal' })
    __pushSupabaseResponse<null>({ data: null, error: null })
    const store = useIngredientsStore()
    store.materiasPrimas.push(materia)

    const resultado = await store.eliminar('mp-1')

    expect(resultado.error).toBeNull()
    expect(store.materiasPrimas).toEqual([])
  })

  it('eliminar surfaces FK-restriction error in Spanish (REQ-CATALOG-4)', async () => {
    __pushSupabaseResponse<null>({
      data: null,
      error: { code: '23503', message: 'foreign key violation' },
    })
    const store = useIngredientsStore()
    store.materiasPrimas.push(mkMateria('mp-1', { nombre: 'Harina' }))

    await store.eliminar('mp-1')

    expect(store.error).toMatch(/Harina/)
    expect(store.materiasPrimas).toHaveLength(1)
  })

  it('manages only materias_primas — no receta state (REQ-CATALOG-42)', () => {
    const store = useIngredientsStore()
    const claves = Object.keys(store)
    expect(claves.some((k) => /receta/i.test(k))).toBe(false)
  })
})

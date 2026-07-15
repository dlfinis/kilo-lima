// REQ-EVENT-INGREDIENT-PURCHASING: unit tests for the pure derivation
// core. Covers yield scaling, consolidation, filtering, stock gaps,
// zero/null stock, and warning generation for malformed links.
//
// Follows the same table-driven pattern as useProyeccionCostos.spec.ts:
// factory helpers + focused describe/it blocks per design §5.

import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  ProductoProduccion,
  EventoProducto,
  Producto,
  RecetaConIngredientes,
  MateriaPrima,
} from '@/types'
import { useProductoProduccionStore } from '@/stores/productoProduccion.store'
import { useEventoProductosStore } from '@/stores/eventoProductos.store'
import { useProductosStore } from '@/stores/productos.store'
import { useRecipesStore } from '@/stores/recipes.store'
import { useIngredientsStore } from '@/stores/ingredients.store'
import { calcularIngredientesEvento, useIngredientesEvento } from './useIngredientesEvento'

// ---------------------------------------------------------------------------
// Test factories — minimal valid shapes following the DB column convention
// ---------------------------------------------------------------------------

const mkPP = (
  id: string,
  eventoProductoId: string,
  unidades: number,
): ProductoProduccion => ({
  id,
  evento_producto_id: eventoProductoId,
  unidades_a_producir: unidades,
  created_at: '2026-01-01T00:00:00Z',
})

const mkEP = (
  id: string,
  eventoId: string,
  productoId: string,
  incluido = true,
): EventoProducto => ({
  id,
  evento_id: eventoId,
  producto_id: productoId,
  precio_venta: null,
  margen: null,
  incluido,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

const mkProducto = (id: string, recetaId: string, nombre?: string): Producto => ({
  id,
  receta_id: recetaId,
  nombre: nombre ?? `Producto ${id}`,
  categoria: null,
  precio_venta: null,
  disponible: true,
  orden: 1,
  descripcion: null,
  icono: null,
  color: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

const mkMateria = (
  id: string,
  nombre?: string,
  disponible?: number,
): MateriaPrima => ({
  id,
  nombre: nombre ?? id,
  unidad: 'kg',
  costo_por_unidad: 5,
  cantidad_disponible: disponible,
  notas: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

const mkReceta = (
  id: string,
  rendimiento: number,
  ingredientes: { materiaPrimaId: string; cantidad: number }[],
): RecetaConIngredientes => ({
  id,
  nombre: `Receta ${id}`,
  descripcion: null,
  rendimiento_unidades: rendimiento,
  notas: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ingredientes: ingredientes.map((ing, idx) => ({
    id: `ri-${id}-${idx}`,
    receta_id: id,
    materia_prima_id: ing.materiaPrimaId,
    cantidad: ing.cantidad,
    created_at: '2026-01-01T00:00:00Z',
  })),
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('calcularIngredientesEvento', () => {
  // --- Empty / zero inputs ---

  it('empty todos los arrays retorna zeros con listas vacías', () => {
    const r = calcularIngredientesEvento([], [], [], [], [])
    expect(r.porProducto).toEqual([])
    expect(r.consolidado).toEqual([])
    expect(r.advertencias).toEqual([])
  })

  it('plan con cero unidades no contribuye', () => {
    const pp = [mkPP('pp-1', 'ep-1', 0)]
    const ep = [mkEP('ep-1', 'e-1', 'prod-1')]
    const prod = [mkProducto('prod-1', 'r-1')]
    const rec = [mkReceta('r-1', 4, [{ materiaPrimaId: 'mp-1', cantidad: 2 }])]
    const mp = [mkMateria('mp-1')]

    const r = calcularIngredientesEvento(pp, ep, prod, rec, mp)
    expect(r.porProducto).toEqual([])
    expect(r.consolidado).toEqual([])
  })

  it('plan con unidades negativas no contribuye', () => {
    const pp = [mkPP('pp-1', 'ep-1', -5)]
    const ep = [mkEP('ep-1', 'e-1', 'prod-1')]
    const prod = [mkProducto('prod-1', 'r-1')]
    const rec = [mkReceta('r-1', 4, [{ materiaPrimaId: 'mp-1', cantidad: 2 }])]
    const mp = [mkMateria('mp-1')]

    const r = calcularIngredientesEvento(pp, ep, prod, rec, mp)
    expect(r.porProducto).toEqual([])
  })

  // --- Yield scaling ---

  it('escala cantidad por rendimiento y unidades — caso simple', () => {
    // Recipe yields 4 units using 2 kg of mp-1.
    // Per unit: 2/4 = 0.5 kg. Planned 10 units → 5 kg required.
    const pp = [mkPP('pp-1', 'ep-1', 10)]
    const ep = [mkEP('ep-1', 'e-1', 'prod-1')]
    const prod = [mkProducto('prod-1', 'r-1')]
    const rec = [mkReceta('r-1', 4, [{ materiaPrimaId: 'mp-1', cantidad: 2 }])]
    const mp = [mkMateria('mp-1', 'Harina')]

    const r = calcularIngredientesEvento(pp, ep, prod, rec, mp)

    expect(r.porProducto).toHaveLength(1)
    expect(r.porProducto[0]!.eventoProductoId).toBe('ep-1')
    expect(r.porProducto[0]!.productoNombre).toBe('Producto prod-1')
    expect(r.porProducto[0]!.ingredientes).toHaveLength(1)
    expect(r.porProducto[0]!.ingredientes[0]!.requerido).toBeCloseTo(5, 10)
    expect(r.porProducto[0]!.ingredientes[0]!.nombre).toBe('Harina')
    expect(r.porProducto[0]!.ingredientes[0]!.unidad).toBe('kg')

    expect(r.consolidado).toHaveLength(1)
    expect(r.consolidado[0]!.requerido).toBeCloseTo(5, 10)
  })

  it('múltiples ingredientes en una receta', () => {
    const pp = [mkPP('pp-1', 'ep-1', 8)]
    const ep = [mkEP('ep-1', 'e-1', 'prod-1')]
    const prod = [mkProducto('prod-1', 'r-1')]
    const rec = [
      mkReceta('r-1', 8, [
        { materiaPrimaId: 'mp-a', cantidad: 4 },
        { materiaPrimaId: 'mp-b', cantidad: 2 },
      ]),
    ]
    const mp = [mkMateria('mp-a', 'A'), mkMateria('mp-b', 'B')]

    const r = calcularIngredientesEvento(pp, ep, prod, rec, mp)

    expect(r.porProducto[0]!.ingredientes).toHaveLength(2)
    // mp-a: (4/8)*8 = 4
    expect(r.porProducto[0]!.ingredientes[0]!.requerido).toBeCloseTo(4, 10)
    // mp-b: (2/8)*8 = 2
    expect(r.porProducto[0]!.ingredientes[1]!.requerido).toBeCloseTo(2, 10)
  })

  // --- Consolidation (same ingredient across products) ---

  it('consolida ingredientes repetidos entre productos — suma totales', () => {
    // Two products, both use mp-1. Recipe yields 1 unit each, both use 3 of mp-1.
    // Product A: 5 units → 15; Product B: 3 units → 9. Total: 24.
    const pp = [mkPP('pp-1', 'ep-1', 5), mkPP('pp-2', 'ep-2', 3)]
    const ep = [
      mkEP('ep-1', 'e-1', 'prod-a'),
      mkEP('ep-2', 'e-1', 'prod-b'),
    ]
    const prod = [
      mkProducto('prod-a', 'r-1', 'Producto A'),
      mkProducto('prod-b', 'r-2', 'Producto B'),
    ]
    const rec = [
      mkReceta('r-1', 1, [{ materiaPrimaId: 'mp-1', cantidad: 3 }]),
      mkReceta('r-2', 1, [{ materiaPrimaId: 'mp-1', cantidad: 3 }]),
    ]
    const mp = [mkMateria('mp-1', 'Harina')]

    const r = calcularIngredientesEvento(pp, ep, prod, rec, mp)

    expect(r.porProducto).toHaveLength(2)
    // Consolidated: only one row for mp-1, required = 15 + 9 = 24
    expect(r.consolidado).toHaveLength(1)
    expect(r.consolidado[0]!.materiaPrimaId).toBe('mp-1')
    expect(r.consolidado[0]!.requerido).toBeCloseTo(24, 10)
  })

  it('consolida correctamente cuando los productos usan diferentes ingredientes también', () => {
    const pp = [mkPP('pp-1', 'ep-1', 1), mkPP('pp-2', 'ep-2', 1)]
    const ep = [
      mkEP('ep-1', 'e-1', 'prod-a'),
      mkEP('ep-2', 'e-1', 'prod-b'),
    ]
    const prod = [
      mkProducto('prod-a', 'r-1', 'A'),
      mkProducto('prod-b', 'r-2', 'B'),
    ]
    const rec = [
      mkReceta('r-1', 1, [
        { materiaPrimaId: 'mp-shared', cantidad: 1 },
        { materiaPrimaId: 'mp-only-a', cantidad: 1 },
      ]),
      mkReceta('r-2', 1, [
        { materiaPrimaId: 'mp-shared', cantidad: 2 },
        { materiaPrimaId: 'mp-only-b', cantidad: 1 },
      ]),
    ]
    const mp = [
      mkMateria('mp-shared', 'Compartido'),
      mkMateria('mp-only-a', 'Solo A'),
      mkMateria('mp-only-b', 'Solo B'),
    ]

    const r = calcularIngredientesEvento(pp, ep, prod, rec, mp)

    // Consolidated: 3 rows (shared=3, only-a=1, only-b=1)
    expect(r.consolidado).toHaveLength(3)
    const shared = r.consolidado.find((c) => c.materiaPrimaId === 'mp-shared')
    expect(shared!.requerido).toBeCloseTo(3, 10) // 1 + 2
  })

  // --- Excluded products ---

  it('productos no incluidos no contribuyen', () => {
    const pp = [mkPP('pp-1', 'ep-1', 10)]
    const ep = [mkEP('ep-1', 'e-1', 'prod-1', false)] // incluido = false
    const prod = [mkProducto('prod-1', 'r-1')]
    const rec = [mkReceta('r-1', 1, [{ materiaPrimaId: 'mp-1', cantidad: 1 }])]
    const mp = [mkMateria('mp-1')]

    const r = calcularIngredientesEvento(pp, ep, prod, rec, mp)

    expect(r.porProducto).toEqual([])
    expect(r.consolidado).toEqual([])
  })

  it('mezcla de incluidos y excluidos — solo los incluidos contribuyen', () => {
    const pp = [mkPP('pp-1', 'ep-1', 10), mkPP('pp-2', 'ep-2', 5)]
    const ep = [
      mkEP('ep-1', 'e-1', 'prod-a', true),   // incluido
      mkEP('ep-2', 'e-1', 'prod-b', false),   // excluido
    ]
    const prod = [
      mkProducto('prod-a', 'r-1', 'A'),
      mkProducto('prod-b', 'r-2', 'B'),
    ]
    const rec = [
      mkReceta('r-1', 1, [{ materiaPrimaId: 'mp-1', cantidad: 2 }]),
      mkReceta('r-2', 1, [{ materiaPrimaId: 'mp-2', cantidad: 3 }]),
    ]
    const mp = [mkMateria('mp-1'), mkMateria('mp-2')]

    const r = calcularIngredientesEvento(pp, ep, prod, rec, mp)

    // Only ep-1 (incluido) contributes
    expect(r.porProducto).toHaveLength(1)
    expect(r.porProducto[0]!.eventoProductoId).toBe('ep-1')
    // Consolidated: only mp-1 appears
    expect(r.consolidado).toHaveLength(1)
    expect(r.consolidado[0]!.materiaPrimaId).toBe('mp-1')
  })

  // --- Stock gap ---

  it('faltante = max(requerido - disponible, 0) — cobertura parcial', () => {
    const pp = [mkPP('pp-1', 'ep-1', 10)]
    const ep = [mkEP('ep-1', 'e-1', 'prod-1')]
    const prod = [mkProducto('prod-1', 'r-1')]
    const rec = [mkReceta('r-1', 1, [{ materiaPrimaId: 'mp-1', cantidad: 5 }])]
    // required = (5/1) * 10 = 50, available = 30 → faltante = 20
    const mp = [mkMateria('mp-1', 'Harina', 30)]

    const r = calcularIngredientesEvento(pp, ep, prod, rec, mp)

    expect(r.consolidado[0]!.requerido).toBeCloseTo(50, 10)
    expect(r.consolidado[0]!.disponible).toBe(30)
    expect(r.consolidado[0]!.faltante).toBeCloseTo(20, 10)
  })

  it('faltante = 0 cuando el stock cubre el requerimiento', () => {
    const pp = [mkPP('pp-1', 'ep-1', 2)]
    const ep = [mkEP('ep-1', 'e-1', 'prod-1')]
    const prod = [mkProducto('prod-1', 'r-1')]
    const rec = [mkReceta('r-1', 1, [{ materiaPrimaId: 'mp-1', cantidad: 1 }])]
    // required = 2, available = 10 → faltante = 0
    const mp = [mkMateria('mp-1', 'Harina', 10)]

    const r = calcularIngredientesEvento(pp, ep, prod, rec, mp)

    expect(r.consolidado[0]!.faltante).toBe(0)
    expect(r.consolidado[0]!.disponible).toBe(10)
  })

  it('stock nulo (undefined) se trata como disponible = 0', () => {
    const pp = [mkPP('pp-1', 'ep-1', 5)]
    const ep = [mkEP('ep-1', 'e-1', 'prod-1')]
    const prod = [mkProducto('prod-1', 'r-1')]
    const rec = [mkReceta('r-1', 1, [{ materiaPrimaId: 'mp-1', cantidad: 2 }])]
    // required = 10, available = undefined → treated as 0 → faltante = 10
    const mp = [mkMateria('mp-1', 'Harina', undefined)]

    const r = calcularIngredientesEvento(pp, ep, prod, rec, mp)

    expect(r.consolidado[0]!.disponible).toBe(0)
    expect(r.consolidado[0]!.faltante).toBeCloseTo(10, 10)
  })

  it('stock cero explícito produce faltante = requerido', () => {
    const pp = [mkPP('pp-1', 'ep-1', 3)]
    const ep = [mkEP('ep-1', 'e-1', 'prod-1')]
    const prod = [mkProducto('prod-1', 'r-1')]
    const rec = [mkReceta('r-1', 1, [{ materiaPrimaId: 'mp-1', cantidad: 4 }])]
    const mp = [mkMateria('mp-1', 'Harina', 0)]

    const r = calcularIngredientesEvento(pp, ep, prod, rec, mp)

    // required = (4/1)*3 = 12, disponible = 0 → faltante = 12
    expect(r.consolidado[0]!.requerido).toBeCloseTo(12, 10)
    expect(r.consolidado[0]!.faltante).toBeCloseTo(12, 10)
  })

  // --- Warnings ---

  it('evento_producto faltante emite PRODUCTO_FALTANTE', () => {
    const pp = [mkPP('pp-1', 'ep-missing', 10)]
    // no evento_productos at all
    const r = calcularIngredientesEvento(pp, [], [], [], [])
    expect(r.advertencias).toEqual([{ codigo: 'PRODUCTO_FALTANTE', referenciaId: 'ep-missing' }])
    expect(r.porProducto).toEqual([])
  })

  it('producto faltante (producto_id no existe) emite PRODUCTO_FALTANTE', () => {
    const pp = [mkPP('pp-1', 'ep-1', 10)]
    const ep = [mkEP('ep-1', 'e-1', 'prod-missing')]
    const r = calcularIngredientesEvento(pp, ep, [], [], [])
    expect(r.advertencias).toEqual([{ codigo: 'PRODUCTO_FALTANTE', referenciaId: 'prod-missing' }])
  })

  it('receta faltante emite RECETA_FALTANTE', () => {
    const pp = [mkPP('pp-1', 'ep-1', 10)]
    const ep = [mkEP('ep-1', 'e-1', 'prod-1')]
    const prod = [mkProducto('prod-1', 'r-missing')]
    const r = calcularIngredientesEvento(pp, ep, prod, [], [])
    expect(r.advertencias).toEqual([{ codigo: 'RECETA_FALTANTE', referenciaId: 'prod-1' }])
  })

  it('rendimiento no positivo emite RENDIMIENTO_INVALIDO', () => {
    const pp = [mkPP('pp-1', 'ep-1', 10)]
    const ep = [mkEP('ep-1', 'e-1', 'prod-1')]
    const prod = [mkProducto('prod-1', 'r-1')]
    const rec = [mkReceta('r-1', 0, [{ materiaPrimaId: 'mp-1', cantidad: 2 }])]
    const mp = [mkMateria('mp-1')]

    const r = calcularIngredientesEvento(pp, ep, prod, rec, mp)
    expect(r.advertencias).toEqual([{ codigo: 'RENDIMIENTO_INVALIDO', referenciaId: 'prod-1' }])
    expect(r.porProducto).toEqual([]) // no valid rows
  })

  it('rendimiento negativo también emite RENDIMIENTO_INVALIDO', () => {
    const pp = [mkPP('pp-1', 'ep-1', 10)]
    const ep = [mkEP('ep-1', 'e-1', 'prod-1')]
    const prod = [mkProducto('prod-1', 'r-1')]
    const rec = [mkReceta('r-1', -1, [{ materiaPrimaId: 'mp-1', cantidad: 2 }])]
    const mp = [mkMateria('mp-1')]

    const r = calcularIngredientesEvento(pp, ep, prod, rec, mp)
    expect(r.advertencias).toContainEqual({ codigo: 'RENDIMIENTO_INVALIDO', referenciaId: 'prod-1' })
  })

  it('materia_prima faltante emite MATERIA_PRIMA_FALTANTE', () => {
    const pp = [mkPP('pp-1', 'ep-1', 10)]
    const ep = [mkEP('ep-1', 'e-1', 'prod-1')]
    const prod = [mkProducto('prod-1', 'r-1')]
    const rec = [mkReceta('r-1', 4, [{ materiaPrimaId: 'mp-orphan', cantidad: 2 }])]
    // materia_prima not in the array
    const r = calcularIngredientesEvento(pp, ep, prod, rec, [])
    expect(r.advertencias).toEqual([{ codigo: 'MATERIA_PRIMA_FALTANTE', referenciaId: 'mp-orphan' }])
    // Per-product: recipe has 1 ingredient but it's missing → perProducto has empty ingredientes
    // But the product itself still appears in porProducto with the recipe linked
    expect(r.porProducto).toHaveLength(1)
    expect(r.porProducto[0]!.ingredientes).toEqual([])
  })

  it('múltiples advertencias se acumulan', () => {
    // pp-1: missing EP, pp-2: missing receta
    const pp = [
      mkPP('pp-1', 'ep-missing', 10),
      mkPP('pp-2', 'ep-2', 5),
    ]
    const ep = [mkEP('ep-2', 'e-1', 'prod-1')]
    const prod = [mkProducto('prod-1', 'r-missing')]

    const r = calcularIngredientesEvento(pp, ep, prod, [], [])
    expect(r.advertencias).toHaveLength(2)
    expect(r.advertencias).toContainEqual({ codigo: 'PRODUCTO_FALTANTE', referenciaId: 'ep-missing' })
    expect(r.advertencias).toContainEqual({ codigo: 'RECETA_FALTANTE', referenciaId: 'prod-1' })
  })

  // --- Mixed scenario (valid + invalid rows in a single call) ---

  it('escenario mixto — válidos contribuyen, inválidos generan advertencias', () => {
    // 3 rows: one valid, one excluded, one with missing receta
    const pp = [
      mkPP('pp-ok', 'ep-ok', 10),
      mkPP('pp-excl', 'ep-excl', 5),
      mkPP('pp-bad', 'ep-bad', 3),
    ]
    const ep = [
      mkEP('ep-ok', 'e-1', 'prod-ok', true),
      mkEP('ep-excl', 'e-1', 'prod-excl', false),
      mkEP('ep-bad', 'e-1', 'prod-bad', true),
    ]
    const prod = [
      mkProducto('prod-ok', 'r-1', 'OK'),
      mkProducto('prod-excl', 'r-2', 'Excluido'),
      mkProducto('prod-bad', 'r-missing', 'Mal'),
    ]
    const rec = [mkReceta('r-1', 2, [{ materiaPrimaId: 'mp-1', cantidad: 3 }])]
    const mp = [mkMateria('mp-1', 'Harina')]

    const r = calcularIngredientesEvento(pp, ep, prod, rec, mp)

    // Only the valid row contributes
    expect(r.porProducto).toHaveLength(1)
    expect(r.porProducto[0]!.eventoProductoId).toBe('ep-ok')

    // One warning for the bad row
    expect(r.advertencias).toHaveLength(1)
    expect(r.advertencias[0]!.codigo).toBe('RECETA_FALTANTE')

    // Consolidated still works for the valid row
    expect(r.consolidado).toHaveLength(1)
    // required = (3/2) * 10 = 15
    expect(r.consolidado[0]!.requerido).toBeCloseTo(15, 10)
  })

  // --- Consolidado sort order is stable (Map insertion order) ---

  it('consolidado mantiene orden de inserción por primer producto', () => {
    // Two products with different ingredients — order should match
    // the order ingredients first appear in.
    const pp = [mkPP('pp-1', 'ep-1', 1), mkPP('pp-2', 'ep-2', 1)]
    const ep = [
      mkEP('ep-1', 'e-1', 'prod-a'),
      mkEP('ep-2', 'e-1', 'prod-b'),
    ]
    const prod = [
      mkProducto('prod-a', 'r-1', 'A'),
      mkProducto('prod-b', 'r-1', 'B'),  // same recipe
    ]
    const rec = [
      mkReceta('r-1', 1, [
        { materiaPrimaId: 'mp-z', cantidad: 1 },
        { materiaPrimaId: 'mp-a', cantidad: 1 },
      ]),
    ]
    const mp = [mkMateria('mp-z'), mkMateria('mp-a')]

    const r = calcularIngredientesEvento(pp, ep, prod, rec, mp)

    // Both rows use the same two ingredients — consolidated should have 2 rows
    expect(r.consolidado).toHaveLength(2)
    // Map insertion order: mp-z first (from first product), then mp-a
    expect(r.consolidado[0]!.materiaPrimaId).toBe('mp-z')
    expect(r.consolidado[1]!.materiaPrimaId).toBe('mp-a')
  })

  // --- Non-finite result guard ---

  it('no produce NaN cuando todos los datos son válidos', () => {
    const pp = [mkPP('pp-1', 'ep-1', 5)]
    const ep = [mkEP('ep-1', 'e-1', 'prod-1')]
    const prod = [mkProducto('prod-1', 'r-1')]
    const rec = [mkReceta('r-1', 3, [{ materiaPrimaId: 'mp-1', cantidad: 7 }])]
    const mp = [mkMateria('mp-1', 'Harina', 10)]

    const r = calcularIngredientesEvento(pp, ep, prod, rec, mp)

    expect(Number.isFinite(r.consolidado[0]!.requerido)).toBe(true)
    expect(Number.isFinite(r.consolidado[0]!.faltante)).toBe(true)
  })

  // --- Large N no drift ---

  it('maneja 20+ filas de producción sin drift acumulativo', () => {
    const pp = Array.from({ length: 25 }, (_, i) => mkPP(`pp-${i}`, `ep-${i}`, 1))
    const ep = Array.from({ length: 25 }, (_, i) => mkEP(`ep-${i}`, 'e-1', `prod-${i}`))
    const prod = Array.from({ length: 25 }, (_, i) => mkProducto(`prod-${i}`, 'r-1'))
    const rec = [mkReceta('r-1', 1, [{ materiaPrimaId: 'mp-1', cantidad: 10 }])]
    const mp = [mkMateria('mp-1')]

    const r = calcularIngredientesEvento(pp, ep, prod, rec, mp)

    // 25 products, each contributing 10 of mp-1 → total required = 250
    expect(r.porProducto).toHaveLength(25)
    expect(r.consolidado).toHaveLength(1)
    expect(r.consolidado[0]!.requerido).toBeCloseTo(250, 10)
  })
})

// ---------------------------------------------------------------------------
// Reactive composable tests
// ---------------------------------------------------------------------------

let aplicacion: App

beforeEach(() => {
  setActivePinia(createPinia())
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide('supabase', createClient('http://x', 'anon') as SupabaseClient<Database>)
})

function conContexto<T>(callback: () => T): T {
  return aplicacion.runWithContext(callback)
}

describe('useIngredientesEvento', () => {
  it('returns null when eventoId is null', () => {
    conContexto(() => {
      const resultado = useIngredientesEvento(null)
      expect(resultado.value).toBeNull()
    })
  })

  it('returns null when eventoId is undefined', () => {
    conContexto(() => {
      const eventoId = undefined as string | null | undefined
      const resultado = useIngredientesEvento(eventoId ?? null)
      expect(resultado.value).toBeNull()
    })
  })

  it('returns null when eventoId is an empty string', () => {
    conContexto(() => {
      const resultado = useIngredientesEvento('')
      expect(resultado.value).toBeNull()
    })
  })

  it('reads store data and produces ingredient derivation', () => {
    conContexto(() => {
      const ppStore = useProductoProduccionStore()
      const epStore = useEventoProductosStore()
      const prodStore = useProductosStore()
      const recStore = useRecipesStore()
      const ingStore = useIngredientsStore()

      // Setup: producto prod-1 → receta r-1 (4 units yield, 2 kg mp-1)
      // → (2/4)*30 = 15 kg required
      recStore.recetas.push(mkReceta('r-1', 4, [{ materiaPrimaId: 'mp-1', cantidad: 2 }]))
      ingStore.materiasPrimas.push(mkMateria('mp-1', 'Harina', 10))
      prodStore.productos.push(mkProducto('prod-1', 'r-1', 'Pan'))
      epStore.productosPorEvento.set('e-1', [
        mkEP('ep-1', 'e-1', 'prod-1', true),
      ])
      ppStore.produccionPorEvento.set('e-1', [
        mkPP('pp-1', 'ep-1', 30),
      ])

      const resultado = useIngredientesEvento('e-1')
      const val = resultado.value!

      expect(val.porProducto).toHaveLength(1)
      expect(val.porProducto[0]!.eventoProductoId).toBe('ep-1')
      expect(val.porProducto[0]!.productoNombre).toBe('Pan')
      expect(val.porProducto[0]!.ingredientes[0]!.requerido).toBeCloseTo(15, 10)
      expect(val.consolidado).toHaveLength(1)
      expect(val.consolidado[0]!.materiaPrimaId).toBe('mp-1')
      expect(val.consolidado[0]!.requerido).toBeCloseTo(15, 10)
      expect(val.consolidado[0]!.disponible).toBe(10)
      expect(val.consolidado[0]!.faltante).toBeCloseTo(5, 10)
      expect(val.advertencias).toEqual([])
    })
  })

  it('re-derives when production units change — store reactivity', () => {
    conContexto(() => {
      const ppStore = useProductoProduccionStore()
      const epStore = useEventoProductosStore()
      const prodStore = useProductosStore()
      const recStore = useRecipesStore()
      const ingStore = useIngredientsStore()

      recStore.recetas.push(mkReceta('r-1', 1, [{ materiaPrimaId: 'mp-1', cantidad: 2 }]))
      ingStore.materiasPrimas.push(mkMateria('mp-1', 'Harina', 0))
      prodStore.productos.push(mkProducto('prod-1', 'r-1', 'Pan'))
      epStore.productosPorEvento.set('e-1', [mkEP('ep-1', 'e-1', 'prod-1', true)])
      ppStore.produccionPorEvento.set('e-1', [mkPP('pp-1', 'ep-1', 10)])

      const resultado = useIngredientesEvento('e-1')

      // Initial: 10 units × 2 kg/unit = 20 kg required
      expect(resultado.value!.consolidado[0]!.requerido).toBeCloseTo(20, 10)

      // Mutate: change units via Map set (triggers Vue reactivity)
      ppStore.produccionPorEvento.set('e-1', [mkPP('pp-1', 'ep-1', 50)])

      // After mutation: 50 units × 2 kg/unit = 100 kg required
      expect(resultado.value!.consolidado[0]!.requerido).toBeCloseTo(100, 10)
    })
  })

  it('re-derives when an ingredient stock changes', () => {
    conContexto(() => {
      const ppStore = useProductoProduccionStore()
      const epStore = useEventoProductosStore()
      const prodStore = useProductosStore()
      const recStore = useRecipesStore()
      const ingStore = useIngredientsStore()

      recStore.recetas.push(mkReceta('r-1', 1, [{ materiaPrimaId: 'mp-1', cantidad: 1 }]))
      ingStore.materiasPrimas.push(mkMateria('mp-1', 'Harina', 5))
      prodStore.productos.push(mkProducto('prod-1', 'r-1', 'Pan'))
      epStore.productosPorEvento.set('e-1', [mkEP('ep-1', 'e-1', 'prod-1', true)])
      ppStore.produccionPorEvento.set('e-1', [mkPP('pp-1', 'ep-1', 10)])

      const resultado = useIngredientesEvento('e-1')

      // Initial: required=10, available=5, faltante=5
      expect(resultado.value!.consolidado[0]!.disponible).toBe(5)
      expect(resultado.value!.consolidado[0]!.faltante).toBeCloseTo(5, 10)

      // Mutate: update stock on the ref array
      ingStore.materiasPrimas[0]!.cantidad_disponible = 20

      // After mutation: required=10, available=20, faltante=0
      expect(resultado.value!.consolidado[0]!.disponible).toBe(20)
      expect(resultado.value!.consolidado[0]!.faltante).toBe(0)
    })
  })

  it('returns empty arrays when event has no data in any store', () => {
    conContexto(() => {
      const resultado = useIngredientesEvento('e-empty')
      const val = resultado.value!

      expect(val.porProducto).toEqual([])
      expect(val.consolidado).toEqual([])
      expect(val.advertencias).toEqual([])
    })
  })
})

// REQ-CATALOG-17..20: cost calculator pure function.
// All tests target the pure function exported from useCalculoReceta.ts;
// the reactive composable is exercised in PR3 once stores exist.
import { describe, it, expect } from 'vitest'
import { calcularCostoReceta } from './useCalculoReceta'
import type { IngredienteReceta, MateriaPrima } from '@/types'

const mkMateria = (id: string, nombre: string, unidad: MateriaPrima['unidad'], costo: number): MateriaPrima => ({
  id,
  nombre,
  unidad,
  costo_por_unidad: costo,
  notas: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

const mkLinea = (id: string, materiaPrimaId: string, cantidad: number, materiaPrima: MateriaPrima | null = null) => ({
  ingrediente: {
    id,
    receta_id: 'receta-1',
    materia_prima_id: materiaPrimaId,
    cantidad,
    created_at: '2026-01-01T00:00:00Z',
  } satisfies IngredienteReceta,
  materiaPrima,
})

describe('calcularCostoReceta', () => {
  it('returns correct costoTotal and costoPorUnidad for the spec example (REQ-CATALOG-17)', () => {
    const harina = mkMateria('mp-1', 'Harina', 'kg', 2.5)
    const huevo = mkMateria('mp-2', 'Huevo', 'unidad', 0.3)
    const lineas = [
      mkLinea('ri-1', 'mp-1', 2, harina),
      mkLinea('ri-2', 'mp-2', 3, huevo),
    ]

    const result = calcularCostoReceta(lineas, 4)

    expect(result.costoTotal).toBe(5.9)
    expect(result.costoPorUnidad).toBe(1.48)
    expect(result.ingredientes).toHaveLength(2)
    expect(result.ingredientes[0]?.subtotal).toBe(5)
    expect(result.ingredientes[1]?.subtotal).toBeCloseTo(0.9, 10)
  })

  it('returns zeroed result for empty ingredients (REQ-CATALOG-18)', () => {
    const result = calcularCostoReceta([], 10)

    expect(result.costoTotal).toBe(0)
    expect(result.costoPorUnidad).toBe(0)
    expect(result.ingredientes).toEqual([])
  })

  it('returns costoPorUnidad 0 when rendimiento is 0 (REQ-CATALOG-19)', () => {
    const harina = mkMateria('mp-1', 'Harina', 'kg', 2)
    const lineas = [mkLinea('ri-1', 'mp-1', 5, harina)]

    const result = calcularCostoReceta(lineas, 0)

    expect(result.costoTotal).toBe(10)
    expect(result.costoPorUnidad).toBe(0)
  })

  it('marks line with MATERIA_PRIMA_FALTANTE and subtotal 0 when materia prima is null', () => {
    const harina = mkMateria('mp-1', 'Harina', 'kg', 2.5)
    const lineas = [
      mkLinea('ri-1', 'mp-1', 2, harina),
      mkLinea('ri-2', 'mp-orphan', 3, null),
    ]

    const result = calcularCostoReceta(lineas, 4)

    expect(result.costoTotal).toBe(5)
    expect(result.ingredientes[0]?.subtotal).toBe(5)
    expect(result.ingredientes[0]?.advertencia).toBeUndefined()
    expect(result.ingredientes[1]?.materiaPrima).toBeNull()
    expect(result.ingredientes[1]?.subtotal).toBe(0)
    expect(result.ingredientes[1]?.advertencia).toBe('MATERIA_PRIMA_FALTANTE')
  })

  it('rounds 0.1+0.2 noise to 0.3 at the total (REQ-CATALOG-20)', () => {
    const mp = mkMateria('mp-1', 'X', 'kg', 0.1)
    const lineas = [mkLinea('ri-1', 'mp-1', 2, mp), mkLinea('ri-2', 'mp-1', 2, mp)]

    const result = calcularCostoReceta(lineas, 1)

    expect(result.costoTotal).toBe(0.4)
  })

  it('handles 20+ ingredients without cumulative float drift', () => {
    const mp = mkMateria('mp-1', 'X', 'kg', 0.333)
    const lineas = Array.from({ length: 25 }, (_, i) =>
      mkLinea(`ri-${i}`, 'mp-1', 1, mp),
    )

    const result = calcularCostoReceta(lineas, 1)

    expect(result.ingredientes).toHaveLength(25)
    expect(result.costoTotal).toBe(8.33)
  })

  it('preserves per-line subtotal at full float precision (REQ-CATALOG-20)', () => {
    const mp = mkMateria('mp-1', 'X', 'kg', 0.3333)
    const lineas = [mkLinea('ri-1', 'mp-1', 0.3333, mp)]

    const result = calcularCostoReceta(lineas, 1)

    expect(result.ingredientes[0]?.subtotal).toBeCloseTo(0.11108889, 7)
    expect(result.costoTotal).toBe(0.11)
  })
})

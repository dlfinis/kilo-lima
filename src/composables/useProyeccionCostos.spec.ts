// REQ-EVENTS-20, REQ-EVENTS-23, REQ-EVENTS-24: cost projection pure
// function. Reuses catalog's `calcularCostoReceta` verbatim so events
// gets catalog cost-algorithm updates for free. 8 edge-case scenarios
// per design §5: empty, gastos only, plan only, RECETA_FALTANTE,
// MATERIA_PRIMA_FALTANTE propagation, unidades=0, float noise, large N.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import type { Evento, GastoFijo, MateriaPrima, PlanProduccion, Receta } from '@/types'
import { calcularProyeccion } from './useProyeccionCostos'

const mkEvento = (id = 'e-1'): Evento => ({
  id,
  nombre: 'Feria',
  fecha: '2026-07-15',
  ubicacion: null,
  estado: 'planificacion',
  notas: null,
  created_at: '2026-06-18T00:00:00Z',
  updated_at: '2026-06-18T00:00:00Z',
})

const mkMateria = (id: string, costo: number): MateriaPrima => ({
  id,
  nombre: id,
  unidad: 'kg',
  costo_por_unidad: costo,
  notas: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

const mkReceta = (id: string, rendimiento: number, ingredientes: { materiaPrimaId: string; cantidad: number }[]): Receta => ({
  id,
  nombre: id,
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

const mkGasto = (id: string, monto: number, overrides: Partial<GastoFijo> = {}): GastoFijo => ({
  id,
  evento_id: 'e-1',
  categoria: 'renta',
  monto,
  descripcion: null,
  created_at: '2026-06-18T00:00:00Z',
  ...overrides,
})

const mkPlan = (
  id: string,
  recetaId: string,
  unidades: number,
  overrides: Partial<PlanProduccion> = {},
): PlanProduccion => ({
  id,
  evento_id: 'e-1',
  receta_id: recetaId,
  unidades_a_producir: unidades,
  created_at: '2026-06-18T00:00:00Z',
  ...overrides,
})

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('calcularProyeccion', () => {
  it('empty plan + no gastos returns zeros (REQ-EVENTS-23)', () => {
    const resultado = calcularProyeccion(mkEvento(), [], [], [], [])

    expect(resultado.costosFijos).toBe(0)
    expect(resultado.costosVariables).toBe(0)
    expect(resultado.costoTotal).toBe(0)
    expect(resultado.lineas).toEqual([])
    expect(resultado.desgloseFijos).toEqual([])
    expect(resultado.desgloseVariables).toEqual([])
  })

  it('gastos only — sum fixed costs and no variable lines (REQ-EVENTS-20)', () => {
    const gastos = [mkGasto('g-1', 500), mkGasto('g-2', 300)]
    const resultado = calcularProyeccion(mkEvento(), gastos, [], [], [])

    expect(resultado.costosFijos).toBe(800)
    expect(resultado.costosVariables).toBe(0)
    expect(resultado.costoTotal).toBe(800)
    expect(resultado.lineas).toEqual([])
    expect(resultado.desgloseFijos).toHaveLength(2)
    expect(resultado.desgloseVariables).toEqual([])
  })

  it('plan only — compute variable line from receta with costoPorUnidad (REQ-EVENTS-20)', () => {
    const harina = mkMateria('mp-1', 2.5)
    const receta = mkReceta('r-1', 4, [{ materiaPrimaId: 'mp-1', cantidad: 2 }])
    const plan = [mkPlan('pp-1', 'r-1', 10)]
    const resultado = calcularProyeccion(mkEvento(), [], plan, [receta], [harina])

    // 2 kg × $2.50 = $5 per receta batch of 4 → $1.25/unit × 10 = $12.50
    expect(resultado.costosFijos).toBe(0)
    expect(resultado.costosVariables).toBe(12.5)
    expect(resultado.costoTotal).toBe(12.5)
    expect(resultado.lineas).toHaveLength(1)
    expect(resultado.lineas[0]?.recetaId).toBe('r-1')
    expect(resultado.lineas[0]?.unidades).toBe(10)
    expect(resultado.lineas[0]?.costoPorUnidad).toBeCloseTo(1.25, 10)
    expect(resultado.lineas[0]?.costoLinea).toBe(12.5)
    expect(resultado.lineas[0]?.advertencia).toBeUndefined()
  })

  it('plan row with missing receta flags RECETA_FALTANTE with costoLinea 0 (REQ-EVENTS-23)', () => {
    const plan = [mkPlan('pp-1', 'r-missing', 10)]
    const resultado = calcularProyeccion(mkEvento(), [], plan, [], [])

    expect(resultado.costosVariables).toBe(0)
    expect(resultado.lineas).toHaveLength(1)
    expect(resultado.lineas[0]?.costoLinea).toBe(0)
    expect(resultado.lineas[0]?.advertencia).toBe('RECETA_FALTANTE')
    expect(resultado.costoTotal).toBe(0)
  })

  it('plan row propagates MATERIA_PRIMA_FALTANTE from catalog (REQ-EVENTS-24)', () => {
    const receta = mkReceta('r-1', 4, [{ materiaPrimaId: 'mp-orphan', cantidad: 2 }])
    const plan = [mkPlan('pp-1', 'r-1', 10)]
    const resultado = calcularProyeccion(mkEvento(), [], plan, [receta], [])

    expect(resultado.lineas).toHaveLength(1)
    expect(resultado.lineas[0]?.costoLinea).toBe(0)
    expect(resultado.lineas[0]?.advertencia).toBe('MATERIA_PRIMA_FALTANTE')
  })

  it('unidades_a_producir = 0 produces 0 line cost without NaN (REQ-EVENTS-24 defensive)', () => {
    const harina = mkMateria('mp-1', 2.5)
    const receta = mkReceta('r-1', 4, [{ materiaPrimaId: 'mp-1', cantidad: 1 }])
    const plan = [mkPlan('pp-1', 'r-1', 0)]
    const resultado = calcularProyeccion(mkEvento(), [], plan, [receta], [harina])

    expect(resultado.costosVariables).toBe(0)
    expect(resultado.lineas[0]?.costoLinea).toBe(0)
    expect(Number.isFinite(resultado.costoTotal)).toBe(true)
  })

  it('rounds 0.1 + 0.2 float noise at the totals (REQ-EVENTS-20)', () => {
    const gastos = [mkGasto('g-1', 0.1), mkGasto('g-2', 0.2)]
    const resultado = calcularProyeccion(mkEvento(), gastos, [], [], [])

    expect(resultado.costosFijos).toBe(0.3)
    expect(resultado.costoTotal).toBe(0.3)
  })

  it('handles large N (20+ rows) without cumulative float drift', () => {
    const gastos = Array.from({ length: 25 }, (_, i) => mkGasto(`g-${i}`, 0.333))
    const resultado = calcularProyeccion(mkEvento(), gastos, [], [], [])

    expect(resultado.desgloseFijos).toHaveLength(25)
    // 25 × 0.333 = 8.325 → rounds to 8.33
    expect(resultado.costosFijos).toBe(8.33)
  })

  it('mixed scenario — gastos + plan rows compute the full breakdown (REQ-EVENTS-20)', () => {
    const harina = mkMateria('mp-1', 2)
    const azucar = mkMateria('mp-2', 1.5)
    const receta1 = mkReceta('r-1', 4, [
      { materiaPrimaId: 'mp-1', cantidad: 2 },
      { materiaPrimaId: 'mp-2', cantidad: 1 },
    ])
    const gastos = [mkGasto('g-1', 100), mkGasto('g-2', 50)]
    const plan = [mkPlan('pp-1', 'r-1', 8)]
    const resultado = calcularProyeccion(mkEvento(), gastos, plan, [receta1], [harina, azucar])

    // receta1: (2×2 + 1×1.5) = 5.5 over 4 unidades → 1.375/unit × 8 = 11
    expect(resultado.costosFijos).toBe(150)
    expect(resultado.costosVariables).toBe(11)
    expect(resultado.costoTotal).toBe(161)
    expect(resultado.desgloseFijos).toHaveLength(2)
    expect(resultado.desgloseVariables).toHaveLength(1)
    expect(resultado.desgloseVariables[0]?.recetaNombre).toBe('r-1')
  })
})

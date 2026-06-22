// REQ-CON-1, REQ-CON-2, REQ-CON-3: pure contribution / break-even math.
//
// The spec is the source of truth for naming (design.md §"Naming
// reconciliation"):
//   calcularContribucionUnitaria(precio, costo)               = redondearCentavos(precio − costo)
//   calcularContribucionPorcentual(precio, costo)              = redondearCentavos((precio − costo) / precio)
//   calcularBreakEvenUnidades(gastosFijos, contribuciones[])    = Math.ceil(gastosFijos / promedioPonderado)
//   calcularPrecioMinimoBreakEven(costo, gastosFijos, u)       = redondearCentavos(costo + gastosFijos / max(1, u))
//   clasificarContribucion(contribucionPorcentaje)              = 'entrada' | 'margen' | 'premium'
//
// `contribuciones` for break-even is `Array<{ contribucionUnidad: number, unidades: number }>`
// (weighted average per the brief — high-volume products count more).
//
// Single-rounding policy (REQ-PRICING-7 / REQ-CATALOG-20): only the
// `redondearCentavos` at function exit. No intermediate rounding, no
// `toFixed()` strings.
//
// Thresholds for `clasificarContribucion` per PR-1 brief:
//   entrada: <= 0.30   (low margin, high volume)
//   margen:  0.30..0.60
//   premium: > 0.60    (high margin, low volume)
import { describe, expect, it } from 'vitest'

import { redondearCentavos } from '@/utils/moneda'
import {
  calcularBreakEvenUnidades,
  calcularContribucionPorcentual,
  calcularContribucionUnitaria,
  calcularPrecioMinimoBreakEven,
  clasificarContribucion,
} from './contribucion'

describe('calcularContribucionUnitaria (REQ-CON-1)', () => {
  it('computes the simple positive case precio=8.33 − costo=5.00 → 3.33', () => {
    expect(calcularContribucionUnitaria(8.33, 5)).toBe(3.33)
  })

  it('returns a negative number when precio < costo (selling at loss)', () => {
    expect(calcularContribucionUnitaria(4, 5)).toBe(-1)
  })

  it('returns cero when precio === costo (break-even per unit)', () => {
    expect(calcularContribucionUnitaria(5, 5)).toBe(0)
  })

  it('handles cero costo gracefully — contribution equals full price', () => {
    expect(calcularContribucionUnitaria(8.33, 0)).toBe(8.33)
  })

  it('survives 0.1 + 0.2 float drift with single rounding at the end', () => {
    // precio = 0.3, costo = 0.1 — raw sum drifts to 0.19999999…
    const raw = 0.3 - 0.1
    expect(raw).not.toBe(0.2)
    expect(calcularContribucionUnitaria(0.3, 0.1)).toBe(0.2)
    // Sanity: matches the policy by rounding once.
    expect(redondearCentavos(raw)).toBe(0.2)
  })

  it('returns a 2-decimal-rounded number (no toFixed string drift)', () => {
    const result = calcularContribucionUnitaria(10.555, 5)
    expect(typeof result).toBe('number')
    expect(Number.isFinite(result)).toBe(true)
    expect(result).toBeCloseTo(5.56, 2)
  })
})

describe('calcularContribucionPorcentual (REQ-CON-1)', () => {
  it('computes 0.40 when precio=8.33 and costo=5.00 (40% margin)', () => {
    expect(calcularContribucionPorcentual(8.33, 5)).toBe(0.4)
  })

  it('returns a negative percentage when precio < costo', () => {
    expect(calcularContribucionPorcentual(4, 5)).toBe(-0.25)
  })

  it('returns 0 when precio === costo', () => {
    expect(calcularContribucionPorcentual(5, 5)).toBe(0)
  })

  it('returns 1 when costo = 0 and precio > 0 (100% margin — no COGS)', () => {
    expect(calcularContribucionPorcentual(5, 0)).toBe(1)
  })

  it('returns 0 when precio = 0 (no sale, no margin)', () => {
    expect(calcularContribucionPorcentual(0, 5)).toBe(0)
  })
})

describe('calcularBreakEvenUnidades (REQ-CON-2)', () => {
  it('returns 31 when gastosFijos=100 and promedio ponderado is 3.33', () => {
    const contribuciones = [{ contribucionUnidad: 3.33, unidades: 100 }]
    // 100 / 3.33 = 30.03 → ceil = 31
    expect(calcularBreakEvenUnidades(100, contribuciones)).toBe(31)
  })

  it('returns Infinity when the weighted-average contribution is 0', () => {
    const contribuciones = [
      { contribucionUnidad: 0, unidades: 10 },
      { contribucionUnidad: 2, unidades: 0 },
    ]
    expect(calcularBreakEvenUnidades(100, contribuciones)).toBe(Number.POSITIVE_INFINITY)
  })

  it('returns Infinity when the contribuciones array is empty', () => {
    expect(calcularBreakEvenUnidades(100, [])).toBe(Number.POSITIVE_INFINITY)
  })

  it('weights by unidades — high-volume product drives the average', () => {
    // Low-volume high-contribution + high-volume low-contribution.
    // (3.00 × 1u + 1.00 × 99u) / 100 = 1.02 per unit
    // break-even = ceil(102 / 1.02) = 100
    const contribuciones = [
      { contribucionUnidad: 3, unidades: 1 },
      { contribucionUnidad: 1, unidades: 99 },
    ]
    expect(calcularBreakEvenUnidades(102, contribuciones)).toBe(100)
  })

  it('rounds UP with Math.ceil — conservative (never undershoots)', () => {
    // 100 / 3.01 = 33.22... → ceil = 34 (NOT 33 — conservative)
    const contribuciones = [{ contribucionUnidad: 3.01, unidades: 50 }]
    expect(calcularBreakEvenUnidades(100, contribuciones)).toBe(34)
  })

  it('returns a finite number for an exact division', () => {
    const contribuciones = [{ contribucionUnidad: 2, unidades: 10 }]
    expect(calcularBreakEvenUnidades(100, contribuciones)).toBe(50)
  })
})

describe('calcularPrecioMinimoBreakEven (REQ-CON-3)', () => {
  it('returns 7.00 for costo=5, gastosFijos=100, unidadesEstimadas=50', () => {
    // (7 − 5) × 50 = 100 ✓
    expect(calcularPrecioMinimoBreakEven(5, 100, 50)).toBe(7)
  })

  it('returns the costo when gastosFijos is 0 (no fixed cost to recover)', () => {
    expect(calcularPrecioMinimoBreakEven(5, 0, 50)).toBe(5)
  })

  it('does NOT divide by zero when unidadesEstimadas = 0 (uses Math.max(1, u))', () => {
    // 5 + 100/1 = 105 — defensive fallback so the UI doesn't show Infinity
    expect(calcularPrecioMinimoBreakEven(5, 100, 0)).toBe(105)
  })

  it('scales the markup linearly with ventas proyectadas', () => {
    // costo=10, gastos=1000, u=10 → 10 + 100 = 110
    // costo=10, gastos=1000, u=100 → 10 + 10 = 20
    expect(calcularPrecioMinimoBreakEven(10, 1000, 10)).toBe(110)
    expect(calcularPrecioMinimoBreakEven(10, 1000, 100)).toBe(20)
  })
})

describe('clasificarContribucion (PR-1 brief)', () => {
  it('returns "entrada" when contribution percentage is <= 0.30', () => {
    expect(clasificarContribucion(0)).toBe('entrada')
    expect(clasificarContribucion(0.3)).toBe('entrada')
    expect(clasificarContribucion(0.25)).toBe('entrada')
    expect(clasificarContribucion(-0.1)).toBe('entrada')
  })

  it('returns "margen" when contribution percentage is in 0.30..0.60 exclusive of 0.60', () => {
    expect(clasificarContribucion(0.31)).toBe('margen')
    expect(clasificarContribucion(0.4)).toBe('margen')
    expect(clasificarContribucion(0.599)).toBe('margen')
  })

  it('returns "premium" when contribution percentage is > 0.60', () => {
    expect(clasificarContribucion(0.61)).toBe('premium')
    expect(clasificarContribucion(0.9)).toBe('premium')
    expect(clasificarContribucion(1)).toBe('premium')
  })
})

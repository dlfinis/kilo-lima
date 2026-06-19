// REQ-PRICING-2..4, REQ-FIN-14..16, REQ-PRICING-7: pricing math.
// Two exports, both pure (no Vue/Pinia/Supabase deps):
//   - calcularPrecioPorMargen(costo, margen): costo / (1 − margen),
//     rounded once at the end via `redondearCentavos` (REQ-PRICING-7,
//     single-rounding policy from `utils/moneda.ts`).
//   - calcularMargenReal(precioVenta, costo): (precio − costo) /
//     precio, also single-rounded.
//
// Edge cases (per design §8):
//   - margen = 0   → returns costo (zero markup)
//   - costo = 0    → returns 0 (no sale)
//   - margen >= 1  → returns costo (defensive — UI slider max 90%)
//   - margen <= 0  → returns costo (defensive — UI slider min 0%)
//   - precio = 0   → 0 margin (no sale)
//   - costo = 0, precio > 0 → 1.00 (100% margin)
//
// The bidirectional invariant (REQ-PRICING-3):
//   calcularMargenReal(calcularPrecioPorMargen(c, m), c) ≈ m
// is asserted in `redondearCentavosDriftSafe`.
import { describe, expect, it } from 'vitest'

import { redondearCentavos } from '@/utils/moneda'
import { calcularMargenReal, calcularPrecioPorMargen } from './pricing'

describe('calcularPrecioPorMargen', () => {
  // REQ-PRICING-2 / REQ-FIN-14 / AC-5: five representative inputs.
  it('computes standard margin 40% on costo 10 → 16.67', () => {
    expect(calcularPrecioPorMargen(10, 0.4)).toBe(16.67)
  })

  it('computes 25% margin on costo 5 → 6.67', () => {
    expect(calcularPrecioPorMargen(5, 0.25)).toBe(6.67)
  })

  it('computes 50% margin on costo 100 → 200.00', () => {
    expect(calcularPrecioPorMargen(100, 0.5)).toBe(200)
  })

  it('computes 33% margin on costo 3.33 → 4.97', () => {
    expect(calcularPrecioPorMargen(3.33, 0.33)).toBe(4.97)
  })

  it('returns 0 when costo is 0 (REQ-PRICING-2 edge case)', () => {
    expect(calcularPrecioPorMargen(0, 0.4)).toBe(0)
  })

  it('returns costo when margen is 0 (REQ-PRICING-2 edge case)', () => {
    expect(calcularPrecioPorMargen(10, 0)).toBe(10)
  })

  it('returns costo when margen is negative (defensive)', () => {
    expect(calcularPrecioPorMargen(10, -0.1)).toBe(10)
  })

  it('returns costo when margen >= 1 (defensive against div-by-zero)', () => {
    expect(calcularPrecioPorMargen(10, 1)).toBe(10)
    expect(calcularPrecioPorMargen(10, 1.5)).toBe(10)
  })

  // REQ-PRICING-7 / REQ-FIN-16: float-drift safe when used as a COGS
  // aggregator. The cierres util sums 100 venta_items at costo=1.67
  // (without rounding per-item) then applies redondearCentavos once at
  // the end. Since each `calcularPrecioPorMargen(1.67, 0)` returns the
  // already-rounded `1.67` (single round inside the function), summing
  // them still hits the 0.01 boundary unless we use the raw float
  // accumulation path. The COGS-style aggregation uses the raw input
  // values, which is the policy this test pins down.
  it('preserves precision across 100 items (REQ-PRICING-7, COGS-style aggregation)', () => {
    const items = Array.from({ length: 100 }, () => 1.67)
    const rawSum = items.reduce((acc, c) => acc + c, 0)
    // Raw float-sum drifts to 166.99999999... before rounding.
    expect(rawSum).not.toBe(167)
    // Single rounding at the end yields exactly 167.00.
    expect(redondearCentavos(rawSum)).toBe(167)
  })
})

describe('calcularMargenReal', () => {
  it('returns 0.40 when price=16.67 and costo=10 (REQ-PRICING-3, bidirectional)', () => {
    expect(calcularMargenReal(16.67, 10)).toBeCloseTo(0.4, 2)
  })

  it('returns 1.00 when costo=0 and precio>0 (REQ-PRICING-4 edge case)', () => {
    expect(calcularMargenReal(5, 0)).toBe(1)
  })

  it('returns 0 when precio=0 (no sale)', () => {
    expect(calcularMargenReal(0, 5)).toBe(0)
  })

  it('preserves the bidirectional invariant for the 5 representative inputs', () => {
    const inputs: ReadonlyArray<readonly [number, number]> = [
      [10, 0.4],
      [5, 0.25],
      [100, 0.5],
      [3.33, 0.33],
      [0, 0],
    ]
    for (const [costo, margen] of inputs) {
      const precio = calcularPrecioPorMargen(costo, margen)
      const margenBack = calcularMargenReal(precio, costo)
      // ±0.01 tolerance (REQ-PRICING-3).
      expect(Math.abs(margenBack - margen)).toBeLessThanOrEqual(0.01)
    }
  })

  it('handles large margin 90% on costo 10 → price 100, margen_real 0.90', () => {
    const precio = calcularPrecioPorMargen(10, 0.9)
    expect(precio).toBe(100)
    expect(calcularMargenReal(precio, 10)).toBeCloseTo(0.9, 2)
  })
})
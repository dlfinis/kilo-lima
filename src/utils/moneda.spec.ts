// REQ-CATALOG-20: redondearCentavos rounds to 2 decimals using
// Math.round((x + Number.EPSILON) * 100) / 100. Rounding policy avoids
// cumulative float-drift across many ingredient lines.
import { describe, it, expect } from 'vitest'
import { redondearCentavos } from './moneda'

describe('redondearCentavos', () => {
  it('rounds a clean 2-decimal value unchanged', () => {
    expect(redondearCentavos(1.23)).toBe(1.23)
  })

  it('rounds 0.1 + 0.2 to 0.3 (floating-point noise guard)', () => {
    expect(redondearCentavos(0.1 + 0.2)).toBe(0.3)
  })

  it('rounds 1.005 to 1.01 (EPSILON guard prevents under-round to 1.00)', () => {
    expect(redondearCentavos(1.005)).toBe(1.01)
  })

  it('rounds large numbers to 2 decimals', () => {
    expect(redondearCentavos(1234567.891)).toBe(1234567.89)
  })

  it('returns 0 for input 0', () => {
    expect(redondearCentavos(0)).toBe(0)
  })
})

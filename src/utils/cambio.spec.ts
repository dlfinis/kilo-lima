// REQ-POS-CAMBIO-2: pure utility for cash-back calculation.
// No I/O, no side effects — easy to triangulate. The store calls this
// for the EFECTIVO metodo_pago path; the dialog uses the same math for
// its live preview via the `cambio` computed.
import { describe, expect, it } from 'vitest'

import { calcularCambio } from './cambio'

describe('calcularCambio (REQ-POS-CAMBIO-2)', () => {
  it('returns the difference between montoRecibido and total (happy path)', () => {
    // Spec scenario: monto_recibido=51000, total=35000 → cambio=16000
    expect(calcularCambio(35000, 51000)).toBe(16000)
  })

  it('returns 0 when the customer pays exactly the total (REQ-POS-CAMBIO-3, EXACTO)', () => {
    expect(calcularCambio(35, 35)).toBe(0)
  })

  it('returns null when montoRecibido is null (non-efectivo methods)', () => {
    expect(calcularCambio(35, null)).toBeNull()
  })

  it('returns null when montoRecibido is undefined (defensive)', () => {
    expect(calcularCambio(35, undefined)).toBeNull()
  })

  it('returns a negative number when the payment is short (caller validates separately)', () => {
    // The function does NOT validate sufficiency — that's the store's
    // job (MONTO_INSUFICIENTE). The pure util returns the raw math so
    // the caller can decide what to do with it.
    expect(calcularCambio(50, 30)).toBe(-20)
  })

  it('rounds to 2 decimal places (REQ-POS-CAMBIO-2, decimal-stable)', () => {
    // 10.555 - 5.25 = 5.305 — banker's rounding would be 5.30, but
    // the design uses Math.round(+(x + EPSILON) * 100) / 100 which
    // gives 5.31. Verify the design's choice (no surprises for
    // operators).
    expect(calcularCambio(5.25, 10.555)).toBeCloseTo(5.31, 2)
  })

  it('handles 0 total correctly (empty-cart or promotional sale)', () => {
    expect(calcularCambio(0, 10)).toBe(10)
  })
})

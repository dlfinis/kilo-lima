// REQ-PRICING-2..4, REQ-FIN-14..16, REQ-PRICING-7, REQ-CON-1:
// pricing math pure helpers. Single rounding at the end via
// `redondearCentavos` from `utils/moneda.ts` — no intermediate
// rounding, per the project single-rounding policy (REQ-CATALOG-20).
//
// PR-1 task 1.6: re-export the contribution utils from `contribucion.ts`
// so `pricing.ts` stays the single entry point for "anything related
// to pricing math". Callers that need `calcularContribucionUnitaria`
// can import it from either module — they are aliases.
//
// Design §8 contract:
//   calcularPrecioPorMargen(costo, margen) = redondearCentavos(costo / (1 − margen))
//   calcularMargenReal(precioVenta, costo) = redondearCentavos((precio − costo) / precio)
//
// Edge cases handled defensively so the UI doesn't crash on bad input
// (the slider is bounded 0..90% so `margen >= 1` shouldn't happen, but
// a programmatic caller could still pass it).
import { redondearCentavos } from '@/utils/moneda'

// REQ-CON-1: re-export the contribution math so callers that already
// import from `pricing.ts` keep working without an extra import path.
export {
  calcularContribucionUnitaria,
  calcularContribucionPorcentual,
  calcularBreakEvenUnidades,
  calcularPrecioMinimoBreakEven,
  clasificarContribucion,
  type ContribucionConVolumen,
  type CategoriaContribucion,
} from '@/utils/contribucion'

/**
 * Compute selling price from cost and desired margin.
 *
 * @param costo  Product cost (≥ 0)
 * @param margen Desired margin 0..1 (e.g., 0.40 = 40%)
 * @returns      Selling price rounded to 2 decimal places
 */
export function calcularPrecioPorMargen(costo: number, margen: number): number {
  if (costo === 0) return 0
  // Defensive: non-positive margen or margen >= 1 would otherwise
  // either return costo unchanged (margen = 0) or divide by zero
  // (margen = 1). Treat anything outside (0, 1) as "no markup" so a
  // misconfigured caller doesn't crash the UI.
  if (margen <= 0 || margen >= 1) return redondearCentavos(costo)
  return redondearCentavos(costo / (1 - margen))
}

/**
 * Compute the actual margin achieved from a given price and cost.
 *
 * @param precioVenta Actual selling price
 * @param costo       Product cost
 * @returns           Actual margin 0..1
 */
export function calcularMargenReal(precioVenta: number, costo: number): number {
  if (precioVenta === 0) return 0
  if (costo === 0) return 1
  return redondearCentavos((precioVenta - costo) / precioVenta)
}
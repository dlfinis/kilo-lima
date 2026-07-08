// mobile-ux-redesign Phase 5: useInsights composable.
// Generates plain-language insight phrases from store data,
// adapting to 'during' vs 'post' event context.
//
// Each insight object: { phrase, color, icon, detailRoute }
// Color logic: green (positive), yellow (neutral), red (negative/alert).
//
// During-event insights:
//   1. "Ganaste S/ X hoy" or "Perdiste S/ X hoy"
//   2. "Tu margen fue X%" 
//   3. "Producto más vendido: [Nombre]"
//   4. "Mayor gasto: [Concepto]"
//
// Post-event insights:
//   1. "Ventas totales: S/ X"
//   2. "COGS: S/ X"
//   3. "Utilidad neta: S/ X"
//   4. "Producto más rentable: [Nombre]"
import { computed, type ComputedRef } from 'vue'

import type { Evento, GastoFijo, GastoImprevisto, Producto, VentaItem } from '@/types'
import { hoyISO } from '@/utils/fecha'
import { useEventoActivo } from './useEventoActivo'
import { useVentasStore } from '@/stores/ventas.store'
import { useGastosFijosStore } from '@/stores/gastosFijos.store'
import { useGastosImprevistosStore } from '@/stores/gastosImprevistos.store'
import { useProductosStore } from '@/stores/productos.store'

// ---- Inline PEN formatter ----
function fmtPEN(monto: number): string {
  return `S/ ${monto.toFixed(2)}`
}

export interface Insight {
  phrase: string
  color: 'green' | 'yellow' | 'red'
  icon: string
  detailRoute: string
}

// ---- Pure helper: determine color from a numeric value ----
export function insightColor(value: number, thresholds?: { negative: number; positive: number }): 'green' | 'yellow' | 'red' {
  const neg = thresholds?.negative ?? 0
  const pos = thresholds?.positive ?? 0
  if (value > pos) return 'green'
  if (value < neg) return 'red'
  return 'yellow'
}

// ---- Pure helper: find top-selling producto from items (by quantity) ----
export function topSellerProductoId(
  items: VentaItem[],
): { productoId: string | null; cantidad: number } {
  if (items.length === 0) return { productoId: null, cantidad: 0 }
  const counts = new Map<string, number>()
  for (const item of items) {
    counts.set(item.producto_id, (counts.get(item.producto_id) ?? 0) + item.cantidad)
  }
  let bestId: string | null = null
  let bestQty = 0
  for (const [pid, qty] of counts) {
    if (qty > bestQty) {
      bestQty = qty
      bestId = pid
    }
  }
  return { productoId: bestId, cantidad: bestQty }
}

// ---- Pure helper: find the highest gasto (by monto) ----
export function topGasto(
  fijos: GastoFijo[],
  imprevistos: GastoImprevisto[],
): { concepto: string; monto: number } | null {
  let best: { concepto: string; monto: number } | null = null
  for (const g of fijos) {
    if (!best || g.monto > best.monto) {
      best = { concepto: g.descripcion ?? g.categoria, monto: g.monto }
    }
  }
  for (const g of imprevistos) {
    if (!best || g.monto > best.monto) {
      best = { concepto: g.motivo, monto: g.monto }
    }
  }
  return best
}

// ---- Pure helper: top profitable producto from item aggregation ----
export function topProfitableProducto(
  items: VentaItem[],
): { productoId: string | null; utilidad: number } {
  if (items.length === 0) return { productoId: null, utilidad: 0 }
  const utilidadPorProducto = new Map<string, number>()
  for (const item of items) {
    const costo = item.costo_unitario ?? 0
    const utilidadItem = (item.precio_unitario - costo) * item.cantidad
    utilidadPorProducto.set(
      item.producto_id,
      (utilidadPorProducto.get(item.producto_id) ?? 0) + utilidadItem,
    )
  }
  let bestId: string | null = null
  let bestUtilidad = 0
  for (const [pid, util] of utilidadPorProducto) {
    if (util > bestUtilidad) {
      bestUtilidad = util
      bestId = pid
    }
  }
  return { productoId: bestId, utilidad: bestUtilidad }
}

export function useInsights(): { insights: ComputedRef<Insight[]> } {
  const { activeEvent } = useEventoActivo()
  const ventasStore = useVentasStore()
  const gastosFijosStore = useGastosFijosStore()
  const gastosImprevistosStore = useGastosImprevistosStore()
  const productosStore = useProductosStore()

  const insights = computed<Insight[]>(() => {
    const event = activeEvent.value

    if (event !== null) {
      return buildDuringInsights(
        event,
        ventasStore.ventas,
        gastosFijosStore.gastosPorEvento.get(event.id) ?? [],
        gastosImprevistosStore.gastosPorEvento.get(event.id) ?? [],
        productosStore.productos,
      )
    }

    // Post-event: aggregate all ventas regardless of event
    return buildPostInsights(
      ventasStore.ventas,
      productosStore.productos,
    )
  })

  return { insights }
}

// ---- During-event insight builders ----

function buildDuringInsights(
  _event: Evento,
  ventas: { items: VentaItem[]; fecha: string }[],
  fijos: GastoFijo[],
  imprevistos: GastoImprevisto[],
  productos: Producto[],
): Insight[] {
  const hoy = hoyISO()
  const todayVentas = ventas.filter((v) => v.fecha.startsWith(hoy))
  const todayItems = todayVentas.flatMap((v) => v.items)

  // Ventas hoy: sum of item subtotals
  const ventasHoy = todayItems.reduce((sum, i) => sum + i.subtotal, 0)

  // Gastos hoy
  const totalGastosFijos = fijos.reduce((sum, g) => sum + g.monto, 0)
  const totalGastosImprevistos = imprevistos.reduce((sum, g) => sum + g.monto, 0)
  const gastosHoy = totalGastosFijos + totalGastosImprevistos

  // Utilidad estimada
  const utilidad = ventasHoy - gastosHoy

  // Margen %
  const margen = ventasHoy > 0 ? Math.round((utilidad / ventasHoy) * 100) : 0

  // Top seller
  const topSeller = topSellerProductoId(todayItems)
  const topSellerProducto = topSeller.productoId
    ? productos.find((p) => p.id === topSeller.productoId) ?? null
    : null

  const topSellerName = topSellerProducto?.descripcion ?? (topSeller.productoId ? `#${topSeller.productoId}` : null)

  // Top gasto
  const topG = topGasto(fijos, imprevistos)

  return [
    {
      phrase: utilidad >= 0
        ? `Ganaste ${fmtPEN(utilidad)} hoy`
        : `Perdiste ${fmtPEN(Math.abs(utilidad))} hoy`,
      color: insightColor(utilidad),
      icon: 'mdi-cash',
      detailRoute: '/reportes/contabilidad',
    },
    {
      phrase: `Tu margen fue ${margen}%`,
      color: insightColor(margen),
      icon: 'mdi-percent',
      detailRoute: '/reportes/rentabilidad',
    },
    {
      phrase: topSellerName
        ? `Producto más vendido: ${topSellerName}`
        : 'Producto más vendido: Sin datos',
      color: 'yellow',
      icon: 'mdi-trophy',
      detailRoute: '/reportes/rentabilidad',
    },
    {
      phrase: topG
        ? `Mayor gasto: ${topG.concepto} (${fmtPEN(topG.monto)})`
        : 'Mayor gasto: Sin datos',
      color: 'yellow',
      icon: 'mdi-cash-minus',
      detailRoute: '/reportes/contabilidad',
    },
  ]
}

// ---- Post-event insight builders ----

function buildPostInsights(
  ventas: { items: VentaItem[] }[],
  productos: Producto[],
): Insight[] {
  const allItems = ventas.flatMap((v) => v.items)

  // Ventas totales
  const ventasTotales = allItems.reduce((sum, i) => sum + i.subtotal, 0)

  // COGS total
  const cogsTotal = allItems.reduce((sum, i) => sum + (i.costo_unitario ?? 0) * i.cantidad, 0)

  // Utilidad neta
  const utilidadNeta = ventasTotales - cogsTotal

  // Most profitable producto
  const topProf = topProfitableProducto(allItems)
  const topProfProducto = topProf.productoId
    ? productos.find((p) => p.id === topProf.productoId) ?? null
    : null

  const topProfName = topProfProducto?.descripcion ?? (topProf.productoId ? `#${topProf.productoId}` : null)

  return [
    {
      phrase: ventasTotales > 0 ? `Ventas totales: ${fmtPEN(ventasTotales)}` : 'Ventas totales: S/ 0.00',
      color: insightColor(ventasTotales),
      icon: 'mdi-chart-bar',
      detailRoute: '/reportes/contabilidad',
    },
    {
      phrase: `COGS: ${fmtPEN(cogsTotal)}`,
      color: 'yellow',
      icon: 'mdi-package-variant-closed',
      detailRoute: '/reportes/contabilidad',
    },
    {
      phrase: utilidadNeta >= 0
        ? `Utilidad neta: ${fmtPEN(utilidadNeta)}`
        : `Pérdida neta: ${fmtPEN(Math.abs(utilidadNeta))}`,
      color: insightColor(utilidadNeta),
      icon: 'mdi-finance',
      detailRoute: '/reportes/rentabilidad',
    },
    {
      phrase: topProfName
        ? `Producto más rentable: ${topProfName}`
        : 'Producto más rentable: Sin datos',
      color: topProfName ? 'green' : 'yellow',
      icon: 'mdi-star',
      detailRoute: '/reportes/rentabilidad',
    },
  ]
}

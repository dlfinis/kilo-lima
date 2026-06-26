<script setup lang="ts">
// REQ-POS-31, REQ-POS-34, REQ-POS-54, REQ-FIN-6, REQ-FIN-7, REQ-FIN-11,
// REQ-CON-15 (PR-2):
// read-only review card for the cierre. Five sections (REQ-FIN-11) +
// one informational row (REQ-CON-15):
//   1. Ventas — count + total + per-metodo_pago breakdown
//   2. Gastos — fijos + imprevistos with category breakdown
//   3. Utilidad bruta (ventas − COGS, color-coded)
//   4. Utilidad neta (utilidadBruta − gastosOp)
//   5. Diferencia — yellow v-alert when diferencia !== 0
//   6. Margen de contribución — total utilidadBruta vs gastos fijos
//      with a "Cubiertos: N%" indicator (REQ-CON-15).
//
// Receives the pre-computed `CierreResultado` via prop (no service /
// store calls — pure presentation component) so the view can swap
// between the live computed resumen and the snapshotted cierre row.
//
// pos-redesign (REQ-POS-12): the card also surfaces the per-metodo_pago
// count chip with the comprobante_numero span (V-001, V-002, …) so
// the operator can match receipts at the cierre. The ventas list is
// passed via a separate `comprobantesPorMetodo` prop (a map of
// metodo_pago → comprobante_numero[]) when the caller has it; the
// card stays backward-compatible (renders nothing when omitted).
import { computed } from 'vue'

import type { CierreResultado, MetodoPago, VentaConItems } from '@/types'
import { formatearUSD } from '@/utils/format'
import { formatearDiferencia } from '@/utils/cierre'

const props = defineProps<{
  resumen: CierreResultado | null
  // pos-redesign (REQ-POS-12): optional list of ventas whose
  // comprobante_numero is rendered next to the metodo_pago breakdown.
  // When omitted, the comprobante chip is not rendered (legacy
  // callers that don't have the new column).
  ventas?: VentaConItems[]
}>()

const METODOS_ETIQUETA: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  mixto: 'Mixto',
}

// pos-redesign (REQ-POS-12): group comprobante_numero by metodo_pago
// for the cierre breakdown. Only includes ventas that have a
// comprobante_numero (legacy ventas stay out — they predate the
// redesign). Stable insertion order (preserves the input order so
// V-001, V-002 render in sequence).
const comprobantesPorMetodo = computed<Record<MetodoPago, string[]>>(() => {
  const vacio: Record<MetodoPago, string[]> = {
    efectivo: [],
    transferencia: [],
    tarjeta: [],
    mixto: [],
  }
  const lista = props.ventas ?? []
  for (const v of lista) {
    if (v.comprobante_numero) vacio[v.metodo_pago].push(v.comprobante_numero)
  }
  return vacio
})

const diferenciaLabel = computed<string | null>(() =>
  props.resumen?.diferencia === null || props.resumen?.diferencia === undefined
    ? null
    : formatearDiferencia(props.resumen.diferencia),
)

const utilidadBrutaColor = computed<string>(() => {
  if (!props.resumen) return 'text-medium-emphasis'
  return props.resumen.utilidadBruta >= 0 ? 'text-success' : 'text-error'
})

const utilidadNetaColor = computed<string>(() => {
  if (!props.resumen) return 'text-medium-emphasis'
  return props.resumen.utilidadNeta >= 0 ? 'text-success' : 'text-error'
})

// REQ-CON-15 (PR-2): the "Cubiertos: N%" indicator for the
// contribution margin section. When gastos fijos are 0 we surface
// the ratio as `Infinity` so the UI never crashes on a divide-by-zero
// (the snapshot may legitimately have no gastos fijos for free /
// casual events).
const gastosOperativosTotales = computed<number>(() => {
  if (!props.resumen) return 0
  return props.resumen.totalGastosFijos + props.resumen.totalGastosImprevistos
})

const porcentajeCubiertos = computed<string>(() => {
  if (!props.resumen) return '0%'
  const gastos = gastosOperativosTotales.value
  if (gastos === 0) return 'N/A'
  const ratio = props.resumen.utilidadBruta / gastos
  if (!Number.isFinite(ratio)) return 'N/A'
  return `${Math.round(ratio * 100)}%`
})
</script>

<template>
  <v-card v-if="resumen" class="pa-4" data-testid="cierre-resumen">
    <h2 class="mb-3">Resumen del cierre</h2>

    <!-- Ventas -->
    <div class="mb-3" data-testid="cierre-ventas">
      <h3 class="text-subtitle-1">Ventas</h3>
      <p class="text-h6">
        {{ resumen.cantidadVentas }} venta(s) — {{ formatearUSD(resumen.totalVentas) }}
      </p>
      <ul v-if="resumen.cantidadVentas > 0" class="ml-4">
        <li v-for="(monto, metodo) in resumen.ventasPorMetodoPago" :key="metodo">
          <span v-if="monto > 0">
            {{ METODOS_ETIQUETA[metodo as MetodoPago] }} — {{ formatearUSD(monto) }}
            <!-- pos-redesign (REQ-POS-12): per-metodo comprobante_numero
                 range — operator can match receipts to the cierre. -->
            <span
              v-if="comprobantesPorMetodo[metodo as MetodoPago].length > 0"
              class="text-caption text-medium-emphasis ml-2"
              :data-testid="`cierre-comprobantes-${metodo}`"
            >
              ({{ comprobantesPorMetodo[metodo as MetodoPago].join(', ') }})
            </span>
          </span>
        </li>
      </ul>
    </div>

    <!-- Gastos -->
    <div class="mb-3" data-testid="cierre-gastos">
      <h3 class="text-subtitle-1">Gastos</h3>
      <p>
        Fijos: <strong>{{ formatearUSD(resumen.totalGastosFijos) }}</strong>
      </p>
      <p>
        Imprevistos: <strong>{{ formatearUSD(resumen.totalGastosImprevistos) }}</strong>
      </p>
    </div>

    <!-- Utilidad bruta — REQ-FIN-6: ventas − COGS -->
    <div class="mb-3" data-testid="cierre-utilidad">
      <h3 class="text-subtitle-1">Utilidad bruta</h3>
      <p class="text-h5" :class="utilidadBrutaColor">
        {{ formatearUSD(resumen.utilidadBruta) }}
      </p>
    </div>

    <!-- Utilidad neta — REQ-FIN-7, REQ-FIN-11: utilidadBruta − gastosOp -->
    <div class="mb-3" data-testid="cierre-utilidad-neta">
      <h3 class="text-subtitle-1">Utilidad neta</h3>
      <p class="text-h6" :class="utilidadNetaColor">
        {{ formatearUSD(resumen.utilidadNeta) }}
      </p>
    </div>

    <!-- Diferencia (yellow alert on non-zero) -->
    <v-alert
      v-if="diferenciaLabel && resumen.diferencia !== null && resumen.diferencia !== 0"
      type="warning"
      variant="tonal"
      class="mb-3"
      data-testid="cierre-diferencia-alerta"
    >
      {{ diferenciaLabel }}
    </v-alert>
    <p
      v-else-if="diferenciaLabel && resumen.diferencia === 0"
      class="text-medium-emphasis mb-3"
      data-testid="cierre-diferencia-cuadre"
    >
      Cuadre exacto
    </p>
    <p
      v-else-if="resumen.efectivoEsperado === null && resumen.efectivoReal === null"
      class="text-caption mb-3"
      data-testid="cierre-diferencia-skip"
    >
      Sin conteo de efectivo
    </p>

    <!-- REQ-CON-15 (PR-2): informational "Margen de contribución"
         line. Surfaces total contribution vs gastos operativos with
         a "Cubiertos: N%" indicator. Does NOT alter utilidadNeta. -->
    <div class="mb-3" data-testid="cierre-margen">
      <h3 class="text-subtitle-1">Margen de contribución</h3>
      <p>
        Contribución total: <strong>{{ formatearUSD(resumen.utilidadBruta) }}</strong>
        · Gastos fijos: <strong>{{ formatearUSD(gastosOperativosTotales) }}</strong>
        · Cubiertos: <strong>{{ porcentajeCubiertos }}</strong>
      </p>
    </div>
  </v-card>

  <v-card
    v-else
    class="pa-4 text-center text-medium-emphasis"
    data-testid="cierre-resumen-empty"
  >
    Sin datos para mostrar — agregá ventas y gastos primero
  </v-card>
</template>
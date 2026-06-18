<script setup lang="ts">
// REQ-POS-31, REQ-POS-34, REQ-POS-54: read-only review card for the
// cierre. Four sections (REQ-POS-34):
//   1. Ventas — count + total + per-metodo_pago breakdown
//   2. Gastos — fijos + imprevistos with category breakdown
//   3. Utilidad bruta
//   4. Diferencia — yellow v-alert when diferencia !== 0
//
// Receives the pre-computed `CierreResultado` via prop (no service /
// store calls — pure presentation component) so the view can swap
// between the live computed resumen and the snapshotted cierre row.
import { computed } from 'vue'

import type { CierreResultado, MetodoPago } from '@/types'
import { formatearUSD } from '@/utils/format'
import { formatearDiferencia } from '@/utils/cierre'

const props = defineProps<{ resumen: CierreResultado | null }>()

const METODOS_ETIQUETA: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  mixto: 'Mixto',
}

void METODOS_ETIQUETA

const diferenciaLabel = computed<string | null>(() =>
  props.resumen?.diferencia === null || props.resumen?.diferencia === undefined
    ? null
    : formatearDiferencia(props.resumen.diferencia),
)

const utilidadColor = computed<string>(() => {
  if (!props.resumen) return 'text-medium-emphasis'
  return props.resumen.utilidadBruta >= 0 ? 'text-success' : 'text-error'
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
          <span v-if="monto > 0">{{ METODOS_ETIQUETA[metodo as MetodoPago] }} — {{ formatearUSD(monto) }}</span>
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

    <!-- Utilidad bruta -->
    <div class="mb-3" data-testid="cierre-utilidad">
      <h3 class="text-subtitle-1">Utilidad bruta</h3>
      <p class="text-h5" :class="utilidadColor">
        {{ formatearUSD(resumen.utilidadBruta) }}
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
  </v-card>

  <v-card
    v-else
    class="pa-4 text-center text-medium-emphasis"
    data-testid="cierre-resumen-empty"
  >
    Sin datos para mostrar — agregá ventas y gastos primero
  </v-card>
</template>
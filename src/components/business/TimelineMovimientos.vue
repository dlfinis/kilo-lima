<script setup lang="ts">
import type { MovimientoTimeline } from '@/types'
import { formatearUSD } from '@/utils/format'

defineProps<{
  movimientos: MovimientoTimeline[]
  cargando?: boolean
}>()

const ICONOS: Record<MovimientoTimeline['tipo'], string> = {
  venta: 'mdi-cash-register',
  gasto_fijo: 'mdi-receipt-text',
  gasto_imprevisto: 'mdi-alert-circle',
  aporte: 'mdi-hand-coin',
  compra_insumo: 'mdi-cart',
}

function colorMonto(monto: number): string {
  if (monto > 0) return 'text-success'
  if (monto < 0) return 'text-error'
  return 'text-medium-emphasis'
}
</script>

<template>
  <v-card>
    <v-card-title class="d-flex align-center ga-2">
      <v-icon>mdi-timeline</v-icon>
      Movimientos
    </v-card-title>

    <v-card-text>
      <v-alert v-if="cargando" type="info" density="compact" class="mb-3">
        Cargando movimientos...
      </v-alert>

      <v-timeline
        v-if="movimientos.length"
        side="end"
        align="start"
        density="compact"
      >
        <template v-for="(mov, i) in movimientos" :key="i">
          <v-timeline-item
            :dot-color="mov.monto >= 0 ? 'success' : 'error'"
            :icon="ICONOS[mov.tipo]"
            size="x-small"
          >
            <div class="d-flex align-center ga-2">
              <span class="text-caption text-medium-emphasis text-no-wrap">
                {{ mov.fecha.slice(0, 10) }}
              </span>
              <span class="flex-grow-1">{{ mov.concepto }}</span>
              <span
                v-if="mov.socioNombre"
                class="text-caption text-medium-emphasis"
              >
                {{ mov.socioNombre }}
              </span>
              <span class="font-weight-medium" :class="colorMonto(mov.monto)">
                {{ formatearUSD(mov.monto) }}
              </span>
            </div>
          </v-timeline-item>
        </template>
      </v-timeline>

      <div v-else-if="!cargando" class="text-center text-medium-emphasis py-4">
        No hay movimientos registrados
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
// REQ-CON-7 (PR-2 brief): 3-tier pricing alert for the
// EventoProductosView. Renders a red v-alert when precio < costo
// (selling at a loss), an amber v-alert when precio < precioMinimo
// (below break-even), and nothing otherwise. The alert is purely
// advisory — saving the new price still proceeds.
//
// Priority order: red (loss) > amber (below break-even) > nothing.
import { computed } from 'vue'

import { formatearUSD } from '@/utils/format'

const props = defineProps<{
  /** The operator's currently-entered selling price for the producto. */
  precio: number
  /** Computed production cost per unit (from usePreciosEvento). */
  costoProduccion: number
  /** Computed minimum price that covers gastos fijos + costo. Null when not yet computed. */
  precioMinimo: number | null
}>()

const vendeAPerdida = computed(() => props.precio < props.costoProduccion)
const debajoDeMinimo = computed(
  () => props.precioMinimo !== null && props.precio < props.precioMinimo,
)
</script>

<template>
  <v-alert
    v-if="vendeAPerdida"
    type="error"
    variant="tonal"
    density="compact"
    class="mt-2"
    data-testid="pricing-alert-error"
  >
    Este precio está por debajo del costo de producción ({{ formatearUSD(costoProduccion) }}).
    Estás vendiendo a pérdida.
  </v-alert>
  <v-alert
    v-else-if="debajoDeMinimo"
    type="warning"
    variant="tonal"
    density="compact"
    class="mt-2"
    data-testid="pricing-alert-warning"
  >
    Precio bajo — necesitás vender más unidades para cubrir gastos fijos.
  </v-alert>
</template>
<script setup lang="ts">
import { computed } from 'vue'

import type { ResumenContabilidad } from '@/composables/useContabilidad'
import { formatearUSD } from '@/utils/format'

const props = defineProps<{
  resumen: ResumenContabilidad
}>()

const colorUtilidadBruta = computed(() => (props.resumen.utilidadBruta >= 0 ? 'success' : 'error'))
const colorUtilidadNeta = computed(() => (props.resumen.utilidadNeta >= 0 ? 'success' : 'error'))
</script>

<template>
  <v-card>
    <v-card-title class="d-flex align-center ga-2">
      <v-icon>mdi-finance</v-icon>
      Resumen contable
    </v-card-title>
    <v-list density="compact">
      <v-list-subheader>Ingresos</v-list-subheader>
      <v-list-item>
        <template #title>Ventas totales</template>
        <template #append>
          <span class="font-weight-medium">{{ formatearUSD(resumen.totalVentas) }}</span>
        </template>
      </v-list-item>
      <v-list-item>
        <template #title>COGS</template>
        <template #append>
          <span class="font-weight-medium">{{ formatearUSD(resumen.totalCogs) }}</span>
        </template>
      </v-list-item>

      <v-list-subheader>Gastos</v-list-subheader>
      <v-list-item>
        <template #title>Gastos fijos</template>
        <template #append>
          <span class="font-weight-medium">{{ formatearUSD(resumen.totalGastosFijos) }}</span>
        </template>
      </v-list-item>
      <v-list-item>
        <template #title>Gastos imprevistos</template>
        <template #append>
          <span class="font-weight-medium">{{ formatearUSD(resumen.totalGastosImprevistos) }}</span>
        </template>
      </v-list-item>
      <v-list-item>
        <template #title>Compras insumos</template>
        <template #append>
          <span class="font-weight-medium">{{ formatearUSD(resumen.totalCompras) }}</span>
        </template>
      </v-list-item>

      <v-list-subheader>Aportes</v-list-subheader>
      <v-list-item>
        <template #title>Total aportes de capital</template>
        <template #append>
          <span class="font-weight-medium">{{ formatearUSD(resumen.totalAportes) }}</span>
        </template>
      </v-list-item>

      <v-divider class="my-1" />
      <v-list-subheader>Neto</v-list-subheader>
      <v-list-item :color="colorUtilidadBruta">
        <template #title>Utilidad bruta</template>
        <template #append>
          <span class="font-weight-medium">{{ formatearUSD(resumen.utilidadBruta) }}</span>
        </template>
      </v-list-item>
      <v-list-item :color="colorUtilidadNeta">
        <template #title>Utilidad neta</template>
        <template #append>
          <span class="font-weight-medium">{{ formatearUSD(resumen.utilidadNeta) }}</span>
        </template>
      </v-list-item>
    </v-list>
  </v-card>
</template>

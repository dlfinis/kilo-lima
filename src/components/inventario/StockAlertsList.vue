<script setup lang="ts">
// mobile-ux-redesign Phase 4: StockAlertsList — ingredient alert dashboard.
// Lists all ingredients with stock alerts, sorted by severity
// (crítico first → bajo → normal), using useInventario composable.
import { computed } from 'vue'

import { useInventario, type AlertLevel } from '@/composables/useInventario'
import StockAlertItem from './StockAlertItem.vue'
import type { StockAlertItemProps } from './StockAlertItem.vue'

const { items, necesidadTotal, alertLevel } = useInventario()

const alertPriority: Record<AlertLevel, number> = {
  'crítico': 0,
  'bajo': 1,
  'normal': 2,
}

const sortedItems = computed<StockAlertItemProps[]>(() =>
  [...items.value]
    .map((mp) => {
      const disponible = mp.cantidad_disponible ?? 0
      const necesidad = necesidadTotal.value.get(mp.id) ?? 0
      return {
        nombre: mp.nombre,
        cantidad_disponible: disponible,
        unidad: mp.unidad,
        alertLevel: alertLevel(disponible, necesidad),
      }
    })
    .sort((a, b) => alertPriority[a.alertLevel] - alertPriority[b.alertLevel]),
)
</script>

<template>
  <v-card data-testid="stock-alerts-list" class="mb-4">
    <v-card-title class="d-flex align-center">
      <v-icon start color="warning" class="mr-2">mdi-alert-circle</v-icon>
      Alertas de Stock
    </v-card-title>

    <v-card-text v-if="sortedItems.length === 0" class="text-center py-6">
      <p class="text-body-1 text-medium-emphasis">No hay alertas de stock</p>
      <p class="text-caption">Todos los ingredientes tienen niveles normales</p>
    </v-card-text>

    <v-list v-else>
      <StockAlertItem
        v-for="item in sortedItems"
        :key="item.nombre"
        :item="item"
      />
    </v-list>
  </v-card>
</template>

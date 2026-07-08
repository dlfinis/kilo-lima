<script setup lang="ts">
// mobile-ux-redesign Phase 4: StockAlertItem — single ingredient alert row.
// Shows ingredient name, current stock, alert badge, and optional
// production capacity (how many units can be produced).
import type { AlertLevel } from '@/composables/useInventario'

export interface StockAlertItemProps {
  nombre: string
  cantidad_disponible: number
  unidad: string
  alertLevel: AlertLevel
  unidadesPosibles?: number
}

defineProps<{ item: StockAlertItemProps }>()

function alertColor(level: AlertLevel): string {
  switch (level) {
    case 'crítico': return 'error'
    case 'bajo': return 'warning'
    case 'normal': return 'success'
  }
}

function alertLabel(level: AlertLevel): string {
  switch (level) {
    case 'crítico': return 'Crítico'
    case 'bajo': return 'Bajo'
    case 'normal': return 'Normal'
  }
}
</script>

<template>
  <v-list-item
    :data-testid="'stock-alert-item'"
    class="stock-alert-item"
  >
    <template #prepend>
      <v-chip
        :color="alertColor(item.alertLevel)"
        size="small"
        class="text-uppercase"
        :data-testid="'alert-badge'"
      >
        {{ alertLabel(item.alertLevel) }}
      </v-chip>
    </template>

    <v-list-item-title>
      {{ item.nombre }}
    </v-list-item-title>

    <v-list-item-subtitle>
      {{ item.cantidad_disponible }} {{ item.unidad }}
      <template v-if="item.unidadesPosibles !== undefined">
        — Alcanza para {{ item.unidadesPosibles }} unidades
      </template>
    </v-list-item-subtitle>
  </v-list-item>
</template>

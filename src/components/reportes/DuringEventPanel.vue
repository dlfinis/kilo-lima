<template>
  <v-card data-testid="during-event-panel" class="during-event-panel mb-4">
    <v-card-title class="text-h6">En tiempo real</v-card-title>
    <v-card-text>
      <v-row dense>
        <v-col cols="6" sm="3">
          <div class="text-caption text-medium-emphasis">Ventas del día</div>
          <div class="text-h5 font-weight-bold">S/ {{ kpis.ventasHoy.value.toFixed(2) }}</div>
        </v-col>
        <v-col cols="6" sm="3">
          <div class="text-caption text-medium-emphasis">Gastos del día</div>
          <div class="text-h5 font-weight-bold">S/ {{ kpis.gastosHoy.value.toFixed(2) }}</div>
        </v-col>
        <v-col cols="6" sm="3">
          <div class="text-caption text-medium-emphasis">Utilidad estimada</div>
          <div
            class="text-h5 font-weight-bold"
            :class="kpis.utilidadEstimada.value >= 0 ? 'text-success' : 'text-error'"
          >
            S/ {{ kpis.utilidadEstimada.value.toFixed(2) }}
          </div>
        </v-col>
        <v-col cols="6" sm="3">
          <div class="text-caption text-medium-emphasis">Stock crítico</div>
          <div class="text-h5 font-weight-bold">{{ kpis.stockCritico.value }}</div>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { useKpis } from '@/composables/useKpis'

const kpis = useKpis()
</script>

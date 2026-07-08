<script setup lang="ts">
// mobile-ux-redesign Phase 2: KpiGrid presentational component.
// Renders an array of KPI data objects in a responsive grid using
// Vuetify v-row/v-col with responsive breakpoints:
//   col-12 (mobile), col-md-6 (tablet), col-lg-3 (web = 4 cols).
import type { KpiTrend } from './KpiCard.vue'
import KpiCard from './KpiCard.vue'

export interface KpiDato {
  title: string
  value: string | number
  icon: string
  color: string
  trend?: KpiTrend | null
}

defineProps<{
  kpis: KpiDato[]
}>()
</script>

<template>
  <v-row data-testid="kpi-grid" dense>
    <v-col
      v-for="(kpi, index) in kpis"
      :key="index"
      cols="12"
      md="6"
      lg="3"
    >
      <KpiCard
        :title="kpi.title"
        :value="kpi.value"
        :icon="kpi.icon"
        :color="kpi.color"
        :trend="kpi.trend ?? undefined"
      />
    </v-col>
  </v-row>
</template>

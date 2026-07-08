<script setup lang="ts">
// mobile-ux-redesign Phase 2: KpiCard presentational component.
// Displays a single KPI metric: icon, title, value (large), and
// optional trend indicator with arrow direction and color.
import { computed } from 'vue'

export interface KpiTrend {
  value: number
  label: string
}

const props = withDefaults(
  defineProps<{
    title: string
    value: string | number
    icon: string
    color: string
    trend?: KpiTrend | null
  }>(),
  {
    trend: undefined,
    color: 'primary',
  },
)

const trendPositivo = computed(() => (props.trend?.value ?? 0) >= 0)
const trendColor = computed(() => (trendPositivo.value ? 'text-success' : 'text-error'))
const trendIcono = computed(() =>
  trendPositivo.value ? 'mdi-arrow-up' : 'mdi-arrow-down',
)
</script>

<template>
  <v-card
    variant="tonal"
    :color="color"
    data-testid="kpi-card"
  >
    <v-card-text class="pa-4">
      <div class="d-flex align-center ga-2 mb-2">
        <v-icon :icon="icon" size="large" />
        <span class="text-body-2 text-medium-emphasis">{{ title }}</span>
      </div>
      <div
        data-testid="kpi-value"
        class="text-h4 font-weight-bold mb-1"
      >
        {{ value }}
      </div>
      <div
        v-if="trend"
        data-testid="kpi-trend"
        :class="[trendColor, 'text-caption']"
      >
        <v-icon :icon="trendIcono" size="x-small" />
        {{ Math.abs(trend.value) }}% {{ trend.label }}
      </div>
    </v-card-text>
  </v-card>
</template>

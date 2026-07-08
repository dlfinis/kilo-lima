<template>
  <div data-testid="insights-banner" class="insights-banner">
    <!-- Empty state -->
    <v-alert
      v-if="items.length === 0"
      type="info"
      variant="tonal"
      text="No hay datos disponibles"
    />

    <!-- Insights grid -->
    <v-row v-else dense>
      <v-col
        v-for="(insight, idx) in items"
        :key="idx"
        cols="12"
        sm="6"
        md="6"
        lg="3"
      >
        <InsightCard
          :phrase="insight.phrase"
          :color="insight.color"
          :icon="insight.icon"
          :detail-route="insight.detailRoute"
        />
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useInsights } from '@/composables/useInsights'
import InsightCard from './InsightCard.vue'

const { insights } = useInsights()

const items = computed(() => insights.value)
</script>

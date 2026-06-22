<script setup lang="ts">
// REQ-CON-6: color-coded v-chip rendering the monetary contribution
// per producto (precio − costo). Green when the contribution covers
// or beats cost (>= 0), red when the operator is selling at a loss
// (< 0). The chip is purely presentational — the parent decides
// what to feed it; this component only formats the value.
import { computed } from 'vue'

import { formatearUSD } from '@/utils/format'

const props = defineProps<{
  /** Monetary contribution (precio − costo). May be negative. */
  contribucion: number
}>()

const color = computed(() => (props.contribucion < 0 ? 'error' : 'success'))
</script>

<template>
  <v-chip
    :color="color"
    size="small"
    variant="tonal"
    data-testid="contribucion-badge"
  >
    Contribución: {{ formatearUSD(contribucion) }}
  </v-chip>
</template>
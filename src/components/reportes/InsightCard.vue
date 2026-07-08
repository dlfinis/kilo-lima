<template>
  <v-card
    data-testid="insight-card"
    :color="vuetifyColor"
    variant="tonal"
    :aria-label="phrase"
    class="insight-card"
    :to="detailRoute"
    link
  >
    <v-card-text class="d-flex align-center ga-3 pa-4">
      <v-icon :icon="icon" size="32" :color="vuetifyColor" />
      <span data-testid="insight-phrase" class="text-body-1 font-weight-medium">
        {{ phrase }}
      </span>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  phrase: string
  color: 'green' | 'yellow' | 'red'
  icon: string
  detailRoute: string
}>()

const vuetifyColor = computed<string>(() => {
  switch (props.color) {
    case 'green': return 'success'
    case 'yellow': return 'warning'
    case 'red': return 'error'
    default: return 'primary'
  }
})
</script>

<style scoped>
.insight-card {
  cursor: pointer;
  border-radius: 8px;
}
</style>

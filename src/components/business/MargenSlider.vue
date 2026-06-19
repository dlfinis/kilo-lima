<script setup lang="ts">
// REQ-PRICING-8, REQ-FIN-19: reusable 0..1 margin slider/input with
// live price preview. Uses a native `<input type="range">` so the
// event/disabled plumbing is trivial to test and matches the
// offline-first PWA sensibility (no Vuetify motion overhead for a
// single range control).
//
// v-model is decimal 0..1 (DB representation); the slider renders
// 0%..90%. `costo` is the product cost (read-only) used to compute
// the live price preview via `calcularPrecioPorMargen(costo, m)`.
import { computed } from 'vue'

import { calcularPrecioPorMargen } from '@/utils/pricing'

const props = defineProps<{
  modelValue: number
  costo: number
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const porcentaje = computed<number>(() => Math.round((props.modelValue ?? 0) * 100))
const precioPreview = computed<number>(() =>
  calcularPrecioPorMargen(props.costo ?? 0, props.modelValue ?? 0),
)

// UI → DB: 50 → 0.50
function onSliderInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  if (!target) return
  const ui = Number(target.value)
  const decimal = Math.max(0, Math.min(90, ui)) / 100
  emit('update:modelValue', decimal)
}
</script>

<template>
  <div class="d-flex align-center ga-2" data-testid="margen-slider">
    <input
      type="range"
      :value="porcentaje"
      min="0"
      max="90"
      step="1"
      :disabled="disabled"
      class="margen-slider-input"
      data-testid="margen-slider-input"
      @input="onSliderInput"
    />
    <span class="text-caption text-medium-emphasis" data-testid="margen-slider-porcentaje">
      {{ porcentaje }}%
    </span>
    <span class="text-body-2 font-weight-medium" data-testid="margen-slider-precio">
      ${{ precioPreview.toFixed(2) }}
    </span>
  </div>
</template>

<style scoped>
.margen-slider-input {
  flex: 1 1 auto;
  max-width: 240px;
  accent-color: rgb(var(--v-theme-primary));
}
</style>
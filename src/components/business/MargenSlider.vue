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
//
// productos-mejoras UX: el precio mostrado es clickeable. Al hacer
// clic, se emite `apply-price` con el precio calculado para que la
// vista lo establezca como precio de venta.
import { computed } from 'vue'

import { calcularPrecioPorMargen } from '@/utils/pricing'

const props = withDefaults(defineProps<{
  modelValue: number
  costo: number
  disabled?: boolean
  /** Visual theme: 'green' (ganancia) or 'orange' (contribución). Controls
   *  the slider accent color and the value text color. */
  color?: 'green' | 'orange'
}>(), {
  color: 'green',
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
  'apply-price': [price: number]
}>()

const porcentaje = computed<number>(() => Math.round((props.modelValue ?? 0) * 100))
const precioPreview = computed<number>(() =>
  calcularPrecioPorMargen(props.costo ?? 0, props.modelValue ?? 0),
)
// REQ-UX-27: show the unit value (ganancia or contribución) next to %.
// Both are `precioPreview − costo` — the same gap, but the label
// (ganancia vs contribución) is set by the parent via the `color` prop.
const unitValue = computed<number>(() =>
  Math.max(0, precioPreview.value - (props.costo ?? 0)),
)
const accentClass = computed(() =>
  props.color === 'orange' ? 'text-orange-darken-2' : 'text-success',
)
const sliderTrackColor = computed(() =>
  props.color === 'orange' ? '#ef6c00' : 'rgb(var(--v-theme-success))',
)

// UI → DB: 50 → 0.50
function onSliderInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  if (!target) return
  const ui = Number(target.value)
  const decimal = Math.max(0, Math.min(90, ui)) / 100
  emit('update:modelValue', decimal)
}

function onPrecioClick() {
  if (!props.disabled) {
    emit('apply-price', precioPreview.value)
  }
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
      :style="{ accentColor: sliderTrackColor }"
      data-testid="margen-slider-input"
      @input="onSliderInput"
    />
    <span class="text-caption text-medium-emphasis" data-testid="margen-slider-porcentaje">
      {{ porcentaje }}%
    </span>
    <span
      class="text-body-2 font-weight-medium"
      :class="accentClass"
      data-testid="margen-slider-precio"
    >
      {{ unitValue.toFixed(2) }}
    </span>
  </div>
</template>

<style scoped>
.margen-slider-input {
  flex: 1 1 auto;
  max-width: 240px;
}
.cursor-pointer {
  cursor: pointer;
}
</style>
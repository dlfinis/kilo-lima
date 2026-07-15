<script setup lang="ts">
// CheckoutButton — prominent "Cobrar" button for the POS flow.
// Shows total amount, respects disabled state, emits checkout.
// Uses accent (#FF6B35) — the brief's designated "color de ventas"
// — for visual distinction from the rest of the POS surface.

defineProps<{
  disabled: boolean
  total: number
  disabledHint?: string
}>()

const emit = defineEmits<{
  checkout: []
}>()

function formatTotal(val: number): string {
  return val.toFixed(2)
}
</script>

<template>
  <div>
    <v-btn
      color="accent"
      block
      size="large"
      :disabled="disabled"
      prepend-icon="mdi-cart-check"
      class="checkout-btn py-3"
      data-testid="checkout-btn"
      @click="emit('checkout')"
    >
      Cobrar
      <template v-if="total > 0">
        &nbsp;${{ formatTotal(total) }}
      </template>
    </v-btn>
    <div
      v-if="disabled && disabledHint"
      class="text-caption text-disabled text-center mt-1"
      data-testid="checkout-disabled-hint"
    >
      {{ disabledHint }}
    </div>
  </div>
</template>

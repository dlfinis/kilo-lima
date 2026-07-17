<script setup lang="ts">
// CheckoutButton — prominent "Cobrar" button for the POS flow.
// Shows total amount, respects disabled state, emits checkout.
import { formatearUSD } from '@/utils/format'

defineProps<{
  disabled: boolean
  total: number
  disabledHint?: string
}>()

const emit = defineEmits<{
  checkout: []
}>()

</script>

<template>
  <div>
    <v-btn
      color="accent"
      block
      size="large"
      :disabled="disabled"
      prepend-icon="mdi-cart-check"
      class="checkout-btn"
      data-testid="checkout-btn"
      @click="emit('checkout')"
    >
      Cobrar ahora
      <template v-if="total > 0">
        <span class="checkout-btn__total">{{ formatearUSD(total) }}</span>
      </template>
    </v-btn>
    <div
      v-if="disabled && disabledHint"
      class="checkout-btn__hint"
      data-testid="checkout-disabled-hint"
    >
      {{ disabledHint }}
    </div>
  </div>
</template>

<style scoped>
.checkout-btn {
  min-height: 52px;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: 0;
}
.checkout-btn__total {
  margin-left: 10px;
  font-size: 1.05rem;
}
.checkout-btn__hint {
  margin-top: 8px;
  font-size: 0.78rem;
  font-weight: 600;
  text-align: center;
  color: rgba(var(--v-theme-on-surface), 0.62);
}
</style>

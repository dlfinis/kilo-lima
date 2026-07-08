<script setup lang="ts">
// mobile-ux-redesign Phase 3: CheckoutButton — prominent green "Cobrar"
// button for the simplified POS flow. Shows total amount, respects
// disabled state, emits checkout.

defineProps<{
  disabled: boolean
  total: number
}>()

const emit = defineEmits<{
  checkout: []
}>()

function formatTotal(val: number): string {
  return val.toFixed(2)
}
</script>

<template>
  <v-btn
    color="success"
    block
    size="x-large"
    :disabled="disabled"
    class="checkout-btn py-4"
    data-testid="checkout-btn"
    @click="emit('checkout')"
  >
    Cobrar
    <template v-if="total > 0">
      &nbsp;S/ {{ formatTotal(total) }}
    </template>
  </v-btn>
</template>

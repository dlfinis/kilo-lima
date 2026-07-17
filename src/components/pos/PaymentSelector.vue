<script setup lang="ts">
// PaymentSelector — v-model payment method picker.
// Three fast buttons: Efectivo, Yape/Plin, Tarjeta.
// Selected state is high contrast so the next checkout action is unambiguous.

defineProps<{
  modelValue: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

interface PaymentOption {
  id: string
  label: string
  icon: string
}

const opciones: PaymentOption[] = [
  { id: 'efectivo', label: 'Efectivo', icon: 'mdi-cash' },
  { id: 'transferencia', label: 'Transferencia', icon: 'mdi-cellphone' },
  // { id: 'tarjeta', label: 'Tarj.', icon: 'mdi-credit-card' },
]
</script>

<template>
  <div class="payment-selector">
    <div class="payment-selector__label">Método de pago</div>
    <v-row dense>
      <v-col
        v-for="opcion in opciones"
        :key="opcion.id"
        cols="4"
      >
        <v-btn
          :color="modelValue === opcion.id ? 'primary' : undefined"
          :variant="modelValue === opcion.id ? 'flat' : 'outlined'"
          block
          size="default"
          class="payment-option-btn"
          :class="{ 'payment-option-btn--selected': modelValue === opcion.id }"
          data-testid="payment-option"
          @click="emit('update:modelValue', opcion.id)"
        >
          <div class="d-flex flex-column align-center ga-0">
            <v-icon size="22">{{ opcion.icon }}</v-icon>
            <span class="text-caption mt-0">{{ opcion.label }}</span>
          </div>
        </v-btn>
      </v-col>
    </v-row>
  </div>
</template>

<style scoped>
.payment-option-btn {
  border-radius: 10px;
  min-height: 52px;
  font-weight: 700;
  transition: background-color 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.payment-option-btn--selected {
  box-shadow: 0 4px 10px rgba(var(--v-theme-primary), 0.2);
}
.payment-selector__label {
  margin-bottom: 8px;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.7);
  text-transform: uppercase;
}
</style>

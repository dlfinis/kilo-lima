<script setup lang="ts">
// PaymentSelector — v-model payment method picker.
// Three fast buttons: Efectivo, Yape/Plin, Tarjeta.
// Selected state highlights via tonal variant in primary.

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
  { id: 'transferencia', label: 'Yape/Plin', icon: 'mdi-cellphone' },
  { id: 'tarjeta', label: 'Tarjeta', icon: 'mdi-credit-card' },
]
</script>

<template>
  <div class="payment-selector">
    <div class="text-caption text-medium-emphasis mb-1">Método de pago</div>
    <v-row dense>
      <v-col
        v-for="opcion in opciones"
        :key="opcion.id"
        cols="4"
      >
        <v-btn
          :color="modelValue === opcion.id ? 'primary' : undefined"
          :variant="modelValue === opcion.id ? 'tonal' : 'text'"
          block
          size="default"
          class="payment-option-btn py-2"
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
  border-radius: 8px;
  min-height: 52px;
  transition: background-color 0.15s, box-shadow 0.15s;
}
.payment-option-btn--selected {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
</style>

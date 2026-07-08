<script setup lang="ts">
// mobile-ux-redesign Phase 3: PaymentSelector — v-model payment method
// picker. Three options: Efectivo, Yape/Plin (stored as transferencia),
// Tarjeta. Visual selection with highlighted state.

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
    <v-row dense>
      <v-col
        v-for="opcion in opciones"
        :key="opcion.id"
        cols="4"
      >
        <v-btn
          :color="modelValue === opcion.id ? 'primary' : undefined"
          :variant="modelValue === opcion.id ? 'tonal' : 'outlined'"
          block
          size="large"
          class="py-3"
          data-testid="payment-option"
          @click="emit('update:modelValue', opcion.id)"
        >
          <div class="d-flex flex-column align-center ga-1">
            <v-icon>{{ opcion.icon }}</v-icon>
            <span class="text-caption">{{ opcion.label }}</span>
          </div>
        </v-btn>
      </v-col>
    </v-row>
  </div>
</template>

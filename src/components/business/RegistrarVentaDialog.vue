<script setup lang="ts">
// REQ-POS-12, REQ-POS-48, REQ-POS-54: confirmation dialog that shows
// the total, the active evento, and lets the user pick a metodo_pago.
// The parent (PosView) wires the actual `registrarVenta` call so the
// optimistic UI / revert-on-failure lives in the store, not here.
import { ref, watch } from 'vue'

import type { Evento, MetodoPago } from '@/types'

const props = defineProps<{
  modelValue: boolean
  total: number
  evento: Evento | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirmar: [metodoPago: MetodoPago]
}>()

const metodoPago = ref<MetodoPago>('efectivo')
const opciones: { value: MetodoPago; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'mixto', label: 'Mixto' },
]

watch(
  () => props.modelValue,
  (abierto) => {
    if (abierto) metodoPago.value = 'efectivo'
  },
)

const totalTexto = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'USD',
}).format(props.total)
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="420"
    data-testid="registrar-venta-dialogo"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <v-card>
      <v-card-title>Registrar venta</v-card-title>
      <v-card-text>
        <div class="mb-2">
          <span class="text-medium-emphasis">Evento:</span>
          <span class="ml-1">{{ evento?.nombre ?? 'Sin evento' }}</span>
        </div>
        <div class="mb-4">
          <span class="text-medium-emphasis">Total:</span>
          <span class="ml-1 text-h6">{{ totalTexto }}</span>
        </div>
        <v-select
          v-model="metodoPago"
          :items="opciones"
          item-title="label"
          item-value="value"
          label="Método de pago"
          data-testid="registrar-venta-metodo"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          data-testid="registrar-venta-cancelar"
          @click="emit('update:modelValue', false)"
        >
          Cancelar
        </v-btn>
        <v-btn
          color="primary"
          data-testid="registrar-venta-confirmar"
          @click="emit('confirmar', metodoPago)"
        >
          Registrar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
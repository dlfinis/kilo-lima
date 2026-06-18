<script setup lang="ts">
// REQ-POS-15, REQ-POS-25, REQ-POS-26, REQ-POS-27, REQ-POS-28,
// REQ-POS-29, REQ-POS-54: cart sidebar/bottom-sheet panel. Renders
// the cart lines via VentaItem, the total, and the two CTAs
// (Registrar venta + Vaciar carrito with confirmation dialog).
//
// Pure presentational — every action is an emit so the parent view
// owns the store calls (registrarVenta, vaciarCarrito).
import { computed, ref } from 'vue'

import VentaItem from './VentaItem.vue'
import type { LineaCarrito } from '@/types'

const props = defineProps<{
  carrito: LineaCarrito[]
  total: number
}>()

const emit = defineEmits<{
  'registrar-venta': []
  vaciar: []
  'update-cantidad': [productoId: string, cantidad: number]
  eliminar: [productoId: string]
}>()

const totalTexto = computed(() =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD' }).format(
    props.total,
  ),
)

const dialogoVaciarAbierto = ref(false)
function abrirDialogoVaciar() {
  dialogoVaciarAbierto.value = true
}
function confirmarVaciar() {
  dialogoVaciarAbierto.value = false
  emit('vaciar')
}
function cancelarVaciar() {
  dialogoVaciarAbierto.value = false
}
</script>

<template>
  <v-card class="pa-4 d-flex flex-column" data-testid="carrito-panel">
    <h2 class="text-h6 mb-2">Carrito</h2>

    <div v-if="carrito.length === 0" class="text-medium-emphasis py-6 text-center"
      data-testid="carrito-vacio">
      Carrito vacío
    </div>

    <div v-else class="flex-grow-1">
      <VentaItem
        v-for="linea in carrito"
        :key="linea.producto_id"
        :linea="linea"
        @update-cantidad="(id, c) => emit('update-cantidad', id, c)"
        @eliminar="(id) => emit('eliminar', id)"
      />
    </div>

    <div class="mt-4">
      <div class="d-flex justify-space-between align-center mb-2">
        <span class="text-h6">Total</span>
        <span class="text-h5" data-testid="carrito-total">{{ totalTexto }}</span>
      </div>
      <v-btn
        color="primary"
        size="large"
        block
        :disabled="carrito.length === 0"
        data-testid="carrito-registrar"
        @click="emit('registrar-venta')"
      >
        Registrar venta
      </v-btn>
      <v-btn
        v-if="carrito.length > 0"
        class="mt-2"
        variant="text"
        color="error"
        block
        data-testid="carrito-vaciar"
        @click="abrirDialogoVaciar"
      >
        Vaciar carrito
      </v-btn>
    </div>

    <v-dialog
      :model-value="dialogoVaciarAbierto"
      max-width="400"
      @update:model-value="(v) => { if (!v) cancelarVaciar() }"
    >
      <v-card>
        <v-card-title>¿Vaciar el carrito?</v-card-title>
        <v-card-text>
          Se perderán todos los productos agregados.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            data-testid="carrito-vaciar-cancelar"
            @click="cancelarVaciar"
          >
            Cancelar
          </v-btn>
          <v-btn
            color="error"
            data-testid="carrito-vaciar-confirmar"
            @click="confirmarVaciar"
          >
            Vaciar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>
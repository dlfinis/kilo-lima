<script setup lang="ts">
// REQ-POS-15, REQ-POS-25, REQ-POS-26, REQ-POS-27, REQ-POS-28,
// REQ-POS-29, REQ-POS-54: cart sidebar/bottom-sheet panel. Renders
// the cart lines via VentaItem, the total, and the two CTAs
// (Registrar venta + Vaciar carrito with confirmation dialog).
//
// Pure presentational — every action is an emit so the parent view
// owns the store calls (registrarVenta, vaciarCarrito).
//
// Visual polish: tighter checkout stack — header with icon,
// clean item list with dividers, prominent total, subdued
// secondary actions.
import { computed, ref } from 'vue'

import { formatearUSD } from '@/utils/format'
import VentaItem from './VentaItem.vue'
import type { LineaCarrito } from '@/types'

const props = defineProps<{
  carrito: LineaCarrito[]
  total: number
  hideRegisterButton?: boolean
}>()

const emit = defineEmits<{
  'registrar-venta': []
  vaciar: []
  'update-cantidad': [productoId: string, cantidad: number]
  eliminar: [productoId: string]
}>()

const totalTexto = computed(() => formatearUSD(props.total))

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
  <v-card
    variant="flat"
    class="carrito-panel pa-3 d-flex flex-column"
    color="surface-variant"
    data-testid="carrito-panel"
  >
    <!-- Header with cart icon -->
    <div class="d-flex align-center ga-2 mb-3">
      <v-icon size="20" color="primary">mdi-cart-outline</v-icon>
      <span class="text-subtitle-1 font-weight-bold" style="color: #1A1A2E">Carrito</span>
      <v-spacer />
      <span
        v-if="carrito.length > 0"
        class="text-caption font-weight-medium"
        style="color: #1A1A2E"
      >{{ carrito.length }} item(s)</span>
    </div>

    <!-- Items area -->
    <div
      v-if="carrito.length === 0"
      class="text-body-2 py-6 text-center"
      style="color: #1A1A2E"
      data-testid="carrito-vacio"
    >
      <v-icon size="32" color="grey-lighten-1" class="mb-1">mdi-cart-remove</v-icon>
      <p class="mb-0 font-weight-medium">Carrito vacío</p>
    </div>

    <div v-else class="flex-grow-1 carrito-items">
      <VentaItem
        v-for="linea in carrito"
        :key="linea.producto_id"
        :linea="linea"
        @update-cantidad="(id, c) => emit('update-cantidad', id, c)"
        @eliminar="(id) => emit('eliminar', id)"
      />
    </div>

    <!-- Totals and CTAs -->
    <div class="carrito-footer mt-3 pt-3" style="border-top: 1px solid rgba(var(--v-border-color), 0.4)">
      <div class="d-flex justify-space-between align-center mb-2">
        <span class="text-subtitle-2 font-weight-bold" style="color: #1A1A2E">Total</span>
        <span class="text-h6 font-weight-bold" style="color: #1A1A2E" data-testid="carrito-total">{{ totalTexto }}</span>
      </div>
      <v-btn
        v-if="!props.hideRegisterButton"
        color="primary"
        size="large"
        block
        :disabled="carrito.length === 0"
        prepend-icon="mdi-cart-arrow-right"
        data-testid="carrito-registrar"
        @click="emit('registrar-venta')"
      >
        Registrar venta
      </v-btn>
      <v-btn
        v-if="carrito.length > 0"
        class="mt-1"
        variant="text"
        size="small"
        color="grey-darken-1"
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

<style scoped>
.carrito-panel {
  border-radius: 8px;
}
.carrito-footer {
  margin-top: auto;
}
</style>

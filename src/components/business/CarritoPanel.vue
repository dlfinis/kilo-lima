<script setup lang="ts">
// REQ-POS-15, REQ-POS-25, REQ-POS-26, REQ-POS-27, REQ-POS-28,
// REQ-POS-29, REQ-POS-54: cart sidebar/bottom-sheet panel. Renders
// the cart lines via VentaItem, the total, and the two CTAs
// (Registrar venta + Vaciar carrito with confirmation dialog).
//
// Pure presentational — every action is an emit so the parent view
// owns the store calls (registrarVenta, vaciarCarrito).
//
// Transaction card. Payment and checkout are composed by PosView below it.
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
const totalUnidades = computed(() => props.carrito.reduce((total, linea) => total + linea.cantidad, 0))

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
    data-testid="carrito-panel"
  >
    <div class="d-flex align-center ga-2 mb-3">
      <span class="carrito-panel__icon"><v-icon size="20">mdi-cart-outline</v-icon></span>
      <span class="text-subtitle-1 font-weight-bold">Pedido actual</span>
      <v-spacer />
      <v-chip
        v-if="carrito.length > 0"
        size="small"
        color="primary"
        variant="tonal"
      >{{ totalUnidades }} {{ totalUnidades === 1 ? 'artículo' : 'artículos' }}</v-chip>
    </div>

    <!-- Items area -->
    <div
      v-if="carrito.length === 0"
      class="carrito-panel__empty text-body-2 py-8 text-center"
      data-testid="carrito-vacio"
    >
      <v-icon size="32" color="grey-lighten-1" class="mb-1">mdi-cart-remove</v-icon>
       <p class="mb-1 font-weight-bold">Aún no hay productos</p>
       <span class="text-caption">Seleccioná un producto del catálogo.</span>
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
    <div class="carrito-footer mt-3 pt-3">
      <div class="d-flex justify-space-between align-center mb-2">
        <span class="text-subtitle-1 font-weight-bold">Total</span>
        <span class="text-h5 font-weight-bold" data-testid="carrito-total">{{ totalTexto }}</span>
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
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 16px;
  background: rgb(var(--v-theme-surface));
}
.carrito-footer {
  margin-top: auto;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}
.carrito-items {
  max-height: min(46vh, 420px);
  overflow-y: auto;
  padding-right: 2px;
}
.carrito-panel__icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
}
.carrito-panel__empty {
  color: rgba(var(--v-theme-on-surface), 0.6);
}
@media (min-width: 960px) {
  .carrito-panel__empty {
    padding-top: 2rem !important;
    padding-bottom: 2rem !important;
  }
}
</style>

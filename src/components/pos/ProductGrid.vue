<script setup lang="ts">
// ProductGrid — responsive grid of ProductButton components
// for the POS. Receives already-filtered products from the parent.
// Emits 'add-to-cart' with the productoId.
//
// Visual polish: denser grid, lighter empty state.
import ProductButton from './ProductButton.vue'

defineProps<{
  productos: Array<{
    id: string
    nombre: string
    precio: number
    imagen?: string | null
    icono?: string | null
    color?: string | null
    categoria?: string | null
    cantidadEnCarrito?: number
  }>
}>()

const emit = defineEmits<{
  'add-to-cart': [productoId: string]
}>()

function manejarClick(product: { id: string }) {
  emit('add-to-cart', product.id)
}
</script>

<template>
  <div class="product-grid">
    <v-row v-if="productos.length > 0" class="product-grid__row">
      <v-col
        v-for="p in productos"
        :key="p.id"
        cols="6"
        sm="6"
        md="4"
        lg="3"
        xl="3"
      >
        <ProductButton :product="p" @click="manejarClick" />
      </v-col>
    </v-row>

    <!-- Empty state: minimal and intentional -->
    <div
      v-else
      class="text-medium-emphasis text-body-2 text-center py-8"
      data-testid="product-grid-empty"
    >
      <v-icon size="40" color="grey-lighten-1" class="mb-2">mdi-magnify-close</v-icon>
      <p class="mb-0">Sin productos</p>
    </div>
  </div>
</template>

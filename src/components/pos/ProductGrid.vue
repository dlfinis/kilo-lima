<script setup lang="ts">
// ProductGrid — responsive grid of ProductButton components
// for the POS. Accepts an optional `busqueda` prop to filter
// products externally. Emits 'add-to-cart' with the productoId.
//
// Visual polish: denser grid, lighter empty state.
import { computed } from 'vue'

import ProductButton from './ProductButton.vue'

const props = defineProps<{
  productos: Array<{
    id: string
    nombre: string
    precio: number
    imagen?: string | null
    icono?: string | null
  }>
  busqueda?: string
}>()

const emit = defineEmits<{
  'add-to-cart': [productoId: string]
}>()

const productosFiltrados = computed(() => {
  const q = (props.busqueda ?? '').trim().toLowerCase()
  if (!q) return props.productos
  return props.productos.filter(
    (p) => p.nombre.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
  )
})

function manejarClick(product: { id: string }) {
  emit('add-to-cart', product.id)
}
</script>

<template>
  <div class="product-grid">
    <!-- Filtered product grid — denser: 3 cols on md, 4 on lg.
         On xs/sm the grid already uses cols=6 (2 per row). -->
    <v-row v-if="productosFiltrados.length > 0" dense>
      <v-col
        v-for="p in productosFiltrados"
        :key="p.id"
        cols="6"
        md="4"
        lg="3"
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
      <p class="mb-0">
        {{ busqueda?.trim() ? `No hay productos que coincidan con "${busqueda}"` : 'Sin productos' }}
      </p>
    </div>
  </div>
</template>

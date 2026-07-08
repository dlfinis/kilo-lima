<script setup lang="ts">
// mobile-ux-redesign Phase 3: ProductGrid — responsive grid of
// ProductButton components for the simplified POS. Includes a search
// bar. Emits 'add-to-cart' with the productoId when a button is clicked.
import { computed, ref } from 'vue'

import ProductButton from './ProductButton.vue'

const props = defineProps<{
  productos: Array<{
    id: string
    nombre: string
    precio: number
    imagen?: string | null
  }>
}>()

const emit = defineEmits<{
  'add-to-cart': [productoId: string]
}>()

const busqueda = ref('')

const productosFiltrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
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
    <!-- Search bar -->
    <v-text-field
      v-model="busqueda"
      placeholder="Buscar producto"
      prepend-inner-icon="mdi-magnify"
      variant="outlined"
      density="comfortable"
      hide-details
      clearable
      class="mb-4"
      data-testid="product-grid-search"
    />

    <!-- Filtered product grid -->
    <p
      v-if="productosFiltrados.length === 0"
      class="text-medium-emphasis text-center py-8"
    >
      Sin productos
    </p>

    <v-row v-else>
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
  </div>
</template>

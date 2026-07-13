<script setup lang="ts">
// ProductButton — compact product tile for POS catalog.
// Clean, scannable: icon, name, price with strong hierarchy.
// Tonal variant for a softer look than outlined; the catalog
// should feel dense and operational, not like a tablet kiosk.
defineProps<{
  product: {
    id: string
    nombre: string
    precio: number
    imagen?: string | null
    icono?: string | null
  }
}>()

const emit = defineEmits<{
  click: [product: { id: string; nombre: string; precio: number; imagen?: string | null; icono?: string | null }]
}>()

function formatPrecio(val: number): string {
  return val.toFixed(2)
}
</script>

<template>
  <v-btn
    :aria-label="product.nombre"
    block
    variant="tonal"
    color="surface-variant"
    class="product-button text-caption font-weight-medium py-2"
    :min-height="60"
    @click="emit('click', product)"
  >
    <div class="d-flex flex-column align-center ga-0">
      <v-icon
        size="28"
        :color="product.icono ? 'primary' : 'grey-darken-1'"
        class="mb-1"
      >
        {{ product.icono || 'mdi-food' }}
      </v-icon>
      <span class="text-truncate text-body-2 font-weight-regular">{{ product.nombre }}</span>
      <span class="text-body-1 font-weight-bold mt-0">S/ {{ formatPrecio(product.precio) }}</span>
    </div>
  </v-btn>
</template>

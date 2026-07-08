<script setup lang="ts">
// mobile-ux-redesign Phase 3: ProductButton — large tap target for
// the simplified POS product grid. Shows name, price, image or icon.

defineProps<{
  product: {
    id: string
    nombre: string
    precio: number
    imagen?: string | null
  }
}>()

const emit = defineEmits<{
  click: [product: { id: string; nombre: string; precio: number; imagen?: string | null }]
}>()

function formatPrecio(val: number): string {
  return val.toFixed(2)
}
</script>

<template>
  <v-btn
    :aria-label="product.nombre"
    block
    size="x-large"
    variant="tonal"
    class="product-button text-body-1 font-weight-medium py-4"
    :min-height="88"
    @click="emit('click', product)"
  >
    <div class="d-flex flex-column align-center ga-2">
      <v-img
        v-if="product.imagen"
        :src="product.imagen"
        width="56"
        height="56"
        cover
        class="rounded"
        :alt="product.nombre"
      />
      <v-icon v-else size="48" color="primary">
        mdi-food
      </v-icon>
      <span class="text-truncate">{{ product.nombre }}</span>
      <span class="text-caption font-weight-bold">S/ {{ formatPrecio(product.precio) }}</span>
    </div>
  </v-btn>
</template>

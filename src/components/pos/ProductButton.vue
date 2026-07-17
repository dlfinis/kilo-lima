<script setup lang="ts">
// ProductButton — large, scan-friendly POS catalog tile.
import { formatearUSD } from '@/utils/format'

const LEGACY_PRODUCT_COLORS: Record<string, string> = {
  primary: '#4E7896',
  secondary: '#73706A',
  success: '#5D8A67',
  warning: '#C79A35',
  error: '#B96262',
  info: '#4E7896',
  purple: '#8965A3',
  pink: '#B9627B',
  orange: '#C8752C',
  teal: '#4F8B82',
  brown: '#805A43',
  indigo: '#596CA8',
}

defineProps<{
  product: {
    id: string
    nombre: string
    precio: number
    imagen?: string | null
    icono?: string | null
    color?: string | null
    categoria?: string | null
    cantidadEnCarrito?: number
  }
}>()

function colorDeProducto(color?: string | null): string {
  if (!color) return LEGACY_PRODUCT_COLORS.primary ?? '#4E7896'
  return LEGACY_PRODUCT_COLORS[color] ?? color
}

const emit = defineEmits<{
  click: [product: { id: string; nombre: string; precio: number; imagen?: string | null; icono?: string | null }]
}>()
</script>

<template>
  <v-btn
    :aria-label="product.nombre"
    data-testid="producto-card-active"
    block
    variant="text"
    :style="{ '--product-card-accent': colorDeProducto(product.color) }"
    class="product-button pa-3 text-none"
    :class="{ 'product-button--selected': product.cantidadEnCarrito }"
    :data-product-color="product.color || undefined"
    :min-height="124"
    @click="emit('click', product)"
  >
    <div class="product-button__content">
      <div class="product-button__header">
        <span class="product-button__icon">
          <v-icon size="26">{{ product.icono || 'mdi-food' }}</v-icon>
        </span>
        <v-chip
          v-if="product.cantidadEnCarrito"
          size="x-small"
          color="primary"
          variant="flat"
          class="font-weight-bold product-button__cart-count"
        >
          {{ product.cantidadEnCarrito }} en carrito
        </v-chip>
      </div>
      <div class="product-button__body">
        <span class="product-button__name">{{ product.nombre }}</span>
      </div>
      <div class="product-button__footer">
        <v-chip
          variant="outlined"
          size="x-small"
          class="product-button__category"
        >
          {{ product.categoria || 'Producto' }}
        </v-chip>
        <span class="product-button__price">{{ formatearUSD(product.precio) }}</span>
      </div>
    </div>
  </v-btn>
</template>

<style scoped>
.product-button {
  border: 1px solid transparent;
  border-radius: 12px;
  color: rgb(var(--v-theme-on-surface)) !important;
  background: color-mix(in srgb, var(--product-card-accent) 12%, rgb(var(--v-theme-surface))) !important;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}
.product-button:hover {
  box-shadow: 0 6px 16px rgba(20, 28, 45, 0.08);
  transform: translateY(-1px);
}
.product-button--selected {
  border-color: rgba(var(--v-theme-primary), 0.55);
  box-shadow: inset 3px 0 0 rgb(var(--v-theme-primary));
}
.product-button__content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  height: 100%;
  min-width: 0;
}
.product-button__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  width: 100%;
  min-height: 42px;
}
.product-button__icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 10px;
  color: var(--product-card-accent);
  background: color-mix(in srgb, var(--product-card-accent) 18%, rgb(var(--v-theme-surface)));
}
.product-button__body {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 42px;
  margin-top: 8px;
}
.product-button__footer {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  width: 100%;
  min-height: 22px;
  margin-top: auto;
  gap: 8px;
}
.product-button__name {
  width: 100%;
  overflow: hidden;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.25;
  text-align: left;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.product-button__category {
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.product-button__price {
  font-size: 1.05rem;
  font-weight: 800;
  line-height: 1;
  color: rgb(var(--v-theme-on-surface));
}
</style>

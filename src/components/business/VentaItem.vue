<script setup lang="ts">
// REQ-POS-26, REQ-POS-54: one cart line. Pure presentational — name,
// +/- qty controls, subtotal, and a remove (×) button. Every
// interaction is an emit so the parent (CarritoPanel) owns the store
// mutation.
//
// Optimized for quick quantity adjustments in the POS transaction panel.
import { computed } from 'vue'

import { formatearUSD } from '@/utils/format'
import type { LineaCarrito } from '@/types'

const props = withDefaults(
  defineProps<{
    linea: LineaCarrito
    editable?: boolean
  }>(),
  { editable: true },
)

const emit = defineEmits<{
  'update-cantidad': [productoId: string, cantidad: number]
  eliminar: [productoId: string]
}>()

const subtotalTexto = computed(() => formatearUSD(props.linea.subtotal))

function incrementar() {
  emit('update-cantidad', props.linea.producto_id, props.linea.cantidad + 1)
}

function decrementar() {
  emit('update-cantidad', props.linea.producto_id, props.linea.cantidad - 1)
}
</script>

<template>
  <div
    class="venta-item"
    data-testid="venta-item"
  >
    <div class="venta-item__product">
      <div class="venta-item__name">{{ linea.nombre }}</div>
      <div class="text-caption text-medium-emphasis">
        {{ formatearUSD(linea.precio_unitario) }} c/u
      </div>
    </div>
    <template v-if="editable">
      <div class="venta-item__quantity d-flex align-center ga-0">
        <v-btn
          icon="mdi-minus"
          size="x-small"
          variant="tonal"
          color="primary"
          data-testid="venta-item-menos"
          @click="decrementar"
        />
        <span class="text-body-2 font-weight-bold mx-2" style="min-width: 1.25rem; text-align: center">
          {{ linea.cantidad }}
        </span>
        <v-btn
          icon="mdi-plus"
          size="x-small"
          variant="tonal"
          color="primary"
          data-testid="venta-item-mas"
          @click="incrementar"
        />
      </div>
      <v-btn
        icon="mdi-close"
        size="x-small"
        variant="text"
        color="error"
        class="venta-item__remove"
        data-testid="venta-item-eliminar"
        @click="emit('eliminar', linea.producto_id)"
      />
    </template>
    <div v-else class="text-body-2">{{ linea.cantidad }} × {{ subtotalTexto }}</div>
    <div v-if="editable" class="venta-item__subtotal">{{ subtotalTexto }}</div>
  </div>
</template>

<style scoped>
.venta-item {
  display: grid;
  grid-template-columns: minmax(9rem, 1fr) auto auto 4rem;
  grid-template-areas: 'product quantity remove subtotal';
  align-items: center;
  column-gap: 6px;
  min-height: 68px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.3);
}
.venta-item:last-child {
  border-bottom: none;
}
.venta-item__subtotal {
  grid-area: subtotal;
  min-width: 62px;
  font-size: 0.9rem;
  font-weight: 800;
  text-align: right;
}
.venta-item__product {
  grid-area: product;
  min-width: 0;
}
.venta-item__name {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.15;
}
.venta-item__quantity {
  grid-area: quantity;
}
.venta-item__remove {
  grid-area: remove;
}
@media (max-width: 420px) {
  .venta-item {
    grid-template-columns: minmax(0, 1fr) auto 4rem;
    grid-template-areas:
      'product product subtotal'
      'quantity remove subtotal';
    row-gap: 4px;
  }
}
</style>

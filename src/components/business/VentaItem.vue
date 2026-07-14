<script setup lang="ts">
// REQ-POS-26, REQ-POS-54: one cart line. Pure presentational — name,
// +/- qty controls, subtotal, and a remove (×) button. Every
// interaction is an emit so the parent (CarritoPanel) owns the store
// mutation.
//
// Visual polish: tighter spacing, subtle border between items,
// cleaner qty controls.
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
    class="venta-item d-flex align-center ga-2 py-2"
    data-testid="venta-item"
  >
    <div class="flex-grow-1" style="min-width: 0">
      <div class="text-body-2 font-weight-medium text-truncate" style="color: #1A1A2E">{{ linea.nombre }}</div>
      <div class="text-caption font-weight-medium" style="color: #1A1A2E">
        {{ subtotalTexto }}
      </div>
    </div>
    <template v-if="editable">
      <div class="d-flex align-center ga-0">
        <v-btn
          icon="mdi-minus"
          size="x-small"
          variant="text"
          density="compact"
          data-testid="venta-item-menos"
          @click="decrementar"
        />
        <span class="text-caption font-weight-bold mx-1" style="min-width: 1.25rem; text-align: center">
          {{ linea.cantidad }}
        </span>
        <v-btn
          icon="mdi-plus"
          size="x-small"
          variant="text"
          density="compact"
          data-testid="venta-item-mas"
          @click="incrementar"
        />
      </div>
      <v-btn
        icon="mdi-close"
        size="x-small"
        variant="text"
        color="grey-lighten-1"
        density="compact"
        data-testid="venta-item-eliminar"
        @click="emit('eliminar', linea.producto_id)"
      />
    </template>
    <div v-else class="text-body-2">{{ linea.cantidad }} × {{ subtotalTexto }}</div>
  </div>
</template>

<style scoped>
.venta-item {
  border-bottom: 1px solid rgba(var(--v-border-color), 0.3);
}
.venta-item:last-child {
  border-bottom: none;
}
</style>

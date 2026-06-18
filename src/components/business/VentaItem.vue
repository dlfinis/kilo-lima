<script setup lang="ts">
// REQ-POS-26, REQ-POS-54: one cart line. Pure presentational — name,
// +/- qty controls, subtotal, and a remove (×) button. Every
// interaction is an emit so the parent (CarritoPanel) owns the store
// mutation.
import { computed } from 'vue'

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

const subtotalTexto = computed(() => {
  const n = props.linea.subtotal
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD' }).format(n)
})

function incrementar() {
  emit('update-cantidad', props.linea.producto_id, props.linea.cantidad + 1)
}

function decrementar() {
  emit('update-cantidad', props.linea.producto_id, props.linea.cantidad - 1)
}
</script>

<template>
  <div class="d-flex align-center ga-2 py-2" data-testid="venta-item">
    <div class="flex-grow-1">
      <div class="text-body-1">{{ linea.nombre }}</div>
      <div class="text-caption text-medium-emphasis">
        {{ linea.cantidad }} × {{ subtotalTexto }}
      </div>
    </div>
    <template v-if="editable">
      <v-btn
        icon="mdi-minus"
        size="small"
        variant="text"
        data-testid="venta-item-menos"
        @click="decrementar"
      />
      <div class="text-body-1" style="min-width: 1.5rem; text-align: center">
        {{ linea.cantidad }}
      </div>
      <v-btn
        icon="mdi-plus"
        size="small"
        variant="text"
        data-testid="venta-item-mas"
        @click="incrementar"
      />
      <v-btn
        icon="mdi-close"
        size="small"
        variant="text"
        color="error"
        data-testid="venta-item-eliminar"
        @click="emit('eliminar', linea.producto_id)"
      />
    </template>
    <div v-else class="text-body-1">{{ linea.cantidad }} × {{ subtotalTexto }}</div>
  </div>
</template>
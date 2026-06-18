<script setup lang="ts">
// REQ-POS-46, REQ-POS-54: presentational list-row variant. Same data
// shape as ProductoCard with a slightly different action set — no
// "Agregar al carrito" (the row already lives in a clickable list).
import type { Producto } from '@/types'
import { formatearUSD } from '@/utils/format'

defineProps<{
  producto: Producto
  nombreReceta: string
}>()

defineEmits<{
  editar: [productoId: string]
  toggle: [productoId: string]
  eliminar: [productoId: string]
}>()
</script>

<template>
  <v-list-item data-testid="producto-item">
    <v-list-item-title>{{ nombreReceta }}</v-list-item-title>
    <v-list-item-subtitle>
      {{ formatearUSD(producto.precio_venta) }}
      <span v-if="!producto.disponible" class="text-warning ml-2" data-testid="producto-item-baja">
        · No disponible
      </span>
    </v-list-item-subtitle>
    <template #append>
      <v-btn
        icon="mdi-pencil"
        size="small"
        variant="text"
        data-testid="producto-item-editar"
        @click="$emit('editar', producto.id)"
      />
      <v-btn
        :icon="producto.disponible ? 'mdi-eye-off' : 'mdi-eye'"
        size="small"
        variant="text"
        data-testid="producto-item-toggle"
        @click="$emit('toggle', producto.id)"
      />
      <v-btn
        icon="mdi-delete"
        size="small"
        variant="text"
        color="error"
        data-testid="producto-item-eliminar"
        @click="$emit('eliminar', producto.id)"
      />
    </template>
  </v-list-item>
</template>
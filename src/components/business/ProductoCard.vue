<script setup lang="ts">
// REQ-POS-1, REQ-POS-3, REQ-POS-21, REQ-POS-54: presentational card
// for a single producto. The Agregar button is hidden when the
// product is unavailable (REQ-POS-3 — products.toggle). Card is
// purely visual — every action is an emit, the parent view owns the
// dialogs and store wiring.
import type { Producto } from '@/types'
import { formatearUSD } from '@/utils/format'

defineProps<{
  producto: Producto
  nombreReceta: string
}>()

defineEmits<{
  agregar: [productoId: string]
  editar: [productoId: string]
  toggle: [productoId: string]
  eliminar: [productoId: string]
}>()
</script>

<template>
  <v-card class="pa-4 d-flex flex-column" data-testid="producto-card">
    <div class="text-h6 mb-2">{{ nombreReceta }}</div>
    <div class="text-h5 mb-2" data-testid="producto-card-precio">
      {{ formatearUSD(producto.precio_venta) }}
    </div>
    <v-spacer />
    <div class="d-flex ga-2 mt-2 flex-wrap">
      <v-btn
        v-if="producto.disponible"
        color="primary"
        size="large"
        min-height="48"
        data-testid="producto-card-agregar"
        @click="$emit('agregar', producto.id)"
      >
        Agregar al carrito
      </v-btn>
      <v-btn
        icon="mdi-pencil"
        size="small"
        variant="text"
        data-testid="producto-card-editar"
        @click="$emit('editar', producto.id)"
      />
      <v-btn
        :icon="producto.disponible ? 'mdi-eye-off' : 'mdi-eye'"
        size="small"
        variant="text"
        data-testid="producto-card-toggle"
        @click="$emit('toggle', producto.id)"
      />
      <v-btn
        icon="mdi-delete"
        size="small"
        variant="text"
        color="error"
        data-testid="producto-card-eliminar"
        @click="$emit('eliminar', producto.id)"
      />
    </div>
  </v-card>
</template>
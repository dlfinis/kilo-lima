<script setup lang="ts">
// POS card redesign: toda la card es clickeable (como terminal POS).
// Icono grande arriba, nombre, precio prominente, contribución sutil.
// Dimensión uniforme via aspect-ratio. Sin botones de edición (eso
// vive en el catálogo, no en el POS).
import type { Producto } from '@/types'
import { formatearUSD } from '@/utils/format'

withDefaults(
  defineProps<{
    producto: Producto
    nombreReceta: string
    contribucion?: number | null
  }>(),
  { contribucion: null },
)

defineEmits<{
  agregar: [productoId: string]
}>()
</script>

<template>
  <v-card
    class="pos-card d-flex flex-column align-center justify-center pa-4"
    :class="{ 'pos-card--disabled': !producto.disponible }"
    role="button"
    :tabindex="producto.disponible ? 0 : -1"
    :data-testid="`producto-card-${producto.disponible ? 'active' : 'disabled'}`"
    @click="producto.disponible && $emit('agregar', producto.id)"
    @keydown.enter="producto.disponible && $emit('agregar', producto.id)"
    @keydown.space.prevent="producto.disponible && $emit('agregar', producto.id)"
  >
    <!-- Icono grande -->
    <v-icon
      :icon="producto.icono || 'mdi-food'"
      size="64"
      color="primary"
      class="mb-3"
      data-testid="producto-card-icono"
    />

    <!-- Nombre del producto -->
    <div class="text-body-1 font-weight-medium text-center mb-2 text-truncate-full">
      {{ nombreReceta }}
    </div>

    <!-- Precio prominente -->
    <div class="text-h5 font-weight-bold mb-1" data-testid="producto-card-precio">
      {{ formatearUSD(producto.precio_venta) }}
    </div>

    <!-- Contribución sutil -->
    <div
      v-if="contribucion !== null && contribucion !== undefined"
      class="text-caption text-center"
      :class="contribucion >= 0 ? 'text-success' : 'text-error'"
      data-testid="producto-card-contribucion"
    >
      +{{ formatearUSD(contribucion) }}
    </div>

    <!-- Estado no disponible -->
    <div
      v-if="!producto.disponible"
      class="pos-card__overlay d-flex align-center justify-center"
    >
      <v-chip color="error" size="small" variant="tonal">No disponible</v-chip>
    </div>
  </v-card>
</template>

<style scoped>
.pos-card {
  aspect-ratio: 1;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  user-select: none;
  min-height: 140px;
}

.pos-card:hover:not(.pos-card--disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.pos-card:active:not(.pos-card--disabled) {
  transform: scale(0.98);
}

.pos-card:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.pos-card--disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.pos-card__overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(2px);
}

.text-truncate-full {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

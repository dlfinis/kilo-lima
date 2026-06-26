<script setup lang="ts">
// ProductoCard: dos modos de presentacion.
// - "pos": toda la card es clickeable, icono grande, titulo centrado,
//   precio prominente, boton (i) de info. Sin editar/eliminar.
// - "catalogo": card simplificada con botones de editar/toggle/eliminar.
//   Sin precio (el precio depende del evento) ni "agregar al carrito".
// El color del producto determina el color de la card en ambos modos.
import { computed, ref } from 'vue'

import type { Producto } from '@/types'
import { formatearUSD } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    producto: Producto
    nombreReceta: string
    contribucion?: number | null
    modo?: 'pos' | 'catalogo'
  }>(),
  { contribucion: null, modo: 'pos' },
)

const emit = defineEmits<{
  agregar: [productoId: string]
  editar: [productoId: string]
  toggle: [productoId: string]
  eliminar: [productoId: string]
}>()

const infoAbierta = ref(false)

// Color de la card. Fallback a 'primary' si el producto no tiene color.
const colorCard = computed(() => props.producto.color || 'primary')

function toggleInfo(e: Event): void {
  e.stopPropagation()
  infoAbierta.value = !infoAbierta.value
}

function alHacerClick(): void {
  if (props.modo === 'pos' && props.producto.disponible) {
    emit('agregar', props.producto.id)
  }
}
</script>

<template>
  <v-card
    class="producto-card d-flex flex-column"
    :class="{ 'producto-card--disabled': !producto.disponible, 'producto-card--pos': modo === 'pos' }"
    :color="modo === 'pos' ? colorCard : undefined"
    :theme="modo === 'pos' ? 'dark' : undefined"
    :role="modo === 'pos' ? 'button' : undefined"
    :tabindex="modo === 'pos' && producto.disponible ? 0 : -1"
    :data-testid="`producto-card-${producto.disponible ? 'active' : 'disabled'}`"
    @click="alHacerClick"
    @keydown.enter="alHacerClick"
    @keydown.space.prevent="alHacerClick"
  >
    <!-- MODO POS: layout centrado con icono grande, color de fondo -->
    <template v-if="modo === 'pos'">
      <!-- Boton de info (i) en esquina superior izquierda -->
      <v-btn
        v-if="producto.descripcion"
        icon="mdi-information-outline"
        size="x-small"
        variant="text"
        class="producto-card__info-btn"
        data-testid="producto-card-info-btn"
        @click="toggleInfo"
      />

      <div class="d-flex flex-column align-center justify-center flex-grow-1 pa-4 text-center">
        <!-- Icono grande -->
        <v-icon
          :icon="producto.icono || 'mdi-food'"
          size="56"
          color="white"
          class="mb-2"
          data-testid="producto-card-icono"
        />

        <!-- Nombre centrado y visible -->
        <div class="text-body-1 font-weight-medium mb-1 producto-card__nombre">
          {{ nombreReceta }}
        </div>

        <!-- Precio grande debajo del titulo -->
        <div class="text-h5 font-weight-bold" data-testid="producto-card-precio">
          {{ formatearUSD(producto.precio_venta) }}
        </div>

        <!-- Contribucion sutil -->
        <div
          v-if="contribucion !== null && contribucion !== undefined"
          class="text-caption mt-1"
          :class="contribucion >= 0 ? 'text-light-green-lighten-3' : 'text-red-lighten-2'"
          data-testid="producto-card-contribucion"
        >
          +{{ formatearUSD(contribucion) }}
        </div>
      </div>

      <!-- Panel de informacion (descripcion) -->
      <v-expand-transition>
        <div v-if="infoAbierta && producto.descripcion" class="producto-card__info pa-3 bg-black bg-opacity-25">
          <p class="text-body-2 mb-0 text-white">{{ producto.descripcion }}</p>
        </div>
      </v-expand-transition>

      <!-- Overlay no disponible -->
      <div
        v-if="!producto.disponible"
        class="producto-card__overlay d-flex align-center justify-center"
      >
        <v-chip color="error" size="small" variant="tonal">No disponible</v-chip>
      </div>
    </template>

    <!-- MODO CATALOGO: card con borde de color, sin precio ni "agregar" -->
    <template v-else>
      <div class="pa-4 d-flex flex-column">
        <div class="d-flex align-center ga-2 mb-2">
          <v-icon
            :icon="producto.icono || 'mdi-food'"
            size="32"
            :color="colorCard"
          />
          <div class="text-h6 text-truncate">{{ nombreReceta }}</div>
          <v-spacer />
          <v-chip
            :color="colorCard"
            size="x-small"
            variant="flat"
            data-testid="producto-card-color-indicator"
          />
        </div>
        <div
          v-if="producto.descripcion"
          class="text-body-2 text-medium-emphasis mb-2 producto-card-descripcion"
          data-testid="producto-card-descripcion"
        >
          {{ producto.descripcion }}
        </div>
        <v-spacer />
        <div class="d-flex ga-2 mt-2 flex-wrap">
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
      </div>
    </template>
  </v-card>
</template>

<style scoped>
.producto-card {
  min-height: 140px;
}

.producto-card--pos {
  aspect-ratio: 1;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  user-select: none;
  position: relative;
}

.producto-card--pos:hover:not(.producto-card--disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.producto-card--pos:active:not(.producto-card--disabled) {
  transform: scale(0.98);
}

.producto-card--pos:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.producto-card--disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.producto-card__nombre {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-clamp: 2;
}

.producto-card__info-btn {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 1;
}

.producto-card__info {
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.producto-card__overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(2px);
}

.producto-card-descripcion {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>

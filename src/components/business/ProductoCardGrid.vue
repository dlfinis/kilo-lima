<script setup lang="ts">
// REQ-POS-20, REQ-POS-21, REQ-POS-22, REQ-POS-23, REQ-POS-24,
// REQ-POS-54: presentational wrapper around ProductoCard that owns
// the responsive grid layout, the search filter, and the empty
// states. The view wires the store calls (cargarDisponibles,
// agregarAlCarrito) and the dialogs.
import { computed } from 'vue'

import ProductoCard from './ProductoCard.vue'
import type { Producto, RecetaConIngredientes } from '@/types'

const props = withDefaults(
  defineProps<{
    productos: Producto[]
    recetas: RecetaConIngredientes[]
    busqueda?: string
  }>(),
  { busqueda: '' },
)

defineEmits<{
  agregar: [productoId: string]
}>()

function nombreReceta(producto: Producto): string {
  return props.recetas.find((r) => r.id === producto.receta_id)?.nombre ?? 'Receta'
}

const productosFiltrados = computed<Producto[]>(() => {
  const aguja = props.busqueda.trim().toLowerCase()
  if (!aguja) return props.productos
  return props.productos.filter((p) => nombreReceta(p).toLowerCase().includes(aguja))
})

const mostrarEmpty = computed(
  () => props.productos.length === 0 || productosFiltrados.value.length === 0,
)

const emptyTitulo = computed(() =>
  props.productos.length === 0
    ? 'No hay productos disponibles'
    : 'No se encontraron productos',
)
</script>

<template>
  <div>
    <v-row
      v-if="!mostrarEmpty && productosFiltrados.length > 0"
      data-testid="producto-grid"
    >
      <v-col
        v-for="producto in productosFiltrados"
        :key="producto.id"
        cols="12"
        sm="6"
        md="4"
        lg="3"
      >
        <ProductoCard
          :producto="producto"
          :nombre-receta="nombreReceta(producto)"
          @agregar="(id) => $emit('agregar', id)"
        />
      </v-col>
    </v-row>

    <v-alert
      v-if="mostrarEmpty"
      class="pa-6 text-center"
      data-testid="producto-grid-empty"
    >
      <p class="text-h6 mb-2">{{ emptyTitulo }}</p>
      <p v-if="productos.length === 0" class="mb-4">
        Creá productos desde el Catálogo para empezar a vender.
      </p>
      <v-btn
        v-if="productos.length === 0"
        color="primary"
        :href="'/recetas'"
        data-testid="producto-grid-ir-recetas"
      >
        Ir a Recetas
      </v-btn>
    </v-alert>
  </div>
</template>
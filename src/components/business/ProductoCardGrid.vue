<script setup lang="ts">
// REQ-POS-20, REQ-POS-21, REQ-POS-22, REQ-POS-23, REQ-POS-24,
// REQ-POS-54: presentational wrapper around ProductoCard that owns
// the responsive grid layout, the search filter, and the empty
// states. The view wires the store calls (cargarDisponibles,
// agregarAlCarrito) and the dialogs.
//
// REQ-CON-8 (PR-2): optional `contribucionesPorProducto` map forwards
// a per-producto monetary contribution to each ProductoCard so the
// POS grid can render the contribution badge inline. The map is keyed
// by productoId; absent keys render the card without a badge.
import { computed } from 'vue'

import ProductoCard from './ProductoCard.vue'
import type { Producto, RecetaConIngredientes } from '@/types'

const props = withDefaults(
  defineProps<{
    productos: Producto[]
    recetas: RecetaConIngredientes[]
    busqueda?: string
    contribucionesPorProducto?: Record<string, number>
  }>(),
  { busqueda: '', contribucionesPorProducto: () => ({}) },
)

defineEmits<{
  agregar: [productoId: string]
  editar: [productoId: string]
  toggle: [productoId: string]
  eliminar: [productoId: string]
}>()

const productosFiltrados = computed<Producto[]>(() => {
  const aguja = props.busqueda.trim().toLowerCase()
  if (!aguja) return props.productos
  // catalog-domain-refactor / Slice 2: search by commercial product
  // name (not receta name).
  return props.productos.filter((p) => p.nombre.toLowerCase().includes(aguja))
})

const mostrarEmpty = computed(
  () => props.productos.length === 0 || productosFiltrados.value.length === 0,
)

const emptyTitulo = computed(() =>
  props.productos.length === 0
    ? 'No hay productos disponibles'
    : 'No se encontraron productos',
)

function contribucionPara(producto: Producto): number | null {
  const valor = props.contribucionesPorProducto[producto.id]
  return typeof valor === 'number' ? valor : null
}
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
          :nombre-receta="producto.nombre"
          :contribucion="contribucionPara(producto)"
          modo="pos"
          @agregar="(id) => $emit('agregar', id)"
          @editar="(id) => $emit('editar', id)"
          @toggle="(id) => $emit('toggle', id)"
          @eliminar="(id) => $emit('eliminar', id)"
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
        :href="'/productos/preparaciones'"
        data-testid="producto-grid-ir-recetas"
      >
        Ir a Preparaciones
      </v-btn>
    </v-alert>
  </div>
</template>
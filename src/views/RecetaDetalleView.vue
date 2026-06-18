<script setup lang="ts">
// REQ-CATALOG-14..16, REQ-CATALOG-30, REQ-CATALOG-35, REQ-CATALOG-46,
// REQ-POS-47: the recipe detail view reads the route param `:id`,
// loads the recipe into the store on mount (or finds it in the cache),
// and renders the cost breakdown via `<RecetaCostoDesglose>`. The
// `costoPorReceta` getter is reactive: when an ingredient's
// `costo_por_unidad` changes, the breakdown recomputes without manual
// watchers (REQ-CATALOG-15).
//
// REQ-POS-47 cross-slice touch: when the receta has no producto yet,
// the view renders a "Vender esta receta" button that opens a
// quick-create dialog bound to the productos store. The dialog
// reuses `<ProductoForm>` and pre-fills `recetaIdInicial` with the
// current receta. After a successful create, the button switches
// to "Editar precio de venta" which opens the same dialog in edit
// mode against the existing producto.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ProductoForm from '@/components/business/ProductoForm.vue'
import RecetaCostoDesglose from '@/components/business/RecetaCostoDesglose.vue'
import { useRecipes } from '@/composables/useRecipes'
import { useProductos } from '@/composables/useProductos'
import { useCalculoReceta } from '@/composables/useCalculoReceta'
import type { Producto, ProductoInput } from '@/types'

const route = useRoute()
const router = useRouter()
const { recetas, cargarTodas } = useRecipes()
const { productos, cargarPorReceta, crear, actualizar } = useProductos()

const recetaId = computed<string | null>(() => {
  const value = route.params.id
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? null : null
})

const receta = computed(() =>
  recetaId.value ? recetas.value.find((r) => r.id === recetaId.value) ?? null : null,
)

const calculo = useCalculoReceta(recetaId)

const productoAsociado = computed<Producto | null>(() => {
  if (!recetaId.value) return null
  return productos.value.find((p) => p.receta_id === recetaId.value) ?? null
})

const dialogoVenta = ref(false)

onMounted(() => {
  if (recetas.value.length === 0) cargarTodas()
  if (recetaId.value) cargarPorReceta(recetaId.value)
})

function volver() {
  router.push({ name: 'recetas' })
}

function abrirDialogoVenta() {
  dialogoVenta.value = true
}

async function manejarSubmitProducto(input: ProductoInput) {
  if (productoAsociado.value) {
    await actualizar(productoAsociado.value.id, input)
  } else {
    await crear(input)
  }
  dialogoVenta.value = false
}
</script>

<template>
  <v-container>
    <v-btn
      v-if="receta"
      variant="text"
      prepend-icon="mdi-arrow-left"
      class="mb-2"
      data-testid="receta-detalle-volver"
      @click="volver"
    >
      Volver
    </v-btn>

    <v-progress-linear v-if="!receta && recetas.length === 0" indeterminate color="primary" />

    <v-alert
      v-if="!receta && recetas.length > 0"
      type="warning"
      class="mb-4"
      data-testid="receta-detalle-no-encontrada"
    >
      Receta no encontrada.
    </v-alert>

    <template v-if="receta">
      <div class="d-flex align-center justify-space-between mb-2">
        <h1 data-testid="receta-detalle-titulo">{{ receta.nombre }}</h1>
        <v-btn
          color="primary"
          prepend-icon="mdi-store"
          data-testid="receta-detalle-vender"
          @click="abrirDialogoVenta"
        >
          {{ productoAsociado ? 'Editar precio de venta' : 'Vender esta receta' }}
        </v-btn>
      </div>
      <p v-if="receta.descripcion" class="mb-4" data-testid="receta-detalle-descripcion">
        {{ receta.descripcion }}
      </p>
      <p v-else class="mb-4 text-medium-emphasis">Sin descripción</p>

      <v-card class="mb-4 pa-4">
        <p><strong>Rendimiento:</strong> {{ receta.rendimiento_unidades }} unidades</p>
      </v-card>

      <h2 class="mb-2">Desglose de costo</h2>
      <RecetaCostoDesglose v-if="calculo" :calculo="calculo" />
    </template>

    <v-dialog
      :model-value="dialogoVenta"
      max-width="600"
      @update:model-value="(v) => { dialogoVenta = v }"
    >
      <v-card v-if="receta">
        <v-card-title>
          {{ productoAsociado ? 'Editar precio de venta' : 'Vender esta receta' }}
        </v-card-title>
        <v-card-text>
          <ProductoForm
            :valores-iniciales="productoAsociado"
            :recetas="[{ id: receta.id, nombre: receta.nombre }]"
            :receta-id-inicial="receta.id"
            @submit="manejarSubmitProducto"
            @cancel="dialogoVenta = false"
          />
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-container>
</template>
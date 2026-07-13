<script setup lang="ts">
// REQ-POS-1, REQ-POS-3, REQ-POS-4, REQ-POS-24, REQ-POS-46, REQ-POS-49,
// REQ-POS-50, REQ-POS-54: product management view. Four UX states
// (loading/empty/error/data — REQ-POS-49), filter by `disponible`,
// create/edit/delete/toggle dialogs. The "Agregar al carrito" CTA
// now wires into `useVentas().agregarAlCarrito` (REQ-POS-7,
// REQ-POS-20) — PR3 ships the cart store + composable.
import { computed, onMounted, ref } from 'vue'

import ProductoCard from '@/components/business/ProductoCard.vue'
import ProductoForm from '@/components/business/ProductoForm.vue'
import { useProductos } from '@/composables/useProductos'
import { useRecipes } from '@/composables/useRecipes'
import { useVentas } from '@/composables/useVentas'
import type { Producto, ProductoInput } from '@/types'

const { productos, cargando, error, cargarTodas, crear, actualizar, toggleDisponible, eliminar } =
  useProductos()
const { recetas, cargarTodas: cargarRecetas } = useRecipes()
const { agregarAlCarrito } = useVentas()

type Dialogo =
  | { tipo: 'cerrado' }
  | { tipo: 'crear' }
  | { tipo: 'editar'; producto: Producto }
  | { tipo: 'eliminar'; producto: Producto }

const dialogo = ref<Dialogo>({ tipo: 'cerrado' })
const filtro = ref<'todos' | 'disponibles'>('todos')

const productosFiltrados = computed<Producto[]>(() =>
  filtro.value === 'todos'
    ? productos.value
    : productos.value.filter((p) => p.disponible),
)

const recetaOptions = computed(() =>
  recetas.value.map((r) => ({ id: r.id, nombre: r.nombre })),
)

const recetaIdInicial = ref<string>('')
const editValores = computed<Producto | null>(() =>
  dialogo.value.tipo === 'editar' ? dialogo.value.producto : null,
)

onMounted(() => {
  cargarTodas()
  if (recetas.value.length === 0) cargarRecetas()
})

async function manejarSubmit(input: ProductoInput) {
  if (dialogo.value.tipo === 'editar') {
    await actualizar(dialogo.value.producto.id, input)
  } else {
    await crear(input)
  }
  dialogo.value = { tipo: 'cerrado' }
}

async function confirmarEliminar() {
  if (dialogo.value.tipo !== 'eliminar') return
  await eliminar(dialogo.value.producto.id)
  dialogo.value = { tipo: 'cerrado' }
}

function abrirCrear() {
  recetaIdInicial.value = ''
  dialogo.value = { tipo: 'crear' }
}

function abrirEditar(id: string) {
  const p = productos.value.find((x) => x.id === id)
  if (p) {
    recetaIdInicial.value = p.receta_id
    dialogo.value = { tipo: 'editar', producto: p }
  }
}

function abrirEliminar(id: string) {
  const p = productos.value.find((x) => x.id === id)
  if (p) dialogo.value = { tipo: 'eliminar', producto: p }
}

async function alAgregar(productoId: string) {
  const producto = productos.value.find((p) => p.id === productoId)
  if (!producto) return
  // REQ-FIN-31 (PR-2b): the store derives precio/costo/margen from
  // usePreciosEvento internally. The caller only passes the productoId
  // and the cantidad to add.
  agregarAlCarrito(productoId, 1)
}

function cerrarDialogo() {
  dialogo.value = { tipo: 'cerrado' }
}
</script>

<template>
  <v-container>
    <div class="d-flex align-center justify-space-between mb-4">
      <h1 data-testid="productos-titulo">Productos</h1>
      <v-btn
        v-if="!cargando || productos.length > 0"
        color="primary"
        prepend-icon="mdi-plus"
        data-testid="productos-nuevo"
        @click="abrirCrear"
      >
        Nuevo producto
      </v-btn>
    </div>

    <div class="d-flex ga-2 mb-4">
      <v-btn
        :variant="filtro === 'todos' ? 'flat' : 'outlined'"
        color="primary"
        size="small"
        data-testid="productos-filtro-todos"
        @click="filtro = 'todos'"
      >
        Todos ({{ productos.length }})
      </v-btn>
      <v-btn
        :variant="filtro === 'disponibles' ? 'flat' : 'outlined'"
        color="primary"
        size="small"
        data-testid="productos-filtro-disponibles"
        @click="filtro = 'disponibles'"
      >
        Disponibles
      </v-btn>
    </div>

    <v-progress-linear v-if="cargando" indeterminate color="primary" data-testid="productos-loading" />

    <v-alert v-if="error" type="error" class="mb-4" data-testid="productos-error">
      {{ error }}
      <template #append>
        <v-btn variant="text" @click="cargarTodas()">Reintentar</v-btn>
      </template>
    </v-alert>

    <v-alert
      v-if="!cargando && productosFiltrados.length === 0 && !error"
      class="pa-6 text-center"
      data-testid="productos-empty"
    >
      <p class="text-h6 mb-4">
        {{
          filtro === 'disponibles'
            ? 'No hay productos disponibles'
            : 'No hay productos todavía'
        }}
      </p>
      <p class="mb-4">Creá productos desde el Catálogo para empezar a vender.</p>
      <v-btn color="primary" :href="'/productos/preparaciones'" data-testid="productos-ir-recetas">
        Ir a Preparaciones
      </v-btn>
    </v-alert>

    <v-row v-if="productosFiltrados.length > 0" data-testid="productos-grid">
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
          :nombre-receta="recetas.find((r) => r.id === producto.receta_id)?.nombre ?? 'Receta'"
          modo="catalogo"
          @agregar="alAgregar"
          @editar="abrirEditar"
          @toggle="toggleDisponible"
          @eliminar="abrirEliminar"
        />
      </v-col>
    </v-row>

    <v-dialog
      :model-value="dialogo.tipo === 'crear' || dialogo.tipo === 'editar'"
      max-width="600"
      @update:model-value="(v) => { if (!v) cerrarDialogo() }"
    >
      <v-card>
        <v-card-title>
          {{ dialogo.tipo === 'editar' ? 'Editar producto' : 'Nuevo producto' }}
        </v-card-title>
        <v-card-text>
          <ProductoForm
            :valores-iniciales="editValores"
            :recetas="recetaOptions"
            :receta-id-inicial="recetaIdInicial"
            @submit="manejarSubmit"
            @cancel="cerrarDialogo"
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog
      :model-value="dialogo.tipo === 'eliminar'"
      max-width="400"
      @update:model-value="(v) => { if (!v) cerrarDialogo() }"
    >
      <v-card v-if="dialogo.tipo === 'eliminar'">
        <v-card-title>¿Eliminar este producto?</v-card-title>
        <v-card-text>
          Si tiene ventas registradas no se podrá eliminar.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="cerrarDialogo">Cancelar</v-btn>
          <v-btn color="error" data-testid="productos-confirmar-eliminar" @click="confirmarEliminar">
            Eliminar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
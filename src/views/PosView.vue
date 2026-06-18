<script setup lang="ts">
// REQ-POS-7, REQ-POS-14, REQ-POS-15, REQ-POS-16, REQ-POS-20,
// REQ-POS-24, REQ-POS-25, REQ-POS-28, REQ-POS-39, REQ-POS-46,
// REQ-POS-49, REQ-POS-54, REQ-POS-55: POS main view.
//
// Wires useProductos + useVentas + useEvents. 4-state handling
// (loading/error/empty/data per REQ-POS-49). Requires evento
// en_curso selected; without it, surfaces the no-evento guard.
// Carrito panel + product grid + registrar venta flow.
//
// Online status chip (REQ-POS-49: cross-slice visibility).
import { computed, onMounted, ref, watch } from 'vue'

import CarritoPanel from '@/components/business/CarritoPanel.vue'
import ProductoCardGrid from '@/components/business/ProductoCardGrid.vue'
import RegistrarVentaDialog from '@/components/business/RegistrarVentaDialog.vue'
import { useEvents } from '@/composables/useEvents'
import { useProductos } from '@/composables/useProductos'
import { useRecipes } from '@/composables/useRecipes'
import { useVentas } from '@/composables/useVentas'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import type { Producto, RecetaConIngredientes } from '@/types'

const { productos, cargando, error, cargarTodas } = useProductos()
const { recetas, cargarTodas: cargarRecetas } = useRecipes()
const { carrito, totalCarrito, eventoEnCurso, agregarAlCarrito, vaciarCarrito, registrarVenta } =
  useVentas()
const { cargarTodas: cargarEventos } = useEvents()
const { online } = useOnlineStatus()

const busqueda = ref('')
const dialogoRegistrarAbierto = ref(false)

const productosComoArray = computed<Producto[]>(() => productos.value as Producto[])
const recetasComoArray = computed<RecetaConIngredientes[]>(
  () => recetas.value as RecetaConIngredientes[],
)

// CargarEventos ensures eventoEnCurso is computed. The view fetches
// eventos independently so the guard works even if the user lands
// on /pos without first visiting /eventos.
onMounted(async () => {
  await cargarEventos()
  await cargarTodas()
  if (recetas.value.length === 0) await cargarRecetas()
})

// Reactive: cuando se carga el evento, refrescar ventas de ese evento.
// Mantener la lista en memoria aunque el cart ya provee la fuente de
// verdad del día.
watch(
  () => eventoEnCurso.value?.id,
  async (id) => {
    if (!id) return
    // Ventas no se carga aquí para evitar doble fetch — el cart es
    // la fuente de verdad en v1. Listamos ventas vía store si lo
    // necesitamos en el futuro.
  },
)

function buscarNombre(productoId: string): string {
  const producto = productos.value.find((p) => p.id === productoId)
  if (!producto) return 'Receta'
  return recetas.value.find((r) => r.id === producto.receta_id)?.nombre ?? 'Receta'
}

function manejarAgregar(productoId: string) {
  const producto = productos.value.find((p) => p.id === productoId)
  if (!producto) return
  agregarAlCarrito(productoId, buscarNombre(productoId), producto.precio_venta)
}

function abrirDialogoRegistrar() {
  if (carrito.value.length === 0) return
  dialogoRegistrarAbierto.value = true
}

async function confirmarRegistrar(metodoPago: 'efectivo' | 'transferencia' | 'tarjeta' | 'mixto') {
  await registrarVenta(metodoPago)
  dialogoRegistrarAbierto.value = false
}

function reintentar() {
  cargarTodas()
}
</script>

<template>
  <v-container>
    <div class="d-flex align-center justify-space-between mb-4">
      <h1 data-testid="pos-titulo">POS</h1>
      <v-chip
        :color="online ? 'success' : 'error'"
        size="small"
        data-testid="pos-online"
      >
        {{ online ? 'En línea' : 'Sin conexión' }}
      </v-chip>
    </div>

    <!-- REQ-POS-16 / REQ-POS-39: no evento en_curso guard -->
    <v-alert
      v-if="!eventoEnCurso"
      type="warning"
      class="mb-4"
      data-testid="pos-sin-evento"
    >
      <p class="text-h6 mb-2">No hay un evento en curso</p>
      <p class="mb-3">Para registrar ventas primero activá un evento en /eventos.</p>
      <v-btn color="primary" :href="'/eventos'" data-testid="pos-ir-eventos">
        Ir a Eventos
      </v-btn>
    </v-alert>

    <template v-else>
      <!-- REQ-POS-23: search input. Plain HTML <input> to avoid Vuetify
           v-text-field's injectDefaults dependency in test mounts
           (the search field is read-only UX, not a complex form). -->
      <div class="mb-4">
        <input
          v-model="busqueda"
          placeholder="Buscar producto"
          data-testid="pos-buscar"
          style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px"
        />
      </div>

      <!-- REQ-POS-49: loading state -->
      <v-progress-linear
        v-if="cargando"
        indeterminate
        color="primary"
        class="mb-2"
        data-testid="pos-cargando"
      />

      <!-- REQ-POS-49: error state -->
      <v-alert
        v-if="error && !cargando"
        type="error"
        class="mb-4"
        data-testid="pos-error"
      >
        {{ error }}
        <template #append>
          <v-btn variant="text" @click="reintentar">Reintentar</v-btn>
        </template>
      </v-alert>

      <v-row v-if="!cargando && !error">
        <v-col cols="12" md="8" data-testid="pos-grid-col">
          <ProductoCardGrid
            :productos="productosComoArray"
            :recetas="recetasComoArray"
            :busqueda="busqueda"
            @agregar="manejarAgregar"
          />
        </v-col>
        <v-col cols="12" md="4" data-testid="pos-cart-col">
          <CarritoPanel
            :carrito="carrito"
            :total="totalCarrito"
            @registrar-venta="abrirDialogoRegistrar"
            @vaciar="vaciarCarrito"
          />
        </v-col>
      </v-row>
    </template>

    <RegistrarVentaDialog
      v-if="eventoEnCurso && dialogoRegistrarAbierto"
      :model-value="dialogoRegistrarAbierto"
      :total="totalCarrito"
      :evento="eventoEnCurso"
      @update:model-value="(v) => { dialogoRegistrarAbierto = v }"
      @confirmar="confirmarRegistrar"
    />
  </v-container>
</template>
<script setup lang="ts">
// REQ-POS-7, REQ-POS-14, REQ-POS-15, REQ-POS-16, REQ-POS-20,
// REQ-POS-24, REQ-POS-25, REQ-POS-28, REQ-POS-39, REQ-POS-40,
// REQ-POS-46, REQ-POS-49, REQ-POS-54, REQ-POS-55: POS main view.
//
// Wires useProductos + useVentas + useEvents + useGastosImprevistos.
// 4-state handling (loading/error/empty/data per REQ-POS-49).
// Requires evento en_curso selected; without it, surfaces the
// no-evento guard. Carrito panel + product grid + registrar venta
// flow + collapsible Imprevistos section (REQ-POS-40 — deferred
// from PR3 so the cierre card has the same data source).
//
// Online status chip (REQ-POS-49: cross-slice visibility).
import { computed, onMounted, ref } from 'vue'

import CarritoPanel from '@/components/business/CarritoPanel.vue'
import GastoImprevistoForm from '@/components/business/GastoImprevistoForm.vue'
import GastoImprevistoListItem from '@/components/business/GastoImprevistoListItem.vue'
import ProductoCardGrid from '@/components/business/ProductoCardGrid.vue'
import RegistrarVentaDialog from '@/components/business/RegistrarVentaDialog.vue'
import { useEvents } from '@/composables/useEvents'
import { useGastosImprevistos } from '@/composables/useGastosImprevistos'
import { useProductos } from '@/composables/useProductos'
import { useRecipes } from '@/composables/useRecipes'
import { useVentas } from '@/composables/useVentas'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import type { GastoImprevistoInput, Producto, RecetaConIngredientes } from '@/types'

const { productos, cargando, error, cargarTodas } = useProductos()
const { recetas, cargarTodas: cargarRecetas } = useRecipes()
const { carrito, totalCarrito, eventoEnCurso, agregarAlCarrito, vaciarCarrito, registrarVenta } =
  useVentas()
const { cargarTodas: cargarEventos } = useEvents()
const {
  gastosPorEvento: gastosImprevistosPorEvento,
  cargarPorEvento: cargarImprevistos,
  crear: crearImprevisto,
  eliminar: eliminarImprevisto,
  totalPorEvento: totalImprevistosPorEvento,
} = useGastosImprevistos()
const { online } = useOnlineStatus()

const imprevistosAbierto = ref(false)
const dialogoCrearImprevisto = ref(false)

const busqueda = ref('')
const dialogoRegistrarAbierto = ref(false)

const productosComoArray = computed<Producto[]>(() => productos.value as Producto[])
const recetasComoArray = computed<RecetaConIngredientes[]>(
  () => recetas.value as RecetaConIngredientes[],
)

// CargarEventos ensures eventoEnCurso is computed. The view fetches
// eventos independientemente so the guard works even if the user lands
// on /pos without first visiting /eventos.
onMounted(async () => {
  await cargarEventos()
  await cargarTodas()
  if (recetas.value.length === 0) await cargarRecetas()
})

// REQ-POS-40: cargar los imprevistos del evento en curso cuando el
// usuario expande la sección colapsable. Lazy load keeps the initial
// mount fast and avoids extra Supabase calls when the user never
// opens the section.
async function alExpandirImprevistos() {
  if (!eventoEnCurso.value) return
  if (!gastosImprevistosPorEvento.value.has(eventoEnCurso.value.id)) {
    await cargarImprevistos(eventoEnCurso.value.id)
  }
}

const listaImprevistos = computed(() =>
  eventoEnCurso.value
    ? (gastosImprevistosPorEvento.value.get(eventoEnCurso.value.id) ?? [])
    : [],
)
const totalImprevistos = computed(() =>
  eventoEnCurso.value ? totalImprevistosPorEvento(eventoEnCurso.value.id).value : 0,
)

async function manejarSubmitImprevisto(input: GastoImprevistoInput) {
  if (!eventoEnCurso.value) return
  await crearImprevisto({
    evento_id: eventoEnCurso.value.id,
    monto: input.monto,
    motivo: input.motivo,
    categoria: input.categoria ?? 'otro',
  })
  dialogoCrearImprevisto.value = false
}

async function manejarEliminarImprevisto(id: string) {
  return eliminarImprevisto(id)
}

function toggleImprevistos() {
  imprevistosAbierto.value = !imprevistosAbierto.value
  if (imprevistosAbierto.value) alExpandirImprevistos()
}

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

      <!-- REQ-POS-40: collapsible Gastos Imprevistos de esta feria.
           Collapsed by default so the grid + cart stay front-and-center;
           expanding reveals the CRUD list + total. -->
      <v-card class="mt-4" data-testid="pos-imprevistos">
        <v-card-title
          class="d-flex align-center"
          data-testid="pos-imprevistos-titulo"
          @click="toggleImprevistos"
        >
          <v-icon class="mr-2">{{ imprevistosAbierto ? 'mdi-chevron-down' : 'mdi-chevron-right' }}</v-icon>
          <span>Gastos imprevistos de esta feria</span>
          <v-spacer />
          <v-chip size="small" data-testid="pos-imprevistos-total">
            Total: ${{ totalImprevistos.toFixed(2) }}
          </v-chip>
        </v-card-title>
        <v-expand-transition>
          <div v-show="imprevistosAbierto">
            <v-card-text>
              <v-list v-if="listaImprevistos.length > 0" data-testid="pos-imprevistos-lista">
                <GastoImprevistoListItem
                  v-for="gasto in listaImprevistos"
                  :key="gasto.id"
                  :gasto="gasto"
                  @eliminar="manejarEliminarImprevisto"
                />
              </v-list>
              <p
                v-else
                class="text-medium-emphasis"
                data-testid="pos-imprevistos-empty"
              >
                Sin imprevistos todavía.
              </p>
              <v-btn
                color="primary"
                size="small"
                prepend-icon="mdi-plus"
                class="mt-2"
                data-testid="pos-imprevistos-nuevo"
                @click="dialogoCrearImprevisto = true"
              >
                Nuevo imprevisto
              </v-btn>
            </v-card-text>
          </div>
        </v-expand-transition>
      </v-card>
    </template>

    <v-dialog
      v-model="dialogoCrearImprevisto"
      max-width="600"
      data-testid="pos-imprevistos-dialogo"
    >
      <v-card>
        <v-card-title>Nuevo gasto imprevisto</v-card-title>
        <v-card-text>
          <GastoImprevistoForm
            :editable="true"
            @submit="manejarSubmitImprevisto"
            @cancel="dialogoCrearImprevisto = false"
          />
        </v-card-text>
      </v-card>
    </v-dialog>

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
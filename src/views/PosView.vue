<script setup lang="ts">
// REQ-POS-7, REQ-POS-14, REQ-POS-15, REQ-POS-16, REQ-POS-20,
// REQ-POS-24, REQ-POS-25, REQ-POS-28, REQ-POS-39, REQ-POS-40,
// REQ-POS-46, REQ-POS-49, REQ-POS-54, REQ-POS-55,
// REQ-FIN-28, REQ-FIN-29, REQ-FIN-30, REQ-FIN-32 (PR-2b POS integration),
// REQ-CON-8 (PR-2),
// REQ-POS-CAMBIO-1..4, REQ-POS-COMPROBANTE-1..3, REQ-POS-HOY-1..4,
// REQ-POS-57, REQ-POS-58 (pos-redesign):
//
// POS main view. Wires useProductos + useVentas + useEvents +
// useGastosImprevistos + usePreciosEvento + useEventoProductosStore.
//
// PR-2b changes:
//   - The product grid is sourced from `usePreciosEvento(eventoEnCurso)`,
//     filtered by `incluido = true` AND `costo_unitario > 0`
//     (computable from the receta). Products whose receta has no
//     ingredients are excluded — they would render as $0 and the
//     operator can't sell them (REQ-FIN-30).
//   - The empty state for "no productos configured for this evento"
//     surfaces a `Configurar productos` button that routes to
//     `/eventos/:id/productos` (REQ-FIN-30).
//   - A `Margen: {evento.margen_ganancia * 100}%` badge reflects the
//     active evento's default margin (REQ-FIN-29).
//   - `agregarAlCarrito` calls the store with (productoId, 1) — the
//     store derives precio + costo + margen via usePreciosEvento.
//   - The PR-2b event-cerrado guard is the existing EVENTO_CERRADO
//     path: when eventoEnCurso is null and a cerrado evento exists,
//     `useVentas().registrarVenta` short-circuits before reaching
//     this view (REQ-FIN-32, REQ-POS-39).
//
// PR-2 (REQ-CON-8): each product card surfaces a ContribucionBadge
// with the per-producto monetary contribution. The view builds a
// map<productoId, number> from `usePreciosEvento.contribucionParaProducto`
// and forwards it to ProductoCardGrid, which passes each value to
// the corresponding ProductoCard.
//
// pos-redesign (REQ-POS-58): when VITE_FLAG_POS_REDESIGN === 'true',
// the view also:
//   - Mounts ResumenVentasHoy (REQ-POS-HOY-1, parallel with productos
//     via Promise.all).
//   - Opens ComprobanteVentaDialog after a successful sale (REQ-POS-COMPROBANTE-1,
//     REQ-POS-14 widened). The comprobante carries the just-created
//     venta row (with comprobante_numero + monto_recibido + cambio).
// When the flag is off (default), the new components are NOT
// rendered — the legacy surface stays untouched.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import ComprobanteVentaDialog from '@/components/business/ComprobanteVentaDialog.vue'
import CarritoPanel from '@/components/business/CarritoPanel.vue'
import GastoImprevistoForm from '@/components/business/GastoImprevistoForm.vue'
import GastoImprevistoListItem from '@/components/business/GastoImprevistoListItem.vue'
import ProductoCardGrid from '@/components/business/ProductoCardGrid.vue'
import RegistrarVentaDialog from '@/components/business/RegistrarVentaDialog.vue'
import ResumenVentasHoy from '@/components/business/ResumenVentasHoy.vue'
import { useEvents } from '@/composables/useEvents'
import { useGastosImprevistos } from '@/composables/useGastosImprevistos'
import { usePreciosEvento } from '@/composables/usePreciosEvento'
import { useProductos } from '@/composables/useProductos'
import { useRecipes } from '@/composables/useRecipes'
import { useVentas } from '@/composables/useVentas'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import type {
  GastoImprevistoInput,
  MetodoPago,
  Producto,
  RecetaConIngredientes,
  VentaConItems,
} from '@/types'

const router = useRouter()
// pos-redesign (REQ-POS-57, REQ-POS-58): build-time feature flag.
// Default off — operators opt in per environment via .env.local.
const FLAG_POS_REDESIGN = import.meta.env.VITE_FLAG_POS_REDESIGN === 'true'

const { cargando: cargandoProductos, error: errorProductos, cargarTodas } = useProductos()
const { recetas, cargarTodas: cargarRecetas } = useRecipes()
const {
  carrito,
  ventas,
  cargando: cargandoVentas,
  totalCarrito,
  eventoEnCurso,
  agregarAlCarrito,
  vaciarCarrito,
  registrarVenta,
  cargarPorEvento,
  actualizarCantidad,
  quitarDelCarrito,
} = useVentas()
const { cargarTodas: cargarEventos } = useEvents()
const {
  gastosPorEvento: gastosImprevistosPorEvento,
  cargarPorEvento: cargarImprevistos,
  crear: crearImprevisto,
  eliminar: eliminarImprevisto,
  totalPorEvento: totalImprevistosPorEvento,
} = useGastosImprevistos()
const { online } = useOnlineStatus()

// REQ-FIN-28, REQ-FIN-29: the POS grid source. Reactive on the
// active evento id — switching eventos re-evaluates without a manual
// refresh. `productosDelEvento` already filters `incluido = true`; we
// additionally filter out rows whose costo_unitario is 0 (receta has
// no ingredients) so the POS never shows unsellable $0 cards.
const { productosDelEvento, contribucionParaProducto } = usePreciosEvento(
  () => eventoEnCurso.value?.id ?? null,
)
const productosParaGrid = computed(() =>
  productosDelEvento.value.filter((ep) => ep.costo_unitario > 0),
)

// REQ-CON-8: build a productId → contribution map for the grid.
// Reads the new `contribucionParaProducto` getter from usePreciosEvento
// for each producto in the grid so the ProductoCardGrid can render
// each ContribucionBadge inline.
const contribucionesPorProducto = computed<Record<string, number>>(() => {
  const mapa: Record<string, number> = {}
  for (const ep of productosParaGrid.value) {
    const contrib = contribucionParaProducto.value(ep.producto_id)
    if (contrib !== null) mapa[ep.producto_id] = contrib
  }
  return mapa
})
// ProductoCardGrid is a presentational component that takes
// Producto[] + RecetaConIngredientes[]; map the joined shape into
// the legacy types so we keep the existing card surface without a
// breaking change to ProductoCardGrid (REQ-FIN-29).
const productosMapeados = computed<Producto[]>(() =>
  productosParaGrid.value.map((ep) => ({
    id: ep.producto_id,
    receta_id: ep.receta_id,
    precio_venta: ep.precio_final,
    disponible: true,
    orden: 0,
    descripcion: null,
    icono: ep.producto_icono,
    created_at: ep.created_at,
    updated_at: ep.updated_at,
  })),
)
const recetasParaGrid = computed<RecetaConIngredientes[]>(() =>
  productosParaGrid.value.map((ep) => ({
    id: ep.receta_id,
    nombre: ep.producto_nombre,
    descripcion: null,
    rendimiento_unidades: 1,
    notas: null,
    ingredientes: [],
    created_at: ep.created_at,
    updated_at: ep.updated_at,
  })),
)

// REQ-FIN-30: empty-state gating. Empty means "the active evento has
// no included productos with computable costo" — either the operator
// never configured the evento, or every producto is excluded / has no
// receta cost. We surface the configurator instead of a generic empty.
const hayProductosParaVender = computed(() => productosParaGrid.value.length > 0)

// REQ-FIN-29: badge text. evento.margen_ganancia is the default
// margin (nullable in DB; falls back to "—" when unset).
const margenBadge = computed(() => {
  const m = eventoEnCurso.value?.margen_ganancia
  if (m === null || m === undefined) return null
  return `${Math.round(m * 100)}%`
})

const imprevistosAbierto = ref(false)
const dialogoCrearImprevisto = ref(false)

const busqueda = ref('')
const dialogoRegistrarAbierto = ref(false)

// pos-redesign (REQ-POS-COMPROBANTE-1, REQ-POS-14): the just-registered
// venta opens the receipt dialog. Held in a ref so the template's
// v-if can mount the dialog reactively.
const comprobanteVenta = ref<VentaConItems | null>(null)
const comprobanteAbierto = ref(false)

// CargarEventos ensures eventoEnCurso is computed. The view fetches
// eventos, productos, and recetas independently so the guard works
// even if the user lands on /pos without first visiting /eventos or
// /productos. usePreciosEvento (PR-2b) joins all three to compute
// precio_final + costo_unitario for the POS grid.
//
// pos-redesign (REQ-POS-HOY-1): when the flag is on, ventas are
// fetched in parallel with productos — the grid is never blocked by
// the ventas fetch (REQ-POS-HOY-4).
onMounted(async () => {
  await cargarEventos()
  const catalogo = cargarTodas()
  if (FLAG_POS_REDESIGN && eventoEnCurso.value) {
    await Promise.all([catalogo, cargarPorEvento(eventoEnCurso.value.id)])
  } else {
    await catalogo
  }
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

// REQ-FIN-31 (PR-2b): delegate everything to the store. The store
// snapshots precio + costo + margen from usePreciosEvento so we don't
// re-read the catalogo or evento_productos here.
function manejarAgregar(productoId: string) {
  agregarAlCarrito(productoId, 1)
}

function irAConfigurarProductos() {
  if (!eventoEnCurso.value) return
  router.push(`/eventos/${eventoEnCurso.value.id}/productos`)
}

function abrirDialogoRegistrar() {
  if (carrito.value.length === 0) return
  dialogoRegistrarAbierto.value = true
}

// pos-redesign (REQ-POS-CAMBIO-3, REQ-POS-COMPROBANTE-1): the dialog
// now emits an object with metodoPago + optional montoRecibido. We
// forward montoRecibido to the store and, on success, open the
// comprobante dialog (REQ-POS-COMPROBANTE-1, REQ-POS-14 widened).
async function confirmarRegistrar(payload: {
  metodoPago: MetodoPago
  montoRecibido?: number | null
}) {
  const res = await registrarVenta(payload.metodoPago, payload.montoRecibido ?? undefined)
  dialogoRegistrarAbierto.value = false
  if (FLAG_POS_REDESIGN && res.data && !res.error) {
    comprobanteVenta.value = res.data
    comprobanteAbierto.value = true
  }
}

function cerrarComprobante() {
  comprobanteAbierto.value = false
  comprobanteVenta.value = null
}

function reintentar() {
  cargarTodas()
}
</script>

<template>
  <v-container>
    <div class="d-flex align-center justify-space-between mb-4">
      <h1 data-testid="pos-titulo">POS</h1>
      <div class="d-flex align-center ga-2">
        <v-chip
          v-if="margenBadge"
          size="small"
          color="primary"
          variant="tonal"
          data-testid="pos-margen-badge"
        >
          Margen: {{ margenBadge }}
        </v-chip>
        <v-chip
          :color="online ? 'success' : 'error'"
          size="small"
          data-testid="pos-online"
        >
          {{ online ? 'En línea' : 'Sin conexión' }}
        </v-chip>
      </div>
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
      <!-- pos-redesign (REQ-POS-58, REQ-POS-HOY-1..4): per-metodo_pago
           totals panel, gated by the feature flag. -->
      <ResumenVentasHoy
        v-if="FLAG_POS_REDESIGN"
        :ventas="ventas"
        :cargando="cargandoVentas"
      />

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

      <!-- REQ-POS-49: loading state. PR-2b keeps the productos store
           fetch as a hint (cargando); the grid is driven by
           usePreciosEvento. -->
      <v-progress-linear
        v-if="cargandoProductos"
        indeterminate
        color="primary"
        class="mb-2"
        data-testid="pos-cargando"
      />

      <!-- REQ-POS-49: error state from the catalogo fetch. -->
      <v-alert
        v-if="errorProductos && !cargandoProductos"
        type="error"
        class="mb-4"
        data-testid="pos-error"
      >
        {{ errorProductos }}
        <template #append>
          <v-btn variant="text" @click="reintentar">Reintentar</v-btn>
        </template>
      </v-alert>

      <!-- REQ-FIN-30: empty-state — direct the operator to the
           EventoProductosView instead of showing a blank grid. -->
      <v-alert
        v-if="!hayProductosParaVender && !cargandoProductos && !errorProductos"
        type="info"
        class="mb-4"
        data-testid="pos-evento-sin-productos"
      >
        <p class="text-h6 mb-2">No hay productos configurados para este evento</p>
        <p class="mb-3">Activá los productos y los márgenes antes de empezar a vender.</p>
        <v-btn
          color="primary"
          data-testid="pos-configurar-productos"
          @click="irAConfigurarProductos"
        >
          Configurar productos
        </v-btn>
      </v-alert>

      <v-row v-else-if="!cargandoProductos && !errorProductos">
        <v-col cols="12" md="8" data-testid="pos-grid-col">
          <ProductoCardGrid
            :productos="productosMapeados"
            :recetas="recetasParaGrid"
            :busqueda="busqueda"
            :contribuciones-por-producto="contribucionesPorProducto"
            @agregar="manejarAgregar"
          />
        </v-col>
        <v-col cols="12" md="4" data-testid="pos-cart-col">
          <CarritoPanel
            :carrito="carrito"
            :total="totalCarrito"
            @registrar-venta="abrirDialogoRegistrar"
            @vaciar="vaciarCarrito"
            @update-cantidad="actualizarCantidad"
            @eliminar="quitarDelCarrito"
          />
        </v-col>
      </v-row>
    </template>

    <!-- REQ-POS-40: collapsible Gastos Imprevistos de esta feria.
         Always rendered (even with no evento) so the section is
         visible — collapsing reveals the CRUD list + total.
         When no evento en_curso exists, the list stays empty and the
         add button is disabled (evento is the foreign key target). -->
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
              {{ eventoEnCurso ? 'Sin imprevistos todavía.' : 'Activá un evento para registrar imprevistos.' }}
            </p>
            <v-btn
              color="primary"
              size="small"
              prepend-icon="mdi-plus"
              class="mt-2"
              :disabled="!eventoEnCurso"
              data-testid="pos-imprevistos-nuevo"
              @click="dialogoCrearImprevisto = true"
            >
              Nuevo imprevisto
            </v-btn>
          </v-card-text>
        </div>
      </v-expand-transition>
    </v-card>

    <v-dialog
      v-model="dialogoCrearImprevisto"
      max-width="600"
      data-testid="pos-imprevistos-dialogo"
    >
      <v-card>
        <v-card-title>Nuevo gasto imprevisto</v-card-title>
        <v-card-text>
          <GastoImprevistoForm
            :editable="!!eventoEnCurso"
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

    <!-- pos-redesign (REQ-POS-COMPROBANTE-1): receipt dialog opens
         after a successful sale (gated by the feature flag). -->
    <ComprobanteVentaDialog
      v-if="FLAG_POS_REDESIGN && comprobanteVenta && comprobanteAbierto"
      :model-value="comprobanteAbierto"
      :venta="comprobanteVenta"
      :evento="eventoEnCurso"
      @update:model-value="cerrarComprobante"
    />
  </v-container>
</template>

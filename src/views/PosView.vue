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
import { computed, onActivated, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import CheckoutButton from '@/components/pos/CheckoutButton.vue'
import PaymentSelector from '@/components/pos/PaymentSelector.vue'
import PosModeBanner from '@/components/pos/PosModeBanner.vue'
import ProductGrid from '@/components/pos/ProductGrid.vue'
import ComprobanteVentaDialog from '@/components/business/ComprobanteVentaDialog.vue'
import CarritoPanel from '@/components/business/CarritoPanel.vue'
import EditarVentaDialog from '@/components/business/EditarVentaDialog.vue'
import GastoImprevistoForm from '@/components/business/GastoImprevistoForm.vue'
import GastoImprevistoListItem from '@/components/business/GastoImprevistoListItem.vue'
import HistorialVentasEventoDialog from '@/components/business/HistorialVentasEventoDialog.vue'
import ProductoCardGrid from '@/components/business/ProductoCardGrid.vue'
import RegistrarVentaDialog from '@/components/business/RegistrarVentaDialog.vue'
import ResumenVentasHoy from '@/components/business/ResumenVentasHoy.vue'
import { useEvents } from '@/composables/useEvents'
import { useGastosImprevistos } from '@/composables/useGastosImprevistos'
import { usePosMode } from '@/composables/usePosMode'
import { usePreciosEvento } from '@/composables/usePreciosEvento'
import { useProductos } from '@/composables/useProductos'
import { useRecipes } from '@/composables/useRecipes'
import { useVentas } from '@/composables/useVentas'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { estadoEsEditable } from '@/utils/estado'
import { logInfo } from '@/utils/logger'
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
  error: errorVentas,
  totalCarrito,
  paymentMethod,
  eventoEnCurso,
  agregarAlCarrito,
  vaciarCarrito,
  setPaymentMethod,
  registrarVenta,
  corregirVenta,
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

// mobile-ux-redesign Phase 3: POS mode flag for simplified vs full.
const { isSimplifiedMode } = usePosMode()

// Simplified mode: "Cobrar" is enabled only when cart has items AND
// a payment method has been selected.
const cobrarHabilitado = computed(
  () => carrito.value.length > 0 && paymentMethod.value !== null,
)

// Simplified-mode checkout: select payment and call registrarVenta.
async function manejarCheckoutSimplificado() {
  if (!cobrarHabilitado.value) return
  const metodo = paymentMethod.value as MetodoPago | null
  if (!metodo) return
  await registrarVenta(metodo)
}

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

// mobile-ux-redesign Phase 3: simplified POS grid uses ProductGrid
// which expects { id, nombre, precio, imagen } shape.
const productosSimplificados = computed(() =>
  productosParaGrid.value.map((ep) => ({
    id: ep.producto_id,
    nombre: ep.producto_nombre,
    precio: ep.precio_final,
    imagen: null,
  })),
)

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
    color: ep.producto_color,
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

// Event sales history (REQ-POS-HISTORIAL-1..3): operator-accessible
// detailed view of every venta for the active evento. Gated by the
// same feature flag as the rest of the pos-redesign surface.
const historialAbierto = ref(false)

// REQ-POS-CORRECCION-1..3: edit/correction flow. The history dialog
// surfaces an "Editar" button per row when the evento is editable;
// clicking it mounts the EditarVentaDialog with the venta's current
// state. On apply, we call useVentas().corregirVenta which writes the
// audit row + updates the live venta.
const ventaEnEdicion = ref<VentaConItems | null>(null)
const dialogoEdicionAbierto = ref(false)

// Productos disponibles for the EditarVentaDialog product-name lookup.
// We map the evento_productos shape into the minimal {id, nombre,
// precio_venta} the dialog needs.
const productosParaEdicion = computed(() =>
  productosParaGrid.value.map((ep) => ({
    id: ep.producto_id,
    nombre: ep.producto_nombre,
    precio_venta: ep.precio_final,
  })),
)

function abrirEdicion(venta: VentaConItems): void {
  ventaEnEdicion.value = venta
  dialogoEdicionAbierto.value = true
}

async function aplicarCorreccion(payload: {
  ventaId: string
  nuevoTotal: number
  nuevoMetodoPago: MetodoPago
  nuevoMontoRecibido: number | null
  nuevosItems: Array<{
    producto_id: string
    cantidad: number
    precio_unitario: number
    subtotal: number
    costo_unitario?: number | null
    margen_aplicado?: number | null
    evento_producto_id?: string | null
  }>
  motivo: string
}): Promise<void> {
  const venta = ventas.value.find((v) => v.id === payload.ventaId)
  if (!venta) return
  // Issue: edit dialog closes on correction failure.
  // Only close the dialog on success — on failure the operator
  // loses motivo/items/payment edits otherwise. The store still
  // surfaces the failure as an error toast.
  const res = await corregirVenta({
    venta,
    nuevoTotal: payload.nuevoTotal,
    nuevoMetodoPago: payload.nuevoMetodoPago,
    nuevoMontoRecibido: payload.nuevoMontoRecibido,
    nuevosItems: payload.nuevosItems,
    motivo: payload.motivo,
  })
  if (res.error) return
  dialogoEdicionAbierto.value = false
  ventaEnEdicion.value = null
}

// CargarEventos ensures eventoEnCurso is computed. The view fetches
// eventos, productos, and recetas independently so the guard works
// even if the user lands on /pos without first visiting /eventos or
// /productos. usePreciosEvento (PR-2b) joins all three to compute
// precio_final + costo_unitario for the POS grid.
//
// pos-redesign (REQ-POS-HOY-1): when the flag is on, ventas are
// fetched in parallel with productos — the grid is never blocked by
// the ventas fetch (REQ-POS-HOY-4).
async function cargarDatosPOS() {
  await cargarEventos()
  const catalogo = cargarTodas()
  if (FLAG_POS_REDESIGN && eventoEnCurso.value) {
    await Promise.all([catalogo, cargarPorEvento(eventoEnCurso.value.id)])
  } else {
    await catalogo
  }
  if (recetas.value.length === 0) await cargarRecetas()
}

onMounted(cargarDatosPOS)
// onActivated: recarga productos/iconos/colores cuando el componente
// se reactiva (si esta dentro de KeepAlive o se navega de vuelta).
// Esto asegura que los cambios hechos en ProductosView se reflejen.
onActivated(cargarDatosPOS)

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

// Review finding #5: history-dialog retry. The dialog surfaces load
// errors with a "Reintentar" button; tapping it re-runs
// cargarPorEvento for the active evento so the operator can recover
// from transient network failures without leaving the POS.
async function reintentarHistorial() {
  if (!eventoEnCurso.value) return
  logInfo('reintentarHistorial', 'retrying history load', {
    eventoId: eventoEnCurso.value.id,
  })
  await cargarPorEvento(eventoEnCurso.value.id)
}
</script>

<template>
  <v-container>
    <!-- mobile-ux-redesign Phase 3: mode banner shows simplified/full -->
    <PosModeBanner />

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
        <!-- pos-redesign (REQ-POS-HISTORIAL-1): operator-accessible
             detailed event sales history. Gated by the same feature
             flag as the rest of the pos-redesign surface. -->
        <v-btn
          v-if="FLAG_POS_REDESIGN && eventoEnCurso"
          size="small"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-history"
          data-testid="pos-historial-btn"
          @click="historialAbierto = true"
        >
          Ver historial
        </v-btn>
        <!-- Gastos imprevistos: acceso rápido con menú desplegable -->
        <v-menu v-if="eventoEnCurso" :close-on-content-click="false" location="bottom end">
          <template #activator="{ props: menuProps }">
            <v-btn
              v-bind="menuProps"
              icon="mdi-cash-remove"
              size="small"
              variant="tonal"
              color="warning"
              data-testid="pos-imprevistos-btn"
            >
              <v-badge
                v-if="totalImprevistos > 0"
                :content="`$${totalImprevistos.toFixed(0)}`"
                color="error"
                inline
              />
            </v-btn>
          </template>
          <v-card min-width="320" max-width="400" data-testid="pos-imprevistos-menu">
            <v-card-title class="d-flex align-center text-body-1">
              <v-icon class="mr-2">mdi-cash-remove</v-icon>
              Gastos imprevistos
              <v-spacer />
              <v-chip size="x-small" data-testid="pos-imprevistos-total">
                ${{ totalImprevistos.toFixed(2) }}
              </v-chip>
            </v-card-title>
            <v-divider />
            <v-card-text class="pa-2" style="max-height: 300px; overflow-y: auto">
              <v-list v-if="listaImprevistos.length > 0" density="compact" data-testid="pos-imprevistos-lista">
                <GastoImprevistoListItem
                  v-for="gasto in listaImprevistos"
                  :key="gasto.id"
                  :gasto="gasto"
                  @eliminar="manejarEliminarImprevisto"
                />
              </v-list>
              <p v-else class="text-medium-emphasis text-center py-4" data-testid="pos-imprevistos-empty">
                Sin imprevistos registrados
              </p>
            </v-card-text>
            <v-divider />
            <v-card-actions>
              <v-btn
                color="primary"
                size="small"
                prepend-icon="mdi-plus"
                block
                data-testid="pos-imprevistos-nuevo"
                @click="dialogoCrearImprevisto = true"
              >
                Nuevo imprevisto
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-menu>
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

      <!-- mobile-ux-redesign Phase 3: Simplified POS mode (active event) -->
      <template v-if="isSimplifiedMode && !cargandoProductos && !errorProductos">
        <v-row>
          <v-col cols="12" md="8">
            <ProductGrid
              :productos="productosSimplificados"
              @add-to-cart="manejarAgregar"
            />
          </v-col>
          <v-col cols="12" md="4">
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
        <v-row class="mt-4">
          <v-col cols="12" md="8">
            <PaymentSelector
              :model-value="paymentMethod"
              @update:model-value="setPaymentMethod"
            />
          </v-col>
        </v-row>
        <v-row class="mt-4">
          <v-col cols="12">
            <CheckoutButton
              :disabled="!cobrarHabilitado"
              :total="totalCarrito"
              @checkout="manejarCheckoutSimplificado"
            />
          </v-col>
        </v-row>
      </template>

      <!-- Full mode: existing ProductoCardGrid + CarritoPanel -->
      <v-row v-else-if="!isSimplifiedMode && !cargandoProductos && !errorProductos">
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

    <!-- pos-redesign (REQ-POS-HISTORIAL-1..3): detailed per-sale
         history dialog for the active evento. Reuses the ventas
         array already loaded by cargarPorEvento. Review finding #5
         forwards the load error + retry so the operator sees a real
         error banner instead of a misleading empty list. -->
    <HistorialVentasEventoDialog
      v-if="FLAG_POS_REDESIGN && eventoEnCurso"
      :model-value="historialAbierto"
      :ventas="ventas"
      :evento="eventoEnCurso"
      :editable="estadoEsEditable(eventoEnCurso.estado)"
      :cargando="cargandoVentas"
      :error="errorVentas"
      @update:model-value="(v) => { historialAbierto = v }"
      @editar="abrirEdicion"
      @reintentar="reintentarHistorial"
    />

    <!-- REQ-POS-CORRECCION-1..3: edit dialog mounts when the operator
         clicks "Editar" in the history dialog. Closes itself on
         success or cancel; the store handles the audit trail and
         the EVENTO_CERRADO guard. -->
    <EditarVentaDialog
      v-if="FLAG_POS_REDESIGN && ventaEnEdicion"
      :model-value="dialogoEdicionAbierto"
      :venta="ventaEnEdicion"
      :productos-disponibles="productosParaEdicion"
      @update:model-value="(v) => { dialogoEdicionAbierto = v }"
      @corregir="aplicarCorreccion"
    />
  </v-container>
</template>

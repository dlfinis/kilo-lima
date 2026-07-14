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
//     `/eventos/:id/gestion` (REQ-FIN-30, event-product-management-refactor).
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
import { useIngredientsStore } from '@/stores/ingredients.store'
import { useRecipesStore } from '@/stores/recipes.store'
import { useEventoProductosStore } from '@/stores/eventoProductos.store'
import { usePosMode } from '@/composables/usePosMode'
import { usePreciosEvento } from '@/composables/usePreciosEvento'
import { useProductos } from '@/composables/useProductos'
import { useRecipes } from '@/composables/useRecipes'
import { useVentas } from '@/composables/useVentas'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { estadoEsEditable } from '@/utils/estado'
import { logInfo } from '@/utils/logger'
import type {
  CategoriaProducto,
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
const epStore = useEventoProductosStore()
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
const {
  cargarTodas: cargarEventos,
  eventos,
  cambiarEstado,
} = useEvents()
const {
  gastosPorEvento: gastosImprevistosPorEvento,
  crear: crearImprevisto,
  eliminar: eliminarImprevisto,
  totalPorEvento: totalImprevistosPorEvento,
} = useGastosImprevistos()
const { online } = useOnlineStatus()

// UX: Planificacion events that can be started from POS.
const eventosPlanificacion = computed(() =>
  eventos.value.filter((e) => e.estado === 'planificacion'),
)

const iniciandoEventoId = ref<string | null>(null)
const errorIniciar = ref<string | null>(null)

async function iniciarEventoDesdePOS(id: string): Promise<void> {
  iniciandoEventoId.value = id
  errorIniciar.value = null
  errorCargaDependencias.value = null
  const res = await cambiarEstado(id, 'en_curso')
  iniciandoEventoId.value = null
  if (res.error) {
    errorIniciar.value = res.error.message
    return
  }
  // Load the dependency chain for the newly-active event so
  // sellable products (evento_productos + ingredients + recetas)
  // appear immediately without a page refresh. Matches the
  // active-event branch of cargarDatosPOS but avoids re-fetching
  // every event and every product.
  await Promise.all([
    epStore.cargarPorEvento(id),
    useIngredientsStore().cargarTodas(),
  ])
  if (recetas.value.length === 0) await cargarRecetas()
  capturarErroresDependencias()
}

// mobile-ux-redesign Phase 3: POS mode flag for simplified vs full.
const { isSimplifiedMode } = usePosMode()

// Simplified mode: "Cobrar" is enabled only when cart has items AND
// a payment method has been selected.
const cobrarHabilitado = computed(
  () => carrito.value.length > 0 && paymentMethod.value !== null,
)

/** UX hint shown below the checkout button when it is disabled. */
const checkoutDisabledHint = computed(() => {
  if (carrito.value.length === 0) return 'Agregar productos al carrito'
  if (paymentMethod.value === null) return 'Seleccionar método de pago'
  return ''
})

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
//
// NOTE: cost/contribution display has been REMOVED from POS cards per
// corrective pass — the POS catalog should be clean (no financial noise).
const { productosDelEvento } = usePreciosEvento(
  () => eventoEnCurso.value?.id ?? null,
)
const productosParaGrid = computed(() =>
  productosDelEvento.value.filter((ep) => ep.costo_unitario > 0),
)

// Filter + sort products by category and ordering. The grid receives
// already-filtered products (no child-side search logic).
const productosParaGridFiltrados = computed(() => {
  let result = productosParaGrid.value

  if (categoriaFiltro.value !== null) {
    result = result.filter((ep) => ep.producto_categoria === categoriaFiltro.value)
  }

  if (ordenamiento.value) {
    const sorted = [...result]
    switch (ordenamiento.value) {
      case 'precio_asc':
        sorted.sort((a, b) => a.precio_final - b.precio_final)
        break
      case 'precio_desc':
        sorted.sort((a, b) => b.precio_final - a.precio_final)
        break
      case 'nombre_asc':
        sorted.sort((a, b) => a.producto_nombre.localeCompare(b.producto_nombre))
        break
      case 'nombre_desc':
        sorted.sort((a, b) => b.producto_nombre.localeCompare(a.producto_nombre))
        break
    }
    result = sorted
  }

  return result
})

// mobile-ux-redesign Phase 3: simplified POS grid uses ProductGrid
// which expects { id, nombre, precio, imagen } shape.
const productosSimplificados = computed(() =>
  productosParaGridFiltrados.value.map((ep) => ({
    id: ep.producto_id,
    nombre: ep.producto_nombre,
    precio: ep.precio_final,
    imagen: null,
    icono: ep.producto_icono,
  })),
)

// ProductoCardGrid is a presentational component that takes
// Producto[] + RecetaConIngredientes[]; map the joined shape into
// the legacy types so we keep the existing card surface without a
// breaking change to ProductoCardGrid (REQ-FIN-29).
const productosMapeados = computed<Producto[]>(() =>
  productosParaGridFiltrados.value.map((ep) => ({
    id: ep.producto_id,
    receta_id: ep.receta_id,
    // catalog-domain-refactor / Slice 3: commercial product identity
    // from evento_productos join (not from receta).
    nombre: ep.producto_nombre,
    categoria: ep.producto_categoria,
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
  productosParaGridFiltrados.value.map((ep) => ({
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

// Track downstream dependency load failures so the UI can
// distinguish "data failed to load" from "no products configured".
// Dependencies are evento_productos (epStore) + ingredients + recetas
// (all required for usePreciosEvento to compute sellable products).
// Checked after full chain resolution in cargarDatosPOS / iniciarEventoDesdePOS.
const errorCargaDependencias = ref<string | null>(null)

function capturarErroresDependencias(): void {
  const partes: string[] = []
  const ingStore = useIngredientsStore()
  const recetasStore = useRecipesStore()
  if (epStore.error) partes.push('productos del evento')
  if (ingStore.error) partes.push('materias primas')
  if (recetasStore.error) partes.push('recetas')
  errorCargaDependencias.value =
    partes.length > 0 ? `Error al cargar: ${partes.join(', ')}` : null
}

// REQ-FIN-30: empty-state gating. Empty means "the active evento has
// no included productos with computable costo" — either the operator
// never configured the evento, or every producto is excluded / has no
// receta cost. We surface the configurator instead of a generic empty.
const hayProductosParaVender = computed(() => productosParaGrid.value.length > 0)

// Only show "no products configured" when the dependency chain loaded
// successfully — a failed epStore/ingredients/recetas load is a data error,
// not a configuration gap.
const mostrarSinProductos = computed(
  () => !hayProductosParaVender.value && !errorCargaDependencias.value,
)

const dialogoCrearImprevisto = ref(false)

// Category + sort filter state (replaces text search bar)
const categoriaFiltro = ref<CategoriaProducto | null>(null)
type Ordenamiento = 'precio_asc' | 'precio_desc' | 'nombre_asc' | 'nombre_desc'
const ordenamiento = ref<Ordenamiento | null>(null)

const CATEGORIAS: { value: CategoriaProducto; label: string }[] = [
  { value: 'dulce', label: 'Dulce' },
  { value: 'salado', label: 'Salado' },
  { value: 'helado', label: 'Helado' },
  { value: 'bebida', label: 'Bebida' },
]

const OPCIONES_ORDENAMIENTO: { value: Ordenamiento; label: string }[] = [
  { value: 'precio_asc', label: 'Precio ↑' },
  { value: 'precio_desc', label: 'Precio ↓' },
  { value: 'nombre_asc', label: 'Alfabético A-Z' },
  { value: 'nombre_desc', label: 'Alfabético Z-A' },
]

const ordenamientoLabel = computed(() => {
  if (!ordenamiento.value) return 'Ordenar'
  return OPCIONES_ORDENAMIENTO.find((o) => o.value === ordenamiento.value)?.label ?? 'Ordenar'
})

const hayFiltrosActivos = computed(
  () => categoriaFiltro.value !== null || ordenamiento.value !== null,
)

function limpiarFiltros() {
  categoriaFiltro.value = null
  ordenamiento.value = null
}

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

// CargarDatosPOS ensures the full dependency chain is loaded so
// usePreciosEvento can compute sellable products even on a cold
// /pos load. The chain is:
//   1. eventos (for eventoEnCurso guard + margen fallback)
//   2. productos catalog + recetas (for name/lookup)
//   3. evento_productos (the join that links evento ↔ producto;
//      without this, usePreciosEvento sees zero rows)
//   4. ingredients (materias primas → costo_unitario computation)
//
// pos-redesign (REQ-POS-HOY-1): when the flag is on, ventas are
// fetched in parallel — the grid is never blocked by the ventas
// fetch (REQ-POS-HOY-4).
async function cargarDatosPOS() {
  await cargarEventos()
  const catalogo = cargarTodas()
  errorCargaDependencias.value = null

  if (eventoEnCurso.value) {
    const cadena = [
      catalogo,
      epStore.cargarPorEvento(eventoEnCurso.value.id),
      useIngredientsStore().cargarTodas(),
    ]
    if (FLAG_POS_REDESIGN) {
      cadena.push(cargarPorEvento(eventoEnCurso.value.id))
    }
    await Promise.all(cadena)
  } else {
    await catalogo
  }
  if (recetas.value.length === 0) await cargarRecetas()
  if (eventoEnCurso.value) {
    capturarErroresDependencias()
  }
}

onMounted(cargarDatosPOS)
// onActivated: recarga productos/iconos/colores cuando el componente
// se reactiva (si esta dentro de KeepAlive o se navega de vuelta).
// Esto asegura que los cambios hechos en ProductosView se reflejen.
onActivated(cargarDatosPOS)

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

// REQ-FIN-31 (PR-2b): delegate everything to the store. The store
// snapshots precio + costo + margen from usePreciosEvento so we don't
// re-read the catalogo or evento_productos here.
function manejarAgregar(productoId: string) {
  agregarAlCarrito(productoId, 1)
}

function irAConfigurarProductos() {
  if (!eventoEnCurso.value) return
  router.push(`/eventos/${eventoEnCurso.value.id}/gestion`)
}

// UX: inline quick-init — bulk-add all catalog products to the
// active evento so the operator can start selling immediately
// without navigating to the configurator (REQ-FIN-30 extended).
const inicializandoCatalogo = ref(false)
const errorInicializarCatalogo = ref<string | null>(null)

async function inicializarProductosDesdeCatalogo(): Promise<void> {
  if (!eventoEnCurso.value) return
  inicializandoCatalogo.value = true
  errorInicializarCatalogo.value = null
  const res = await epStore.inicializarDesdeCatalogo(eventoEnCurso.value.id)
  inicializandoCatalogo.value = false
  if (res.error) {
    errorInicializarCatalogo.value = res.error.message
    return
  }
  // Reload the catalog + recetas + ingredients so usePreciosEvento
  // recomputes costo_unitario for the newly-added rows.
  await cargarTodas()
  if (recetas.value.length === 0) await cargarRecetas()
  if (useIngredientsStore().materiasPrimas.length === 0) {
    await useIngredientsStore().cargarTodas()
  }
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
  <v-container class="px-2">
    <!-- Header: compact operational strip.
         POS heading always visible — smaller when an event is active. -->
    <div class="d-flex align-center justify-space-between mb-2">
      <h1
        :class="eventoEnCurso ? 'text-caption font-weight-bold text-medium-emphasis' : 'text-h5'"
        data-testid="pos-titulo"
      >
        POS
      </h1>
      <div class="d-flex align-center ga-2">
        <v-chip
          v-if="!eventoEnCurso"
          :color="online ? 'success' : 'error'"
          size="x-small"
          variant="tonal"
          data-testid="pos-online"
        >
          {{ online ? 'En línea' : 'Sin conexión' }}
        </v-chip>
      </div>
    </div>

    <!-- Active-event header bar: single tight row with all
         operational context + actions. -->
    <div
      v-if="eventoEnCurso"
      class="pos-context-bar d-flex align-center ga-2 mb-3 py-1 px-3"
      data-testid="pos-evento-activo-panel"
    >
      <v-icon color="success" size="x-small">mdi-play-circle</v-icon>
      <span class="text-caption font-weight-medium">{{ eventoEnCurso.nombre }}</span>
      <span class="text-caption text-medium-emphasis d-none d-sm-inline">{{ eventoEnCurso.fecha }}</span>
      <v-chip
        size="x-small"
        color="success"
        variant="tonal"
        data-testid="pos-evento-activo-estado"
      >
        En curso
      </v-chip>
      <v-spacer />
      <!-- Online indicator inline -->
      <v-icon
        :color="online ? 'success' : 'error'"
        size="10"
        data-testid="pos-online"
        class="d-none d-sm-inline"
      >
        {{ online ? 'mdi-circle' : 'mdi-circle-outline' }}
      </v-icon>
      <!-- pos-redesign history button -->
      <v-btn
        v-if="FLAG_POS_REDESIGN"
        size="x-small"
        variant="text"
        color="primary"
        prepend-icon="mdi-history"
        data-testid="pos-historial-btn"
        @click="historialAbierto = true"
      >
        Historial
      </v-btn>
      <!-- Gastos imprevistos: quick-access menu -->
      <v-menu v-if="eventoEnCurso" :close-on-content-click="false" location="bottom end">
        <template #activator="{ props: menuProps }">
          <v-badge
            v-if="totalImprevistos > 0"
            :content="`$${totalImprevistos.toFixed(0)}`"
            color="error"
          >
            <template #default>
              <v-btn
                v-bind="menuProps"
                size="small"
                variant="text"
                color="warning"
                data-testid="pos-imprevistos-btn"
              >
                <v-icon size="22">mdi-receipt-text-plus</v-icon>
              </v-btn>
            </template>
          </v-badge>
          <v-btn
            v-else
            v-bind="menuProps"
            size="small"
            variant="text"
            color="warning"
            data-testid="pos-imprevistos-btn"
          >
            <v-icon size="22">mdi-receipt-text-plus</v-icon>
          </v-btn>
        </template>
        <v-card min-width="320" max-width="400" data-testid="pos-imprevistos-menu">
          <v-card-title class="d-flex align-center text-body-1">
            <v-icon class="mr-2">mdi-receipt-text-plus</v-icon>
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
      <!-- Gestionar productos: subdued link -->
      <v-btn
        size="x-small"
        variant="text"
        prepend-icon="mdi-cog"
        color="grey-darken-1"
        data-testid="pos-gestionar-productos-link"
        @click="irAConfigurarProductos"
      >
        Productos
      </v-btn>
    </div>

    <!-- REQ-POS-16 / REQ-POS-39: no evento en_curso — management panel -->
    <div v-if="!eventoEnCurso">
      <!-- Planning events available: let the operator start one directly -->
      <div v-if="eventosPlanificacion.length > 0">
        <v-alert
          type="info"
          density="compact"
          variant="tonal"
          class="mb-3"
          data-testid="pos-gestion-sin-evento"
        >
          <p class="text-body-2 mb-2">No hay un evento en curso</p>
          <p class="text-caption mb-2">Seleccioná un evento planificado para comenzar a vender:</p>
        </v-alert>
        <v-row data-testid="pos-planificacion-lista">
          <v-col
            v-for="ev in eventosPlanificacion"
            :key="ev.id"
            cols="12"
            sm="6"
            md="4"
          >
            <v-card
              variant="outlined"
              data-testid="pos-planificacion-card"
            >
              <v-card-item density="compact">
                <template #title>
                  {{ ev.nombre }}
                </template>
                <template #subtitle>
                  {{ ev.fecha }}
                  <span v-if="ev.ubicacion"> — {{ ev.ubicacion }}</span>
                </template>
              </v-card-item>
              <v-card-actions>
                <v-btn
                  color="primary"
                  size="small"
                  variant="tonal"
                  :loading="iniciandoEventoId === ev.id"
                  :disabled="iniciandoEventoId !== null"
                  prepend-icon="mdi-play"
                  data-testid="pos-iniciar-evento-btn"
                  @click="iniciarEventoDesdePOS(ev.id)"
                >
                  Iniciar evento
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
        <v-alert
          v-if="errorIniciar"
          type="error"
          density="compact"
          variant="tonal"
          class="mt-3"
          data-testid="pos-iniciar-error"
        >
          {{ errorIniciar }}
        </v-alert>
      </div>

      <!-- No events at all (not even planificacion): guide to create one -->
      <v-alert
        v-else
        type="warning"
        density="compact"
        variant="tonal"
        class="mb-3"
        data-testid="pos-sin-evento"
      >
        <p class="text-body-2 mb-2">No hay un evento en curso</p>
        <p class="text-caption mb-2">Para registrar ventas primero creá un evento en la sección Eventos.</p>
        <v-btn color="primary" size="small" variant="tonal" :href="'/eventos'" data-testid="pos-ir-eventos">
          Ir a Eventos
        </v-btn>
      </v-alert>
    </div>

    <template v-else>
      <!-- pos-redesign (REQ-POS-58, REQ-POS-HOY-1..4): per-metodo_pago
           totals panel, gated by the feature flag. -->
      <ResumenVentasHoy
        v-if="FLAG_POS_REDESIGN"
        :ventas="ventas"
        :cargando="cargandoVentas"
      />

      <!-- Category filters and sort controls -->
      <div class="mb-4">
        <div class="d-flex align-center ga-2 flex-wrap">
          <!-- Category chips -->
          <v-chip
            :color="categoriaFiltro === null ? 'primary' : undefined"
            :variant="categoriaFiltro === null ? 'flat' : 'tonal'"
            size="small"
            data-testid="pos-filter-todos"
            @click="categoriaFiltro = null"
          >
            Todos
          </v-chip>
          <v-chip
            v-for="cat in CATEGORIAS"
            :key="cat.value"
            :color="categoriaFiltro === cat.value ? 'primary' : undefined"
            :variant="categoriaFiltro === cat.value ? 'flat' : 'tonal'"
            size="small"
            :data-testid="`pos-filter-${cat.value}`"
            @click="categoriaFiltro = categoriaFiltro === cat.value ? null : cat.value"
          >
            {{ cat.label }}
          </v-chip>

          <v-spacer />

          <!-- Sort dropdown -->
          <v-menu>
            <template #activator="{ props: menuProps }">
              <v-btn
                v-bind="menuProps"
                size="small"
                variant="tonal"
                :color="ordenamiento ? 'primary' : undefined"
                prepend-icon="mdi-sort"
                data-testid="pos-sort-btn"
              >
                {{ ordenamientoLabel }}
              </v-btn>
            </template>
            <v-list density="compact">
              <v-list-item
                v-for="opcion in OPCIONES_ORDENAMIENTO"
                :key="opcion.value"
                :active="ordenamiento === opcion.value"
                @click="ordenamiento = ordenamiento === opcion.value ? null : opcion.value"
              >
                <v-list-item-title>{{ opcion.label }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>

          <!-- Clear filters button -->
          <v-btn
            v-if="hayFiltrosActivos"
            size="small"
            variant="text"
            color="error"
            prepend-icon="mdi-filter-remove"
            data-testid="pos-clear-filters"
            @click="limpiarFiltros"
          >
            Limpiar
          </v-btn>
        </div>
      </div>

      <!-- REQ-POS-49: loading state. -->
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
        density="compact"
        variant="tonal"
        class="mb-3"
        data-testid="pos-error"
      >
        {{ errorProductos }}
        <template #append>
          <v-btn variant="text" size="x-small" @click="reintentar">Reintentar</v-btn>
        </template>
      </v-alert>

      <!-- Dependency-load failure: distinguish "data failed to load"
           from "no products configured". -->
      <v-alert
        v-if="errorCargaDependencias && !cargandoProductos && !errorProductos"
        type="error"
        density="compact"
        variant="tonal"
        class="mb-3"
        data-testid="pos-error-dependencias"
      >
        {{ errorCargaDependencias }}
        <template #append>
          <v-btn variant="text" size="x-small" data-testid="pos-reintentar-dependencias" @click="cargarDatosPOS">Reintentar</v-btn>
        </template>
      </v-alert>

      <!-- REQ-FIN-30: empty-state — compact guidance for the operator
           without bulky panels. Two clear actions: quick-init or manual config. -->
      <v-alert
        v-if="mostrarSinProductos && !cargandoProductos && !errorProductos"
        type="info"
        density="compact"
        variant="tonal"
        class="mb-3"
        data-testid="pos-evento-sin-productos"
      >
        <p class="text-body-2 mb-2">No hay productos configurados para este evento</p>
        <div class="d-flex flex-wrap ga-2">
          <v-btn
            color="primary"
            size="small"
            variant="tonal"
            :loading="inicializandoCatalogo"
            :disabled="inicializandoCatalogo"
            prepend-icon="mdi-rocket-launch"
            data-testid="pos-inicializar-catalogo"
            @click="inicializarProductosDesdeCatalogo"
          >
            Inicializar desde catálogo
          </v-btn>
          <v-btn
            color="primary"
            size="small"
            variant="outlined"
            data-testid="pos-configurar-productos"
            @click="irAConfigurarProductos"
          >
            Configurar productos
          </v-btn>
        </div>
        <v-alert
          v-if="errorInicializarCatalogo"
          type="error"
          class="mt-2"
          density="compact"
          variant="tonal"
          data-testid="pos-inicializar-catalogo-error"
        >
          {{ errorInicializarCatalogo }}
        </v-alert>
      </v-alert>

      <!-- mobile-ux-redesign Phase 3: Simplified POS mode (active event).
           Single-row layout: products + unified cart/payment/checkout
           stack so the operator scans cart contents, payment choice,
           and the checkout action together without scrolling.
           On xs/sm the row stacks vertically (products full-width,
           then cart+payment+checkout full-width below).
           On md+ side-by-side: products 8 cols, checkout 4 cols. -->
      <template v-if="isSimplifiedMode && !cargandoProductos && !errorProductos">
        <v-row>
          <v-col cols="12" sm="12" md="8" lg="9" data-testid="pos-products-col">
            <ProductGrid
              :productos="productosSimplificados"
              @add-to-cart="manejarAgregar"
            />
          </v-col>
          <v-col
            cols="12"
            sm="12"
            md="4"
            lg="3"
            class="d-flex flex-column"
            data-testid="pos-cart-col"
          >
            <CarritoPanel
              :carrito="carrito"
              :total="totalCarrito"
              :hide-register-button="true"
              @registrar-venta="abrirDialogoRegistrar"
              @vaciar="vaciarCarrito"
              @update-cantidad="actualizarCantidad"
              @eliminar="quitarDelCarrito"
            />
            <PaymentSelector
              :model-value="paymentMethod"
              class="mt-3"
              @update:model-value="setPaymentMethod"
            />
            <CheckoutButton
              :disabled="!cobrarHabilitado"
              :total="totalCarrito"
              :disabled-hint="checkoutDisabledHint"
              class="mt-3"
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

<style scoped>
/* Visual polish: POS-specific component styling.
   Kept scoped so it doesn't leak into dialogs or other views. */

.pos-context-bar {
  background: rgba(var(--v-theme-surface-variant), 0.4);
  border-radius: 6px;
  min-height: 36px;
}
</style>

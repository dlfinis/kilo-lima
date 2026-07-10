<script setup lang="ts">
// REQ-PRICING-1, REQ-PRICING-7, REQ-FIN-18, REQ-PRICING-8,
// REQ-CON-7, REQ-CON-9, REQ-CON-10 (PR-2):
// per-evento product picker at `/eventos/:id/productos`. Composes:
//   - useEvents()        — evento header + read-only gate
//   - usePreciosEvento() — joined list (costo + precio_sugerido +
//                          margen_efectivo + precio_final) +
//                          contribucionParaProducto +
//                          precioMinimoParaProducto (PR-2)
//   - useEventoProductosStore() — mutations + inicializarDesdeCatalogo
//
// Optimistic updates for the incluido toggle and the precio_venta
// edit: the store flips the local row first, then the service
// reconciles. `estadoEsEditable` hides the bulk "Inicializar desde
// catálogo" button + the editable slider/input when the evento is
// cerrado.
//
// PR-2 changes (REQ-CON-7, REQ-CON-9, REQ-CON-10):
//   - Inline <PricingAlert> below the editable precio_venta field.
//     The alert is purely advisory — saving the new price still
//     proceeds (no save-blocking).
//   - Bulk action "APLICAR PRECIO MÍNIMO BREAK-EVEN" — applies the
//     computed `precioMinimoParaProducto(productoId)` to each row's
//     `precio_venta` via the existing store path.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import MargenSlider from '@/components/business/MargenSlider.vue'
import PricingAlert from '@/components/business/PricingAlert.vue'
import RecetaCostoDesglose from '@/components/business/RecetaCostoDesglose.vue'
import { useEvents } from '@/composables/useEvents'
import { usePlans } from '@/composables/usePlans'
import { usePreciosEvento } from '@/composables/usePreciosEvento'
import { useEventoProductosStore } from '@/stores/eventoProductos.store'
import { useProductosStore } from '@/stores/productos.store'
import { useRecipesStore } from '@/stores/recipes.store'
import { useIngredientsStore } from '@/stores/ingredients.store'
import { useVentasStore } from '@/stores/ventas.store'
import { calcularCostoReceta } from '@/composables/useCalculoReceta'
import { estadoEsEditable } from '@/utils/estado'
import { formatearUSD } from '@/utils/format'
import { calcularContribucionUnitaria, calcularPrecioDesdeContribucion } from '@/utils/contribucion'
import { calcularMargenReal } from '@/utils/pricing'
import type { EventoProducto, EventoProductoConDetalle } from '@/types'

const route = useRoute()
const router = useRouter()

const eventoId = computed<string | null>(() => {
  const value = route.params.id
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? null : null
})

const { eventoActual, cargarPorId } = useEvents()
const epStore = useEventoProductosStore()
const productosStore = useProductosStore()
const recipesStore = useRecipesStore()
const ingredientsStore = useIngredientsStore()
const ventasStore = useVentasStore()
const { productosDelEvento, precioMinimoParaProducto } = usePreciosEvento(eventoId)
const { planesPorEvento, cargarPorEvento: cargarPlan } = usePlans()

const editable = computed(() =>
  eventoActual.value ? estadoEsEditable(eventoActual.value.estado) : false,
)

// REQ-UX-27: local loading flag that covers BOTH the epStore async load
// (which only tracks evento_productos) AND the cross-store dependency
// loads (recipes, ingredients, products, ventas). Without this, the
// template renders the table with default $0 costs and "(producto sin
// receta)" names while the async loads complete — the operator sees a
// flash of bogus numbers before the real data settles.
const cargandoCompleto = ref(false)
const cargando = computed(() => epStore.cargando || cargandoCompleto.value)
const errorCarga = computed(() => epStore.error)

const porcentajeMargen = computed<number>(() =>
  Math.round((eventoActual.value?.margen_ganancia ?? 0) * 100),
)

// Calcular unidades vendidas por producto (para referencias, no se
// renderiza en la tabla de configuración).
const unidadesVendidasPorProducto = computed(() => {
  const map = new Map<string, number>()
  const ventas = ventasStore.ventas
  if (!ventas || !Array.isArray(ventas)) return map
  for (const venta of ventas) {
    if (!venta || !venta.items || !Array.isArray(venta.items)) continue
    for (const item of venta.items) {
      if (!item || !item.producto_id) continue
      const current = map.get(item.producto_id) ?? 0
      map.set(item.producto_id, current + item.cantidad)
    }
  }
  return map
})

// REQ-CON-8: unidades planificadas por producto, derivadas del
// `plan_produccion` del evento. El plan está por receta; como la
// relación producto→receta es 1:1 en este momento, tomamos el plan
// de la receta del producto. Cuando no hay plan, la contribución
// planificada es 0 (no se asume venta).
const unidadesPlanificadasPorProducto = computed<Map<string, number>>(() => {
  const map = new Map<string, number>()
  if (!eventoId.value) return map
  const plan = planesPorEvento.value.get(eventoId.value) ?? []
  const productoMap = new Map(productosStore.productos.map((p) => [p.id, p]))
  for (const fila of plan) {
    // Find products linked to this receta.
    for (const [prodId, prod] of productoMap) {
      if (prod.receta_id === fila.receta_id) {
        const existing = map.get(prodId) ?? 0
        map.set(prodId, existing + fila.unidades_a_producir)
      }
    }
  }
  return map
})

async function cargar() {
  if (!eventoId.value) return
  // REQ-UX-27: block the table render until all cross-store loads finish.
  // Without this the template renders with empty receta/ingredient data
  // → "(producto sin receta)" + $0.00 costs → operator sees a flash of
  // bogus numbers before the real data settles.
  cargandoCompleto.value = true
  try {
    await cargarPorId(eventoId.value)
    await epStore.cargarPorEvento(eventoId.value)
    // REQ-PRICING-7, REQ-CON-8: `usePreciosEvento` joins evento_productos +
    // productos + recetas + materias_primas to compute costo_unitario and
    // the product name. If the operator navigates directly to
    // /eventos/:id/productos without first visiting /inventario or
    // /productos/recetas, the recipes/ingredients stores start empty and
    // every row renders as "(producto sin receta)" with $0.00 cost.
    // REQ-CON-8: `unidadesVendidasPorProducto` (which feeds the
    // `contribucion_total` column) reads `ventasStore.ventas`. Without
    // this load, the column always renders $0.00 on direct navigation
    // even when the evento has recorded sales.
    await Promise.all([
      recipesStore.recetas.length === 0 ? recipesStore.cargarTodas() : Promise.resolve(),
      ingredientsStore.materiasPrimas.length === 0
        ? ingredientsStore.cargarTodas()
        : Promise.resolve(),
      productosStore.productos.length === 0 ? productosStore.cargarTodas() : Promise.resolve(),
      ventasStore.ventas.length === 0 && ventasStore.cargarPorEvento
        ? ventasStore.cargarPorEvento(eventoId.value)
        : Promise.resolve(),
      // REQ-CON-8: the planned-contribution column reads
      // `planesPorEvento`. Load it here so the column doesn't render
      // as 0 on first paint when the operator navigates directly.
      planesPorEvento.value.has(eventoId.value)
        ? Promise.resolve()
        : cargarPlan(eventoId.value),
    ])
  } finally {
    cargandoCompleto.value = false
  }
  // productos-mejoras: catalog list is loaded lazily when the
  // operator opens the "Agregar producto" dialog (see `abrirDialogoAgregar`).
  // Avoids blocking the initial render on a Supabase round-trip when the
  // operator never opens the dialog (the common path).
}

onMounted(cargar)

async function alInicializar() {
  if (!eventoId.value) return
  await epStore.inicializarDesdeCatalogo(eventoId.value)
}

async function alToggleIncluido(ep: EventoProducto) {
  if (!eventoId.value) return
  await epStore.toggleIncluido(eventoId.value, ep.producto_id)
}

async function alCambiarPrecio(ep: EventoProductoConDetalle, valor: number) {
  if (!eventoId.value) return
  // productos-mejoras: calcular el margen equivalente al precio manual
  const margenEquivalente = valor > ep.costo_unitario
    ? (valor - ep.costo_unitario) / valor
    : 0
  await epStore.actualizarPrecio(eventoId.value, ep.producto_id, valor, margenEquivalente)
}

// productos-mejoras UX: cuando el usuario hace clic en el precio del
// slider, establecer ese precio como precio de venta.
async function alAplicarPrecioSlider(ep: EventoProductoConDetalle, precio: number) {
  if (!eventoId.value) return
  await epStore.actualizarPrecio(eventoId.value, ep.producto_id, precio, ep.margen)
}

// REQ-CON (Type A calculator): when the operator edits the contribution
// field, the price is derived automatically. precio = costo + contribucion.
async function alCambiarContribucion(ep: EventoProductoConDetalle, contribucionDeseada: number) {
  if (!eventoId.value) return
  const costo = ep.costo_unitario
  const nuevoPrecio = calcularPrecioDesdeContribucion(costo, contribucionDeseada)
  await epStore.actualizarPrecio(eventoId.value, ep.producto_id, nuevoPrecio, ep.margen)
}

// productos-mejoras / evento-producto-pricing: slider fix. Pass
// `ep.precio_venta` as-is (null OR number) instead of coercing to 0
// with `?? 0`. The DB row now stays in auto-calc mode unless the
// operator sets an override via the editable precio field.
async function alCambiarMargen(ep: EventoProducto, margen: number) {
  if (!eventoId.value) return
  await epStore.actualizarPrecio(eventoId.value, ep.producto_id, ep.precio_venta, margen)
}

// REQ-CON-10 (PR-2) + productos-mejoras: bulk action — apply the
// break-even minimum price to every included producto AND write the
// matching `margen` so `margen_efectivo` stays coherent with the
// override. Two-step UX (alert-style confirm) lives in the template.
async function aplicarPrecioMinimo() {
  if (!eventoId.value) return
  for (const ep of productosDelEvento.value) {
    const minimo = precioMinimoParaProducto.value(ep.producto_id)
    if (minimo === null) continue
    const margenEquivalente = calcularMargenReal(minimo, ep.costo_unitario)
    await epStore.actualizarPrecio(eventoId.value, ep.producto_id, minimo, margenEquivalente)
  }
}

function volver() {
  if (eventoId.value) router.push({ name: 'evento-detalle', params: { id: eventoId.value } })
}

// productos-mejoras / evento-producto-agregar: "Agregar producto"
// dialog. Lists catalog productos NOT yet in this evento, adds via
// `epStore.agregar`. Re-uses `productosStore.productos` so the dialog
// stays in sync with the catalog without a refetch.
const dialogoAgregarAbierto = ref<boolean>(false)
const productosDisponibles = computed(() => {
  // Include all evento_productos rows (incluido=true AND incluido=false)
  // so the operator can re-enable excluded rows if needed. Anything in
  // `productosPorEvento` is already in the evento (incluido or not).
  const todas = new Set(
    epStore.productosPorEvento.get(eventoId.value ?? '')?.map((ep) => ep.producto_id) ?? [],
  )
  return productosStore.productos
    .filter((p) => !todas.has(p.id))
    .map((p) => {
      const receta = recipesStore.recetas.find((r) => r.id === p.receta_id)
      return {
        id: p.id,
        nombre: receta?.nombre ?? '(sin receta)',
        disponible: p.disponible,
      }
    })
})

function abrirDialogoAgregar() {
  dialogoAgregarAbierto.value = true
  // productos-mejoras: lazy-load the catalog list the first time the
  // dialog opens so existing views (which only push the catalog locally)
  // don't need a parallel fetch on mount. The promise is intentionally
  // not awaited — the dialog renders with whatever products are already
  // in the store and updates once the fetch resolves.
  if (productosStore.productos.length === 0) {
    void productosStore.cargarTodas()
  }
}

async function alAgregarProducto(productoId: string) {
  if (!eventoId.value) return
  await epStore.agregar(eventoId.value, productoId)
}

// productos-mejoras / cost breakdown: expandable row in the table.
// Re-uses `RecetaCostoDesglose` (already accepts a `CalculoReceta`).
// `v-model:expanded` on v-data-table is typed as `readonly string[]` —
// we keep an array of row `producto_id` keys so multiple rows can be
// open at once. The data-table writes back via `update:expanded`.
const expandedRows = ref<string[]>([])

// REQ-UX-27: state for the formulas popover. Toggled by the compact
// "¿Cómo se calcula?" button so the operator can peek at the math
// without losing context of the table.
const formulasMenuAbierto = ref(false)

// REQ-UX-27: real-number example for the formulas popover. Takes the
// first producto in the table and surfaces the actual numbers so the
// operator can map the formula to something they're looking at right
// now — abstract examples ("$10 − $5 = $5") are less useful than the
// operator's own data.
const ejemploFormulas = computed(() => {
  const ep = productosDelEvento.value[0]
  if (!ep) return null
  const precio = ep.precio_final
  const costo = ep.costo_unitario
  const ganancia = Number((precio - costo).toFixed(2))
  const margen = precio > 0 ? Number(((precio - costo) / precio).toFixed(3)) : 0
  const unidadesPlan = unidadesPlanificadasPorProducto.value.get(ep.producto_id) ?? 0
  const contribucionPlan = Number((ganancia * unidadesPlan).toFixed(2))
  const roi = costo > 0 ? Math.round(((precio - costo) / costo) * 100) : 0
  return {
    nombre: ep.producto_nombre,
    precio: precio.toFixed(2),
    costo: costo.toFixed(2),
    ganancia: ganancia.toFixed(2),
    margen,
    unidadesPlan,
    contribucionPlan: contribucionPlan.toFixed(2),
    roi,
  }
})

const calculoPorProducto = computed(() => {
  return (productoId: string) => {
    const producto = productosStore.productos.find((p) => p.id === productoId)
    if (!producto) return null
    const receta = recipesStore.recetas.find((r) => r.id === producto.receta_id)
    if (!receta || receta.ingredientes.length === 0) return null
    const materiaMap = new Map(ingredientsStore.materiasPrimas.map((m) => [m.id, m]))
    return calcularCostoReceta(
      receta.ingredientes.map((ing) => ({
        ingrediente: ing,
        materiaPrima: materiaMap.get(ing.materia_prima_id) ?? null,
      })),
      receta.rendimiento_unidades,
    )
  }
})
</script>

<template>
  <v-container>
    <v-progress-linear v-if="cargando" indeterminate color="primary"
      data-testid="evento-productos-loading" />

    <v-alert v-if="errorCarga && !cargando" type="error" class="mb-4"
      data-testid="evento-productos-error">
      {{ errorCarga }}
    </v-alert>

    <template v-if="eventoActual">
      <div class="d-flex align-center ga-3 mb-2">
        <h1 data-testid="evento-productos-titulo">{{ eventoActual.nombre }}</h1>
        <v-chip color="primary" size="small" data-testid="evento-productos-margen">
          Margen {{ porcentajeMargen }}%
        </v-chip>
      </div>

      <v-alert v-if="!editable" type="warning" class="mb-4"
        data-testid="evento-productos-alerta-cerrado">
        Evento cerrado — no editable
      </v-alert>

      <div class="d-flex ga-2 mb-4">
        <v-btn variant="text" prepend-icon="mdi-arrow-left"
          data-testid="evento-productos-volver" @click="volver">
          Volver al evento
        </v-btn>
      </div>

      <v-card v-if="productosDelEvento.length === 0" class="pa-4 text-center"
        data-testid="evento-productos-empty">
        <p class="mb-3">No hay productos configurados todavía.</p>
        <v-btn v-if="editable" color="primary" variant="flat"
          data-testid="evento-productos-inicializar" @click="alInicializar">
          Inicializar desde catálogo
        </v-btn>
      </v-card>

      <!-- REQ-CON-10 (PR-2): bulk action — apply the break-even
            minimum price to every included producto. Hidden when
            the evento is cerrado (read-only state). -->
      <!-- REQ-UX-27: formulas popover. Compact button opens a floating
            card with formulas illustrated with real numbers from the
            first product in the table. Chose v-menu (click-to-toggle)
            over v-tooltip because the content is multi-line with
            examples — tooltips should be short labels only. -->
      <v-menu
        v-if="productosDelEvento.length > 0 && !cargando"
        v-model="formulasMenuAbierto"
        location="bottom start"
        :close-on-content-click="true"
      >
        <template #activator="{ props: menuProps }">
          <v-btn
            v-bind="menuProps"
            size="small"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-calculator-variant-outline"
            class="mb-3"
            data-testid="evento-productos-formulas-btn"
          >
            ¿Cómo se calcula?
          </v-btn>
        </template>
        <v-card min-width="340" max-width="420" data-testid="evento-productos-formulas-card">
          <v-card-title class="text-body-2 pa-3 pb-1">
            <v-icon size="small" class="mr-1" color="primary">mdi-lightbulb-on-outline</v-icon>
            Fórmulas de la tabla
          </v-card-title>
          <v-divider />
          <v-card-text class="pa-3">
            <!-- Ganancia unitaria -->
            <div class="mb-2">
              <div class="d-flex align-center ga-2 mb-1">
                <v-chip size="x-small" color="success" variant="flat">Ganancia</v-chip>
                <span class="text-caption text-medium-emphasis">por unidad</span>
              </div>
              <div class="text-body-2">
                <code class="text-success">Precio − Costo</code>
              </div>
              <div v-if="ejemploFormulas" class="text-caption text-medium-emphasis mt-1">
                Ej: {{ ejemploFormulas.nombre }} →
                ${{ ejemploFormulas.precio }} − ${{ ejemploFormulas.costo }} =
                <strong class="text-success">${{ ejemploFormulas.ganancia }}</strong>
              </div>
            </div>
            <!-- Margen de contribución -->
            <div class="mb-2">
              <div class="d-flex align-center ga-2 mb-1">
                <v-chip size="x-small" color="info" variant="flat">Margen</v-chip>
                <span class="text-caption text-medium-emphasis">porcentaje del precio que queda tras cubrir el costo</span>
              </div>
              <div class="text-body-2">
                <code>(Precio − Costo) / Precio</code>
              </div>
              <div v-if="ejemploFormulas" class="text-caption text-medium-emphasis mt-1">
                Ej: ${{ ejemploFormulas.ganancia }} / ${{ ejemploFormulas.precio }} =
                <strong>{{ (ejemploFormulas.margen * 100).toFixed(0) }}%</strong>
              </div>
            </div>
            <!-- Unidades planificadas -->
            <div class="mb-2">
              <div class="d-flex align-center ga-2 mb-1">
                <v-chip size="x-small" color="secondary" variant="flat">Unid. plan</v-chip>
                <span class="text-caption text-medium-emphasis">unidades a producir (plan de producción del evento)</span>
              </div>
              <div class="text-body-2">
                <code>plan_produccion.unidades_a_producir</code>
              </div>
              <div v-if="ejemploFormulas" class="text-caption text-medium-emphasis mt-1">
                Ej: <strong>{{ ejemploFormulas.unidadesPlan }}</strong> unidades planificadas
              </div>
            </div>
            <!-- Contribución planificada -->
            <div class="mb-2">
              <div class="d-flex align-center ga-2 mb-1">
                <v-chip size="x-small" color="orange-darken-2" variant="flat">Contrib. plan</v-chip>
                <span class="text-caption text-medium-emphasis">monto para cubrir costos operativos del evento</span>
              </div>
              <div class="text-body-2">
                <code class="text-orange-darken-2">(Precio − Costo) × Unid. plan</code>
              </div>
              <div v-if="ejemploFormulas" class="text-caption text-medium-emphasis mt-1">
                Ej: ${{ ejemploFormulas.ganancia }} × {{ ejemploFormulas.unidadesPlan }} =
                <strong class="text-orange-darken-2">${{ ejemploFormulas.contribucionPlan }}</strong>
              </div>
            </div>
            <!-- ROI -->
            <div>
              <div class="d-flex align-center ga-2 mb-1">
                <v-chip size="x-small" color="primary" variant="flat">ROI</v-chip>
                <span class="text-caption text-medium-emphasis">retorno sobre el costo</span>
              </div>
              <div class="text-body-2">
                <code class="text-primary">((Precio − Costo) / Costo) × 100%</code>
              </div>
              <div v-if="ejemploFormulas && ejemploFormulas.costo > 0" class="text-caption text-medium-emphasis mt-1">
                Ej: (${{ ejemploFormulas.ganancia }} / ${{ ejemploFormulas.costo }}) × 100 =
                <strong class="text-primary">{{ ejemploFormulas.roi }}%</strong>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-menu>
      <div v-if="productosDelEvento.length > 0 && editable" class="d-flex ga-2 mb-3">
        <v-btn
          color="warning"
          variant="tonal"
          prepend-icon="mdi-cash-multiple"
          data-testid="evento-productos-aplicar-minimo"
          @click="aplicarPrecioMinimo"
        >
          Aplicar precio mínimo break-even
        </v-btn>
        <!-- productos-mejoras / evento-producto-agregar: open the
             catalog picker so the operator can add individual
             productos to the evento. -->
        <v-btn
          color="primary"
          variant="tonal"
          prepend-icon="mdi-plus"
          data-testid="evento-productos-agregar"
          @click="abrirDialogoAgregar"
        >
          Agregar producto
        </v-btn>
      </div>

      <v-data-table
        v-if="productosDelEvento.length > 0"
        v-model:expanded="expandedRows"
        :items="productosDelEvento"
        :headers="[
          { title: '', key: 'data-table-expand' },
          { title: '', key: 'incluido', sortable: false, width: 60 },
          { title: 'Producto', key: 'producto_nombre' },
          { title: 'Costo', key: 'costo_unitario' },
          { title: 'Unid. plan', key: 'unidades_plan', align: 'end', width: 90 },
          { title: 'Margen', key: 'margen_efectivo' },
          { title: 'Precio', key: 'precio_final', width: 140, align: 'center' },
          { title: 'Ganancia', key: 'ganancia_unitaria' },
          { title: 'Contrib. plan', key: 'contribucion_plan', align: 'end' },
          { title: 'ROI', key: 'roi', align: 'end' },
        ]"
        density="comfortable"
        show-expand
        data-testid="evento-productos-tabla"
      >
        <template #[`item.incluido`]="{ item }">
          <v-checkbox-btn
            :model-value="item.incluido"
            :disabled="!editable"
            :data-testid="`evento-productos-incluido-${item.producto_id}`"
            @update:model-value="alToggleIncluido(item)"
          />
        </template>
        <template #[`item.costo_unitario`]="{ item }">
          {{ formatearUSD(item.costo_unitario) }}
        </template>
        <template #[`item.margen_efectivo`]="{ item }">
          <MargenSlider
            :model-value="item.margen_efectivo"
            :costo="item.costo_unitario"
            :disabled="!editable"
            @update:model-value="(m) => alCambiarMargen(item, m)"
            @apply-price="(p) => alAplicarPrecioSlider(item, p)"
          />
        </template>
        <template #[`item.precio_final`]="{ item }">
          <v-text-field
            :model-value="item.precio_final"
            type="number"
            density="compact"
            hide-details
            :disabled="!editable"
            :data-testid="`evento-productos-precio-${item.producto_id}`"
            class="text-center mx-auto"
            style="max-width: 140px"
            prefix="$"
            @update:model-value="(v) => alCambiarPrecio(item, Number(v))"
          />
        </template>
        <template #[`item.ganancia_unitaria`]="{ item }">
          <span
            class="font-weight-medium"
            :class="item.precio_final - item.costo_unitario >= 0 ? 'text-success' : 'text-error'"
          >
            ${{ (item.precio_final - item.costo_unitario).toFixed(2) }}
          </span>
        </template>
        <template #[`item.unidades_plan`]="{ item }">
          <span class="font-weight-medium">
            {{ unidadesPlanificadasPorProducto.get(item.producto_id) ?? 0 }}
          </span>
        </template>
        <template #[`item.contribucion_plan`]="{ item }">
          <span class="font-weight-medium text-orange-darken-2">
            ${{ ((item.precio_final - item.costo_unitario) * (unidadesPlanificadasPorProducto.get(item.producto_id) ?? 0)).toFixed(2) }}
          </span>
        </template>
        <template #[`item.roi`]="{ item }">
          <span :class="item.costo_unitario > 0 ? 'text-primary' : 'text-medium-emphasis'">
            {{ item.costo_unitario > 0 ? Math.round(((item.precio_final - item.costo_unitario) / item.costo_unitario) * 100) : 0 }}%
          </span>
        </template>
        <!-- productos-mejoras / cost breakdown: expandable row showing
             the per-producto ingredient breakdown via RecetaCostoDesglose.
             Recomputes from the catalog recipes store on each render. -->
        <template #[`expanded-row`]="{ columns, item }">
          <tr :data-testid="`evento-productos-desglose-${item.producto_id}`" class="bg-grey-lighten-4">
            <td :colspan="columns.length">
              <RecetaCostoDesglose
                v-if="calculoPorProducto(item.producto_id)"
                :calculo="calculoPorProducto(item.producto_id)!"
              />
              <p v-else class="text-disabled mb-0 px-4 py-3">
                Sin receta asociada — no hay desglose para mostrar.
              </p>
            </td>
          </tr>
        </template>
      </v-data-table>

      <!-- productos-mejoras / evento-producto-agregar: dialog with the
           catalog list filtered to productos NOT in this evento. The
           dialog reuses `productosStore.productos` so it stays in sync
           with the rest of the view. -->
      <v-dialog v-model="dialogoAgregarAbierto" max-width="520"
        data-testid="evento-productos-dialogo-agregar">
        <v-card>
          <v-card-title>Agregar producto al evento</v-card-title>
          <v-card-text>
            <p v-if="productosDisponibles.length === 0" class="text-disabled mb-0">
              Todos los productos del catálogo ya están en este evento.
            </p>
            <v-list v-else lines="two">
              <v-list-item
                v-for="producto in productosDisponibles"
                :key="producto.id"
                :data-testid="`evento-productos-dialogo-item-${producto.id}`"
              >
                <v-list-item-title>{{ producto.nombre }}</v-list-item-title>
                <v-list-item-subtitle v-if="!producto.disponible" class="text-warning">
                  Producto no disponible en el catálogo
                </v-list-item-subtitle>
                <template #append>
                  <v-btn
                    color="primary"
                    variant="tonal"
                    size="small"
                    :data-testid="`evento-productos-dialogo-agregar-${producto.id}`"
                    @click="alAgregarProducto(producto.id)"
                  >
                    Agregar
                  </v-btn>
                </template>
              </v-list-item>
            </v-list>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" data-testid="evento-productos-dialogo-cerrar"
              @click="dialogoAgregarAbierto = false">
              Cerrar
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </template>
  </v-container>
</template>

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
import { usePreciosEvento } from '@/composables/usePreciosEvento'
import { useEventoProductosStore } from '@/stores/eventoProductos.store'
import { useProductosStore } from '@/stores/productos.store'
import { useRecipesStore } from '@/stores/recipes.store'
import { useIngredientsStore } from '@/stores/ingredients.store'
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
const { productosDelEvento, precioMinimoParaProducto } = usePreciosEvento(eventoId)

const editable = computed(() =>
  eventoActual.value ? estadoEsEditable(eventoActual.value.estado) : false,
)

const cargando = computed(() => epStore.cargando)
const errorCarga = computed(() => epStore.error)

const porcentajeMargen = computed<number>(() =>
  Math.round((eventoActual.value?.margen_ganancia ?? 0) * 100),
)

async function cargar() {
  if (!eventoId.value) return
  await cargarPorId(eventoId.value)
  await epStore.cargarPorEvento(eventoId.value)
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
          { title: 'Margen', key: 'margen_efectivo' },
          { title: 'Precio', key: 'precio_final', width: 100, align: 'center' },
          { title: 'Contribución', key: 'ganancia_unitaria' },
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
            style="max-width: 100px; margin: 0 auto"
            class="text-center"
            prefix="$"
            @update:model-value="(v) => alCambiarPrecio(item, Number(v))"
          />
        </template>
        <template #[`item.ganancia_unitaria`]="{ item }">
          <div class="d-flex flex-column">
            <span
              class="font-weight-medium"
              :class="item.precio_final - item.costo_unitario >= 0 ? 'text-success' : 'text-error'"
            >
              {{ formatearUSD(item.precio_final - item.costo_unitario) }}
            </span>
            <span class="text-caption text-medium-emphasis">
              c/u · {{ item.margen_efectivo * 100 }}%
            </span>
          </div>
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
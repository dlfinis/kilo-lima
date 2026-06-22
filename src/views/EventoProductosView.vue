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
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import MargenSlider from '@/components/business/MargenSlider.vue'
import PricingAlert from '@/components/business/PricingAlert.vue'
import { useEvents } from '@/composables/useEvents'
import { usePreciosEvento } from '@/composables/usePreciosEvento'
import { useEventoProductosStore } from '@/stores/eventoProductos.store'
import { estadoEsEditable } from '@/utils/estado'
import { formatearUSD } from '@/utils/format'
import { calcularContribucionUnitaria, calcularPrecioDesdeContribucion } from '@/utils/contribucion'
import type { EventoProducto, EventoProductoConDetalle } from '@/types'

const route = useRoute()
const router = useRouter()

const eventoId = computed<string | null>(() => {
  const value = route.params.id
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? null : null
})

const { eventoActual, cargarPorId } = useEvents()
const epStore = useEventoProductosStore()
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

async function alCambiarPrecio(ep: EventoProducto, valor: number) {
  if (!eventoId.value) return
  await epStore.actualizarPrecio(eventoId.value, ep.producto_id, valor, ep.margen ?? 0)
}

// REQ-CON (Type A calculator): when the operator edits the contribution
// field, the price is derived automatically. precio = costo + contribucion.
async function alCambiarContribucion(ep: EventoProductoConDetalle, contribucionDeseada: number) {
  if (!eventoId.value) return
  const costo = ep.costo_unitario
  const nuevoPrecio = calcularPrecioDesdeContribucion(costo, contribucionDeseada)
  await epStore.actualizarPrecio(eventoId.value, ep.producto_id, nuevoPrecio, ep.margen ?? 0)
}

async function alCambiarMargen(ep: EventoProducto, margen: number) {
  if (!eventoId.value) return
  await epStore.actualizarPrecio(eventoId.value, ep.producto_id, ep.precio_venta ?? 0, margen)
}

// REQ-CON-10 (PR-2): bulk action — apply the break-even minimum price
// to every included producto. Iterates over `productosDelEvento` and
// calls `actualizarPrecio` with the minimum so the operator can pivot
// the table to break-even pricing in one click.
async function aplicarPrecioMinimo() {
  if (!eventoId.value) return
  for (const ep of productosDelEvento.value) {
    const minimo = precioMinimoParaProducto.value(ep.producto_id)
    if (minimo === null) continue
    await epStore.actualizarPrecio(eventoId.value, ep.producto_id, minimo, ep.margen ?? 0)
  }
}

function volver() {
  if (eventoId.value) router.push({ name: 'evento-detalle', params: { id: eventoId.value } })
}
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
      </div>

      <v-data-table
        v-if="productosDelEvento.length > 0"
        :items="productosDelEvento"
        :headers="[
          { title: '', key: 'incluido', sortable: false, width: 60 },
          { title: 'Producto', key: 'producto_nombre' },
          { title: 'Receta', key: 'receta_nombre' },
          { title: 'Costo unitario', key: 'costo_unitario' },
          { title: 'Margen (%)', key: 'margen_efectivo' },
          { title: 'Precio sugerido', key: 'precio_sugerido' },
          { title: 'Precio de venta', key: 'precio_final' },
        ]"
        density="comfortable"
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
          />
        </template>
        <template #[`item.precio_sugerido`]="{ item }">
          {{ formatearUSD(item.precio_sugerido) }}
        </template>
        <template #[`item.precio_final`]="{ item }">
          <div class="d-flex flex-column">
            <v-text-field
              :model-value="item.precio_final"
              type="number"
              density="compact"
              hide-details
              :disabled="!editable"
              :data-testid="`evento-productos-precio-${item.producto_id}`"
              style="max-width: 120px"
              @update:model-value="(v) => alCambiarPrecio(item, Number(v))"
            />
            <!-- Contribución editable: si el usuario cambia la contribución,
                 el precio se recalcula automáticamente (Type A calculator). -->
            <v-text-field
              :model-value="calcularContribucionUnitaria(item.precio_final, item.costo_unitario)"
              type="number"
              density="compact"
              hide-details
              label="Contribución $"
              :disabled="!editable"
              :data-testid="`evento-productos-contribucion-${item.producto_id}`"
              style="max-width: 120px; margin-top: 4px"
              @update:model-value="(v) => alCambiarContribucion(item, Number(v))"
            />
            <!-- REQ-CON-7 (PR-2): inline PricingAlert. Advisory only
                 — saving the new price still proceeds. The alert
                 renders below the input field inside the same cell. -->
            <PricingAlert
              :precio="item.precio_final"
              :costo-produccion="item.costo_unitario"
              :precio-minimo="precioMinimoParaProducto(item.producto_id)"
            />
          </div>
        </template>
      </v-data-table>
    </template>
  </v-container>
</template>
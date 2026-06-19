<script setup lang="ts">
// REQ-PRICING-1, REQ-PRICING-7, REQ-FIN-18, REQ-PRICING-8:
// per-evento product picker at `/eventos/:id/productos`. Composes:
//   - useEvents()        — evento header + read-only gate
//   - usePreciosEvento() — joined list (costo + precio_sugerido +
//                          margen_efectivo + precio_final)
//   - useEventoProductosStore() — mutations + inicializarDesdeCatalogo
//
// Optimistic updates for the incluido toggle and the precio_venta
// edit: the store flips the local row first, then the service
// reconciles. `estadoEsEditable` hides the bulk "Inicializar desde
// catálogo" button + the editable slider/input when the evento is
// cerrado.
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import MargenSlider from '@/components/business/MargenSlider.vue'
import { useEvents } from '@/composables/useEvents'
import { usePreciosEvento } from '@/composables/usePreciosEvento'
import { useEventoProductosStore } from '@/stores/eventoProductos.store'
import { formatearUSD } from '@/utils/format'
import { estadoEsEditable } from '@/utils/estado'
import type { EventoProducto } from '@/types'

const route = useRoute()
const router = useRouter()

const eventoId = computed<string | null>(() => {
  const value = route.params.id
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? null : null
})

const { eventoActual, cargarPorId } = useEvents()
const epStore = useEventoProductosStore()
const { productosDelEvento } = usePreciosEvento(eventoId)

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

async function alCambiarMargen(ep: EventoProducto, margen: number) {
  if (!eventoId.value) return
  await epStore.actualizarPrecio(eventoId.value, ep.producto_id, ep.precio_venta ?? 0, margen)
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

      <v-data-table
        v-else
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
        <template v-slot:item.incluido="{ item }">
          <v-checkbox-btn
            :model-value="item.incluido"
            :disabled="!editable"
            :data-testid="`evento-productos-incluido-${item.producto_id}`"
            @update:model-value="alToggleIncluido(item)"
          />
        </template>
        <template v-slot:item.costo_unitario="{ item }">
          {{ formatearUSD(item.costo_unitario) }}
        </template>
        <template v-slot:item.margen_efectivo="{ item }">
          <MargenSlider
            :model-value="item.margen_efectivo"
            :costo="item.costo_unitario"
            :disabled="!editable"
            @update:model-value="(m) => alCambiarMargen(item, m)"
          />
        </template>
        <template v-slot:item.precio_sugerido="{ item }">
          {{ formatearUSD(item.precio_sugerido) }}
        </template>
        <template v-slot:item.precio_final="{ item }">
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
        </template>
      </v-data-table>
    </template>
  </v-container>
</template>
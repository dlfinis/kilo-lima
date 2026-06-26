<script setup lang="ts">
// REQ-EVENTS-3, REQ-EVENTS-4, REQ-EVENTS-7, REQ-EVENTS-11,
// REQ-EVENTS-14, REQ-EVENTS-22, REQ-EVENTS-27, REQ-EVENTS-36,
// REQ-EVENTS-38, REQ-EVENTS-39, REQ-FIN-1, REQ-FIN-2, REQ-FIN-4,
// REQ-FIN, PD-1: detail view. Composes events + gastos stores +
// projection composable. `estadoEsEditable` is the single source of
// truth for the read-only mode (REQ-EVENTS-25): when the evento is
// cerrado, all mutating controls disappear and a v-alert explains why
// (REQ-EVENTS-27). PR3 swaps the compact projection summary for the
// full ProyeccionCostosCard.
//
// Fase 1 (finanzas-evento):
//   - Inline edit fields for fecha_fin (multi-day) + margen_ganancia.
//     Save action reuses the events store's actualizar().
//   - Header date range: single-day "15/07/2026" when fecha_fin is null,
//     multi-day "15/07/2026 – 22/07/2026" otherwise.
//
// REQ-UX-28: the local "Volver" button was removed — the global
// AppBar back button replaces it. The view no longer needs to wire
// its own back handler.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import EventoStatusChip from '@/components/business/EventoStatusChip.vue'
import GastoFijoForm from '@/components/business/GastoFijoForm.vue'
import GastoFijoListItem from '@/components/business/GastoFijoListItem.vue'
import ProyeccionCostosCard from '@/components/business/ProyeccionCostosCard.vue'
import { useEvents } from '@/composables/useEvents'
import { useGastosFijos } from '@/composables/useGastosFijos'
import { usePlans } from '@/composables/usePlans'
import { useProyeccionCostos } from '@/composables/useProyeccionCostos'
import { useEventoProductosStore } from '@/stores/eventoProductos.store'
import { useRecipesStore } from '@/stores/recipes.store'
import { useIngredientsStore } from '@/stores/ingredients.store'
import { useProductosStore } from '@/stores/productos.store'
import { estadoEsEditable } from '@/utils/estado'
import type { EstadoEvento, GastoFijoInput } from '@/types'

const route = useRoute()
const router = useRouter()

const eventoId = computed<string | null>(() => {
  const value = route.params.id
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? null : null
})

const { eventoActual, cargando, error, cargarPorId, cambiarEstado, eliminar, actualizar } = useEvents()
const { gastosPorEvento, cargando: cargandoGastos, error: errorGastos, cargarPorEvento, agregar, eliminar: eliminarGasto } = useGastosFijos()
const { planesPorEvento, cargarPorEvento: cargarPlan } = usePlans()
const epStore = useEventoProductosStore()
const proyeccion = useProyeccionCostos(eventoId)

const gastos = computed(() => (eventoId.value ? gastosPorEvento.value.get(eventoId.value) ?? [] : []))
const editable = computed(() => (eventoActual.value ? estadoEsEditable(eventoActual.value.estado) : false))
const productosCount = computed(() => (eventoId.value ? (epStore.productosPorEvento.get(eventoId.value) ?? []).length : 0))
// REQ-EVENTS-39: cascade copy mentions the plan row count for this
// evento. Plan rows are already loaded by `cargarPlan` in onMounted,
// so we read them off the same `planesPorEvento` Map that the rest
// of the view uses.
const planCount = computed(() => (eventoId.value ? (planesPorEvento.value.get(eventoId.value) ?? []).length : 0))

// REQ-EVENTS-22: 3-state machine transitions visible from the detail
// view. Each row carries the target estado + the testid the spec
// asserts. Hidden in readonly mode (REQ-EVENTS-27). Filtered into a
// computed so the template uses `v-for` without the legacy `v-if +
// v-for` combination (deprecated and broke Vue 3.5 compile).
interface Transicion {
  hacia: EstadoEvento
  etiqueta: string
  testid: string
  color: string
  variant: 'flat' | 'text'
}
const TRANSICIONES: readonly Transicion[] = [
  { hacia: 'en_curso', etiqueta: 'Iniciar evento', testid: 'evento-detalle-iniciar', color: 'primary', variant: 'flat' },
  { hacia: 'cerrado', etiqueta: 'Cerrar evento', testid: 'evento-detalle-cerrar', color: 'primary', variant: 'flat' },
  { hacia: 'cerrado', etiqueta: 'Cancelar evento', testid: 'evento-detalle-cancelar-estado', color: 'warning', variant: 'text' },
]
const transicionesVisibles = computed<Transicion[]>(() => {
  const estado = eventoActual.value?.estado
  if (!editable.value || !estado) return []
  return TRANSICIONES.filter((t) => {
    if (t.testid === 'evento-detalle-iniciar') return estado === 'planificacion'
    if (t.testid === 'evento-detalle-cerrar') return estado === 'en_curso'
    if (t.testid === 'evento-detalle-cancelar-estado') return estado === 'planificacion'
    return false
  })
})

function formatearFecha(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// REQ-FIN-1, REQ-FIN-4: single-day shows the start date once; multi-day
// shows "start – end". fecha_fin null/empty = single day.
function formatearFechaRango(inicio: string, fin: string | null): string {
  if (!fin || fin === inicio) return formatearFecha(inicio)
  return `${formatearFecha(inicio)} – ${formatearFecha(fin)}`
}

// REQ-FIN-2, REQ-FIN, PD-1: inline edit fields for fecha_fin and
// margen_ganancia. margen is stored as decimal 0..1 but rendered as a
// percentage 0..100 — the conversion lives here so the input is
// user-friendly.
const fechaFinBorrador = ref<string>('')
const margenPorcentajeBorrador = ref<string>('')

function cargarBorradoresDesdeEvento(): void {
  if (!eventoActual.value) return
  fechaFinBorrador.value = eventoActual.value.fecha_fin ?? ''
  margenPorcentajeBorrador.value = eventoActual.value.margen_ganancia !== null
    ? String(Math.round(eventoActual.value.margen_ganancia * 100))
    : '40'
}
watch(() => eventoActual.value?.id, cargarBorradoresDesdeEvento, { immediate: true })

async function guardarFechasMargen(): Promise<void> {
  if (!eventoActual.value || !eventoId.value) return
  const ev = eventoActual.value
  const margenDecimal = Number.parseFloat(margenPorcentajeBorrador.value) / 100
  await actualizar(eventoId.value, {
    nombre: ev.nombre,
    fecha: ev.fecha,
    fecha_fin: fechaFinBorrador.value === '' ? null : fechaFinBorrador.value,
    margen_ganancia: Number.isFinite(margenDecimal) ? margenDecimal : null,
    ubicacion: ev.ubicacion,
    estado: ev.estado,
    notas: ev.notas,
  })
}

onMounted(() => {
  if (eventoId.value) {
    void cargarPorId(eventoId.value)
    void cargarPorEvento(eventoId.value)
    void cargarPlan(eventoId.value)
    void epStore.cargarPorEvento(eventoId.value)
    // Ensure catalogs are loaded so the projection has receta costs.
    void useRecipesStore().cargarTodas()
    void useIngredientsStore().cargarTodas()
    void useProductosStore().cargarTodas()
  }
})

const mostrarDialogoEliminar = ref<boolean>(false)
const dialogoGastoAbierto = ref<boolean>(false)

async function transicionar(t: Transicion) {
  if (eventoId.value) await cambiarEstado(eventoId.value, t.hacia)
}
async function confirmarEliminar() {
  if (!eventoId.value) return
  const res = await eliminar(eventoId.value)
  if (!res.error) router.push({ name: 'eventos' })
  mostrarDialogoEliminar.value = false
}
async function manejarGastoSubmit(input: GastoFijoInput) {
  await agregar(input)
  dialogoGastoAbierto.value = false
}
function reintentar() {
  if (eventoId.value) {
    void cargarPorId(eventoId.value)
    void cargarPorEvento(eventoId.value)
    void cargarPlan(eventoId.value)
  }
}
function irAPlanificar() {
  if (eventoId.value) {
    router.push({ name: 'planificar-evento', params: { id: eventoId.value } })
  }
}
function irAReporte() {
  if (eventoId.value) {
    router.push({ name: 'evento-reporte', params: { id: eventoId.value } })
  }
}
</script>

<template>
  <v-container>
    <v-progress-linear v-if="cargando || cargandoGastos" indeterminate color="primary" />

    <v-alert v-if="(error || errorGastos) && !cargando && !cargandoGastos"
      type="error" class="mb-4" data-testid="evento-detalle-error">
      Error al cargar
      <template #append>
        <v-btn variant="text" data-testid="evento-detalle-reintentar" @click="reintentar">
          Reintentar
        </v-btn>
      </template>
    </v-alert>

    <template v-if="eventoActual">
      <div class="d-flex align-center ga-3 mb-2">
        <h1 data-testid="evento-detalle-titulo">{{ eventoActual.nombre }}</h1>
        <EventoStatusChip :estado="eventoActual.estado" />
      </div>
      <p class="mb-4 text-medium-emphasis" data-testid="evento-detalle-fechas">
        {{ formatearFechaRango(eventoActual.fecha, eventoActual.fecha_fin) }}
        <template v-if="eventoActual.ubicacion"> · {{ eventoActual.ubicacion }}</template>
      </p>

      <v-alert v-if="!editable" type="warning" class="mb-4"
        data-testid="evento-detalle-alerta-cerrado">
        Evento cerrado — no editable
      </v-alert>

      <div class="d-flex ga-2 mb-4 flex-wrap">
        <v-btn v-for="t in transicionesVisibles" :key="t.testid"
          :color="t.color" :variant="t.variant" :data-testid="t.testid" @click="transicionar(t)">
          {{ t.etiqueta }}
        </v-btn>
        <v-btn v-if="editable" color="primary" variant="flat"
          prepend-icon="mdi-clipboard-list" data-testid="evento-detalle-planificar"
          @click="irAPlanificar">
          Planificar producción
        </v-btn>
        <v-btn v-if="eventoActual.estado === 'cerrado'" color="success" variant="flat"
          prepend-icon="mdi-chart-line" data-testid="evento-detalle-ver-reporte"
          @click="irAReporte">
          Ver reporte
        </v-btn>
        <v-btn v-if="editable" color="error" variant="text"
          data-testid="evento-detalle-eliminar" @click="mostrarDialogoEliminar = true">
          Eliminar evento
        </v-btn>
      </div>

      <!-- REQ-FIN-2: inline edit fields for fecha_fin (multi-day) and
           margen_ganancia (PD-1). Hidden in read-only mode so a cerrado
           evento can't be mutated. -->
      <v-card v-if="editable" class="pa-4 mb-4" data-testid="evento-detalle-fechas-card">
        <div class="d-flex ga-3 align-end flex-wrap">
          <v-text-field
            v-model="fechaFinBorrador"
            type="date"
            label="Fecha fin (opcional)"
            data-testid="evento-detalle-fecha-fin"
            density="compact"
            hide-details
            clearable
            style="max-width: 220px"
          />
          <v-text-field
            v-model.number="margenPorcentajeBorrador"
            type="number"
            label="Margen (%)"
            data-testid="evento-detalle-margen"
            density="compact"
            hide-details
            min="0"
            max="90"
            step="1"
            suffix="%"
            style="max-width: 160px"
          />
          <v-btn
            color="primary"
            variant="flat"
            data-testid="evento-detalle-guardar-fechas"
            @click="guardarFechasMargen"
          >
            Guardar
          </v-btn>
        </div>
        <p v-if="!eventoActual.fecha_fin" class="text-caption text-medium-emphasis mt-2">
          Evento de un solo día — fecha fin vacía se trata como igual a fecha de inicio.
        </p>
      </v-card>

      <div class="mb-4" data-testid="evento-detalle-proyeccion">
        <ProyeccionCostosCard :proyeccion="proyeccion" />
      </div>

      <!-- Productos del evento (REQ-FIN-20): badge + link a EventoProductosView -->
      <v-card class="pa-4 mb-4" data-testid="evento-detalle-productos">
        <div class="d-flex align-center justify-space-between">
          <div>
            <h3 class="text-subtitle-1">Productos del evento</h3>
            <p class="text-body-2 text-medium-emphasis">
              {{ productosCount > 0 ? `${productosCount} producto(s) configurado(s)` : 'Sin productos configurados' }}
            </p>
          </div>
          <v-btn
            :color="productosCount > 0 ? 'primary' : 'success'"
            variant="flat"
            prepend-icon="mdi-package-variant"
            data-testid="evento-detalle-ir-productos"
            @click="router.push({ name: 'evento-productos', params: { id: eventoId } })"
          >
            {{ productosCount > 0 ? 'Configurar productos' : 'Inicializar desde catálogo' }}
          </v-btn>
        </div>
      </v-card>

      <div class="d-flex align-center justify-space-between mb-2">
        <h2>Gastos fijos</h2>
        <v-btn v-if="editable" color="primary" prepend-icon="mdi-plus" size="small"
          data-testid="evento-detalle-agregar-gasto" @click="dialogoGastoAbierto = true">
          Agregar gasto
        </v-btn>
      </div>

      <v-list v-if="gastos.length > 0" data-testid="evento-detalle-gastos">
        <GastoFijoListItem v-for="gasto in gastos" :key="gasto.id"
          :gasto="gasto" :editable="editable"
          @eliminar="(id) => eliminarGasto(id)" />
      </v-list>
      <v-card v-else class="pa-4 text-center text-medium-emphasis">
        Sin gastos fijos todavía
      </v-card>

      <v-dialog v-model="dialogoGastoAbierto" max-width="500">
        <v-card>
          <v-card-title>Nuevo gasto fijo</v-card-title>
          <v-card-text>
            <GastoFijoForm
              :valores-iniciales="eventoId ? { evento_id: eventoId, categoria: 'renta', monto: 0, descripcion: null } : null"
              @submit="manejarGastoSubmit" @cancel="dialogoGastoAbierto = false" />
          </v-card-text>
        </v-card>
      </v-dialog>

      <v-dialog v-model="mostrarDialogoEliminar" max-width="500">
        <v-card>
          <v-card-title>¿Eliminar "{{ eventoActual.nombre }}"?</v-card-title>
          <v-card-text>
            Se eliminarán {{ gastos.length }} gastos fijos, {{ planCount }} fila(s) del plan de producción, {{ productosCount }} configuración(es) de producto(s), todas las ventas y sus ítems, los gastos imprevistos y el cierre de caja asociado.
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" @click="mostrarDialogoEliminar = false">Cancelar</v-btn>
            <v-btn color="error" data-testid="evento-detalle-confirmar-eliminar"
              @click="confirmarEliminar">Eliminar</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </template>
  </v-container>
</template>
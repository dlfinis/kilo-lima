<script setup lang="ts">
// REQ-EVENTS-15, REQ-EVENTS-16, REQ-EVENTS-22, REQ-EVENTS-35,
// REQ-EVENTS-36, REQ-EVENTS-38: production-planning view.
// Composes the events + plans stores, the projection composable,
// the PlanProduccionGrid, and the ProyeccionCostosCard. Four
// states: loading, error, empty, populated. The `estadoEsEditable`
// gate drives both the grid's `editable` prop and a "back to
// detail" CTA when the evento is cerrado (REQ-EVENTS-16,
// REQ-EVENTS-35). On cerrado, the view redirects to the detail
// page with `?mensaje=evento-cerrado`.
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import EventoStatusChip from '@/components/business/EventoStatusChip.vue'
import PlanProduccionGrid from '@/components/business/PlanProduccionGrid.vue'
import ProyeccionCostosCard from '@/components/business/ProyeccionCostosCard.vue'
import { useEvents } from '@/composables/useEvents'
import { usePlans } from '@/composables/usePlans'
import { useProyeccionCostos } from '@/composables/useProyeccionCostos'
import { estadoEsEditable } from '@/utils/estado'

const route = useRoute()
const router = useRouter()

const eventoId = computed<string | null>(() => {
  const value = route.params.id
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? null : null
})

const { eventoActual, cargarPorId } = useEvents()
const { planesPorEvento, cargando: cargandoPlan, error: errorPlan, cargarPorEvento, guardarPlan } = usePlans()
const proyeccion = useProyeccionCostos(eventoId)

const editable = computed(() =>
  eventoActual.value ? estadoEsEditable(eventoActual.value.estado) : true,
)
const filasIniciales = computed(() =>
  eventoId.value ? planesPorEvento.value.get(eventoId.value) ?? [] : [],
)

const cargando = computed(() => cargandoPlan.value)
const error = computed(() => errorPlan.value)

onMounted(async () => {
  if (!eventoId.value) return
  const resultado = await cargarPorId(eventoId.value)
  // Redirect to detail when the evento is cerrado (REQ-EVENTS-35).
  if (resultado.data && resultado.data.estado === 'cerrado') {
    router.replace({
      name: 'evento-detalle',
      params: { id: eventoId.value },
      query: { mensaje: 'evento-cerrado' },
    })
    return
  }
  await cargarPorEvento(eventoId.value)
})

async function manejarGuardar(filas: import('@/types').PlanProduccionInput[]) {
  if (!eventoId.value) return
  const res = await guardarPlan(eventoId.value, filas)
  if (!res.error) {
    router.push({ name: 'evento-detalle', params: { id: eventoId.value } })
  }
}

function volver() {
  if (eventoId.value) {
    router.push({ name: 'evento-detalle', params: { id: eventoId.value } })
  } else {
    router.push({ name: 'eventos' })
  }
}

function reintentar() {
  if (eventoId.value) {
    void cargarPorEvento(eventoId.value)
  }
}

function formatearFecha(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
</script>

<template>
  <v-container>
    <v-btn variant="text" prepend-icon="mdi-arrow-left" class="mb-2"
      data-testid="planificar-volver" @click="volver">
      Volver
    </v-btn>

    <v-progress-linear v-if="cargando" indeterminate color="primary" data-testid="planificar-loading" />

    <v-alert v-if="error && !cargando" type="error" class="mb-4" data-testid="planificar-error">
      {{ error }}
      <template #append>
        <v-btn variant="text" data-testid="planificar-reintentar" @click="reintentar">
          Reintentar
        </v-btn>
      </template>
    </v-alert>

    <template v-if="eventoActual">
      <div class="d-flex align-center ga-3 mb-2">
        <h1 data-testid="planificar-titulo">{{ eventoActual.nombre }}</h1>
        <EventoStatusChip :estado="eventoActual.estado" />
      </div>
      <p class="mb-4 text-medium-emphasis">
        {{ formatearFecha(eventoActual.fecha) }}
      </p>

      <v-alert v-if="!editable" type="warning" class="mb-4" data-testid="planificar-alerta-cerrado">
        Evento cerrado — no editable
      </v-alert>

      <div class="planificar-grid d-flex ga-4">
        <v-card class="pa-4 flex-grow-1" data-testid="planificar-grid-card">
          <h2 class="mb-2">Plan de producción</h2>
          <PlanProduccionGrid
            :evento-id="eventoActual.id"
            :filas-iniciales="filasIniciales"
            :editable="editable"
            @save="manejarGuardar"
          />
        </v-card>

        <div class="planificar-rail" style="min-width: 360px">
          <ProyeccionCostosCard :proyeccion="proyeccion" />
        </div>
      </div>
    </template>
  </v-container>
</template>
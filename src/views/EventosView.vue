<script setup lang="ts">
// REQ-EVENTS-1, REQ-EVENTS-7, REQ-EVENTS-8, REQ-EVENTS-9,
// REQ-EVENTS-38, REQ-EVENTS-39: list view. Wires useEvents() +
// EventoListItem + EventoForm. Four UX states (loading/empty/error/
// data), filter tabs by estado (REQ-EVENTS-8), sort by fecha desc
// (REQ-EVENTS-9, served by the service.order). Delete confirmation
// lives here so the list-item stays presentational.
import { computed, onMounted, ref } from 'vue'

import EventoForm from '@/components/business/EventoForm.vue'
import EventoListItem from '@/components/business/EventoListItem.vue'
import FabNuevo from '@/components/business/FabNuevo.vue'
import { useEvents } from '@/composables/useEvents'
import { useEventoResumen } from '@/composables/useEventoResumen'
import type { Evento, EventoInput, EstadoEvento } from '@/types'

const { eventos, cargando, error, cargarTodas, crear, eliminar } = useEvents()
const eventoResumen = useEventoResumen()

type Dialogo =
  | { tipo: 'cerrado' }
  | { tipo: 'crear' }
  | { tipo: 'eliminar'; evento: Evento }

const dialogo = ref<Dialogo>({ tipo: 'cerrado' })
const filtro = ref<EstadoEvento | 'todos'>('todos')

// REQ-UX-24: keep the FAB visible while the list is short to keep
// the primary action discoverable; once the list grows past 5 the
// FAB becomes clutter and the inline "+ Nuevo evento" button takes
// over to avoid overlapping the dense list of cards.
const fabVisible = computed<boolean>(() => eventos.value.length < 5)

const eventosFiltrados = computed<Evento[]>(() => {
  const lista = filtro.value === 'todos' ? eventos.value : eventos.value.filter((e) => e.estado === filtro.value)
  // Service already sorts by fecha desc; client-side filter preserves order.
  return [...lista].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
})

onMounted(() => {
  cargarTodas()
})

async function manejarSubmit(input: EventoInput) {
  await crear(input)
  dialogo.value = { tipo: 'cerrado' }
}

async function confirmarEliminar() {
  if (dialogo.value.tipo !== 'eliminar') return
  await eliminar(dialogo.value.evento.id)
  dialogo.value = { tipo: 'cerrado' }
}

function abrirCrear() {
  dialogo.value = { tipo: 'crear' }
}

function abrirEliminar(id: string) {
  const ev = eventos.value.find((x) => x.id === id)
  if (ev) dialogo.value = { tipo: 'eliminar', evento: ev }
}

function cerrarDialogo() {
  dialogo.value = { tipo: 'cerrado' }
}

function seleccionarFiltro(value: EstadoEvento | 'todos') {
  filtro.value = value
}
</script>

<template>
  <v-container>
    <div class="d-flex align-center justify-space-between mb-4">
      <h1>Eventos</h1>
      <v-btn
        v-if="!fabVisible"
        color="primary"
        prepend-icon="mdi-plus"
        data-testid="evento-nuevo"
        @click="abrirCrear"
      >
        Nuevo evento
      </v-btn>
    </div>

    <FabNuevo
      v-if="fabVisible"
      testid="evento-fab-nuevo"
      ariaLabel="Nuevo evento"
      @click="abrirCrear"
    />

    <v-tabs v-model="filtro" color="primary" class="mb-4">
      <v-tab value="todos" @click="seleccionarFiltro('todos')">Todos</v-tab>
      <v-tab value="planificacion" @click="seleccionarFiltro('planificacion')">Planificación</v-tab>
      <v-tab value="en_curso" @click="seleccionarFiltro('en_curso')">En curso</v-tab>
      <v-tab value="cerrado" @click="seleccionarFiltro('cerrado')">Cerrado</v-tab>
    </v-tabs>

    <v-progress-linear v-if="cargando" indeterminate color="primary" data-testid="evento-loading" />

    <v-alert v-if="error" type="error" class="mb-4" data-testid="evento-error">
      {{ error }}
      <template #append>
        <v-btn variant="text" @click="cargarTodas()">Reintentar</v-btn>
      </template>
    </v-alert>

    <v-card
      v-if="!cargando && eventosFiltrados.length === 0 && !error"
      class="pa-6 text-center"
      data-testid="evento-empty"
    >
      <p class="text-h6 mb-4">No hay eventos todavía</p>
      <v-btn color="primary" @click="abrirCrear">Crear primer evento</v-btn>
    </v-card>

    <v-list v-if="eventosFiltrados.length > 0" data-testid="evento-list">
      <EventoListItem
        v-for="ev in eventosFiltrados"
        :key="ev.id"
        :evento="ev"
        :costo-total="eventoResumen.get(ev.id)?.costoTotal ?? 0"
        :unidades-planificadas="eventoResumen.get(ev.id)?.unidadesPlanificadas ?? 0"
        :break-even-unidades="eventoResumen.get(ev.id)?.breakEvenUnidades ?? null"
        @click="(id) => $router.push(`/eventos/${id}`)"
        @eliminar="abrirEliminar"
      />
    </v-list>

    <v-dialog
      :model-value="dialogo.tipo === 'crear'"
      max-width="600"
      @update:model-value="(v) => { if (!v) cerrarDialogo() }"
    >
      <v-card>
        <v-card-title>Nuevo evento</v-card-title>
        <v-card-text>
          <EventoForm @submit="manejarSubmit" @cancel="cerrarDialogo" />
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog
      :model-value="dialogo.tipo === 'eliminar'"
      max-width="400"
      @update:model-value="(v) => { if (!v) cerrarDialogo() }"
    >
      <v-card v-if="dialogo.tipo === 'eliminar'">
        <v-card-title>¿Eliminar {{ dialogo.evento.nombre }}?</v-card-title>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="cerrarDialogo">Cancelar</v-btn>
          <v-btn color="error" data-testid="evento-confirmar-eliminar" @click="confirmarEliminar">
            Eliminar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

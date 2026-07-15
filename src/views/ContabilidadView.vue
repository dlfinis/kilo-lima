<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useEventsStore } from '@/stores/events.store'

const router = useRouter()
const eventsStore = useEventsStore()

const cargando = ref(false)

const eventosCerrados = computed(() =>
  eventsStore.eventos.filter((e) => e.estado === 'cerrado'),
)

function irAContabilidad(eventoId: string) {
  router.push({ name: 'contabilidad-evento', params: { id: eventoId } })
}

onMounted(async () => {
  cargando.value = true
  await eventsStore.cargarTodas()
  cargando.value = false
})
</script>

<template>
  <v-container>
    <h1 class="text-h5 mb-4">Contabilidad</h1>

    <v-progress-linear v-if="cargando" indeterminate color="primary" class="mb-4" />

    <template v-if="eventosCerrados.length > 0">
      <v-list>
        <v-list-subheader>Eventos cerrados</v-list-subheader>
        <v-list-item
          v-for="evento in eventosCerrados"
          :key="evento.id"
          :title="evento.nombre"
          :subtitle="evento.fecha"
          @click="irAContabilidad(evento.id)"
        >
          <template #append>
            <v-btn variant="text" size="small" color="primary">
              Ver contabilidad
            </v-btn>
          </template>
        </v-list-item>
      </v-list>
    </template>

    <template v-else-if="!cargando">
      <v-alert type="info" variant="tonal">
        No hay eventos cerrados con contabilidad disponible.
      </v-alert>
      <v-card class="mt-4">
        <v-card-text>
          <p class="text-body-1">
            La contabilidad de cada evento está disponible en la vista de detalle del evento,
            bajo la pestaña <strong>Contabilidad</strong>. Una vez que un evento se cierra,
            su resumen contable también aparece aquí.
          </p>
        </v-card-text>
      </v-card>
    </template>
  </v-container>
</template>

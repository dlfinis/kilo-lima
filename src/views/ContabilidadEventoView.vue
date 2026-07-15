<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import SociosEventoDialog from '@/components/business/SociosEventoDialog.vue'
import AporteForm from '@/components/business/AporteForm.vue'
import ContabilidadResumenCard from '@/components/business/ContabilidadResumenCard.vue'
import DistribucionCard from '@/components/business/DistribucionCard.vue'
import TimelineMovimientos from '@/components/business/TimelineMovimientos.vue'
import { useSociosStore } from '@/stores/socios.store'
import { useGastosFijosStore } from '@/stores/gastosFijos.store'
import { useGastosImprevistosStore } from '@/stores/gastosImprevistos.store'
import { useVentasStore } from '@/stores/ventas.store'
import { useContabilidad } from '@/composables/useContabilidad'
import type { AporteInput } from '@/types'

const route = useRoute()
const router = useRouter()

const eventoId = computed<string | null>(() => {
  const value = route.params.id
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? null : null
})

const sociosStore = useSociosStore()
const {
  resumen,
  distribucion,
  timeline,
  cargando,
  error,
  cargarTodo,
} = useContabilidad(eventoId)

const dialogoSocios = ref(false)
const dialogoAporte = ref(false)

function irADetalle() {
  if (eventoId.value) {
    router.push({ name: 'evento-detalle', params: { id: eventoId.value } })
  }
}

onMounted(() => {
  if (eventoId.value) {
    void cargarTodo()
    void useGastosFijosStore().cargarPorEvento(eventoId.value)
    void useGastosImprevistosStore().cargarPorEvento(eventoId.value)
    void useVentasStore().cargarPorEvento(eventoId.value)
    if (sociosStore.socios.length === 0) {
      void sociosStore.cargarTodos()
    }
  }
})

async function manejarAporteSubmit(input: AporteInput) {
  if (!eventoId.value) return
  await sociosStore.crearAporte({
    ...input,
    evento_id: eventoId.value,
  })
  dialogoAporte.value = false
}
</script>

<template>
  <v-container>
    <v-progress-linear v-if="cargando" indeterminate color="primary" />

    <v-alert v-if="error" type="error" class="mb-4">
      {{ error }}
      <template #append>
        <v-btn variant="text" @click="cargarTodo">Reintentar</v-btn>
      </template>
    </v-alert>

    <template v-if="eventoId">
      <div class="d-flex align-center ga-3 mb-4 flex-wrap">
        <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="irADetalle">
          Volver
        </v-btn>
        <h1>Contabilidad</h1>
        <v-spacer />
        <v-btn color="primary" variant="flat" prepend-icon="mdi-account-group"
          @click="dialogoSocios = true">
          Gestionar socios
        </v-btn>
      </div>

      <div class="d-flex ga-2 mb-4 flex-wrap">
        <v-btn color="secondary" variant="flat" prepend-icon="mdi-hand-coin"
          @click="dialogoAporte = true">
          + Aporte capital
        </v-btn>
      </div>

      <v-row>
        <v-col cols="12" md="6">
          <ContabilidadResumenCard :resumen="resumen" />
        </v-col>
        <v-col cols="12" md="6">
          <DistribucionCard :distribucion="distribucion" />
        </v-col>
      </v-row>

      <v-card class="pa-4 mb-4">
        <h2 class="text-subtitle-1 mb-2">Movimientos</h2>
        <TimelineMovimientos :movimientos="timeline" :cargando="cargando" />
      </v-card>
    </template>

    <v-alert v-else type="warning">
      No se encontró el evento
    </v-alert>

    <SociosEventoDialog v-if="eventoId" v-model="dialogoSocios" :evento-id="eventoId" />

    <v-dialog v-if="eventoId" v-model="dialogoAporte" max-width="500">
      <v-card>
        <v-card-title>Registrar aporte de capital</v-card-title>
        <v-card-text>
          <AporteForm :evento-id="eventoId" @submit="manejarAporteSubmit"
            @cancel="dialogoAporte = false" />
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-container>
</template>

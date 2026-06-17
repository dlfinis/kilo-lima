<script setup lang="ts">
// REQ-CATALOG-14..16, REQ-CATALOG-30, REQ-CATALOG-35, REQ-CATALOG-46:
// the recipe detail view reads the route param `:id`, loads the recipe
// into the store on mount (or finds it in the cache), and renders the
// cost breakdown via `<RecetaCostoDesglose>`. The `costoPorReceta` getter
// is reactive: when an ingredient's `costo_por_unidad` changes, the
// breakdown recomputes without manual watchers (REQ-CATALOG-15).
// If the id is unknown, the view shows "Receta no encontrada" instead
// of a blank page.
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import RecetaCostoDesglose from '@/components/business/RecetaCostoDesglose.vue'
import { useRecipes } from '@/composables/useRecipes'
import { useCalculoReceta } from '@/composables/useCalculoReceta'

const route = useRoute()
const router = useRouter()
const { recetas, cargarTodas } = useRecipes()

const recetaId = computed<string | null>(() => {
  const value = route.params.id
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? null : null
})

const receta = computed(() =>
  recetaId.value ? recetas.value.find((r) => r.id === recetaId.value) ?? null : null,
)

const calculo = useCalculoReceta(recetaId)

onMounted(() => {
  if (recetas.value.length === 0) cargarTodas()
})

function volver() {
  router.push({ name: 'recetas' })
}
</script>

<template>
  <v-container>
    <v-btn
      v-if="receta"
      variant="text"
      prepend-icon="mdi-arrow-left"
      class="mb-2"
      data-testid="receta-detalle-volver"
      @click="volver"
    >
      Volver
    </v-btn>

    <v-progress-linear v-if="!receta && recetas.length === 0" indeterminate color="primary" />

    <v-alert
      v-if="!receta && recetas.length > 0"
      type="warning"
      class="mb-4"
      data-testid="receta-detalle-no-encontrada"
    >
      Receta no encontrada.
    </v-alert>

    <template v-if="receta">
      <h1 data-testid="receta-detalle-titulo">{{ receta.nombre }}</h1>
      <p v-if="receta.descripcion" class="mb-4" data-testid="receta-detalle-descripcion">
        {{ receta.descripcion }}
      </p>
      <p v-else class="mb-4 text-medium-emphasis">Sin descripción</p>

      <v-card class="mb-4 pa-4">
        <p><strong>Rendimiento:</strong> {{ receta.rendimiento_unidades }} unidades</p>
      </v-card>

      <h2 class="mb-2">Desglose de costo</h2>
      <RecetaCostoDesglose v-if="calculo" :calculo="calculo" />
    </template>
  </v-container>
</template>

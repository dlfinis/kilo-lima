<script setup lang="ts">
// inventory-tabs-redesign / Work Unit 2: global movement history tab.
// Loads stock movements on mount, supports type/material filtering,
// and displays correction/ajuste context inline. Uses the presentational
// StockMovementList for rendering — this tab owns only orchestration.
import { computed, onMounted, ref } from 'vue'

import StockMovementList from '@/components/inventario/StockMovementList.vue'
import { useIngredients } from '@/composables/useIngredients'
import { useStockMovementsStore } from '@/stores/stockMovements.store'
import type { StockMovement, TipoMovimiento } from '@/types'

const { materiasPrimas, cargarTodas: cargarMaterias } = useIngredients()
const store = useStockMovementsStore()

// ----- filters -----
const filtroTipo = ref<TipoMovimiento | 'todos'>('todos')
const filtroMateria = ref<string | null>(null)

// ----- data -----
const materiaNames = computed<Map<string, string>>(() => {
  const map = new Map<string, string>()
  for (const mp of materiasPrimas.value) {
    map.set(mp.id, mp.nombre)
  }
  return map
})

const movementsFiltrados = computed<StockMovement[]>(() => {
  let lista = [...store.movements]
  if (filtroTipo.value !== 'todos') {
    lista = lista.filter((m) => m.tipo === filtroTipo.value)
  }
  if (filtroMateria.value) {
    lista = lista.filter((m) => m.materia_prima_id === filtroMateria.value)
  }
  return lista
})

const sinCoincidencias = computed<boolean>(
  () => store.movements.length > 0 && movementsFiltrados.value.length === 0,
)

const materiaOptions = computed(() =>
  materiasPrimas.value.map((mp) => ({
    title: `${mp.nombre} (${mp.unidad})`,
    value: mp.id,
  })),
)

// ----- lifecycle -----
onMounted(async () => {
  if (materiasPrimas.value.length === 0) {
    await cargarMaterias()
  }
  await store.cargarMovimientos()
})
</script>

<template>
  <v-container>
    <div class="d-flex align-center justify-space-between mb-4">
      <h1>Movimientos</h1>
    </div>

    <!-- Filters -->
    <div class="d-flex align-center flex-wrap ga-3 mb-4">
      <v-btn-toggle
        v-model="filtroTipo"
        mandatory
        variant="outlined"
        divided
        density="comfortable"
        data-testid="movement-filter-tipo"
      >
        <v-btn value="todos" size="small" data-testid="movement-filter-all">
          Todos
        </v-btn>
        <v-btn value="compra" size="small" data-testid="movement-filter-compra">
          Compras
        </v-btn>
        <v-btn value="consumo" size="small" data-testid="movement-filter-consumo">
          Consumos
        </v-btn>
        <v-btn value="correccion" size="small" data-testid="movement-filter-correccion">
          Correcciones
        </v-btn>
        <v-btn value="ajuste" size="small" data-testid="movement-filter-ajuste">
          Ajustes
        </v-btn>
      </v-btn-toggle>

      <v-autocomplete
        v-model="filtroMateria"
        :items="materiaOptions"
        label="Materia prima"
        clearable
        variant="outlined"
        density="comfortable"
        class="ml-auto"
        style="max-width: 280px"
        data-testid="movement-filter-materia"
        hide-details
      />
    </div>

    <!-- Loading -->
    <v-progress-linear
      v-if="store.cargando"
      indeterminate
      color="primary"
      data-testid="movement-loading"
    />

    <!-- Error -->
    <v-alert
      v-if="store.error"
      type="error"
      class="mb-4"
      data-testid="movement-error"
    >
      {{ store.error }}
      <template #append>
        <v-btn variant="text" @click="store.cargarMovimientos()">
          Reintentar
        </v-btn>
      </template>
    </v-alert>

    <!-- Empty filter result -->
    <v-card v-if="!store.cargando && sinCoincidencias && !store.error" class="pa-6 text-center" data-testid="movement-empty-filter">
      <p class="text-h6 mb-4">No hay movimientos que coincidan con el filtro actual</p>
      <v-btn variant="outlined" @click="filtroTipo = 'todos'; filtroMateria = null">
        Limpiar filtros
      </v-btn>
    </v-card>

    <!-- Empty global -->
    <v-card v-if="!store.cargando && store.movements.length === 0 && !store.error" class="pa-6 text-center" data-testid="movement-empty-global">
      <v-icon size="48" color="medium-emphasis" class="mb-2">mdi-swap-horizontal</v-icon>
      <p class="text-h6 mb-2">Sin movimientos</p>
      <p class="text-body-1 text-medium-emphasis">Los movimientos de inventario aparecerán aquí cuando se registren compras, consumos o ajustes.</p>
    </v-card>

    <!-- Movement list -->
    <StockMovementList
      v-if="movementsFiltrados.length > 0"
      :movements="movementsFiltrados"
      :materia-names="materiaNames"
    />
  </v-container>
</template>

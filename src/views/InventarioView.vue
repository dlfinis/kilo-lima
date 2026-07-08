<script setup lang="ts">
// REQ-CATALOG-1..8, REQ-CATALOG-35, REQ-CATALOG-38..41, REQ-CATALOG-46:
// view layer wires useIngredients() composable + MateriaPrimaForm +
// MateriaPrimaListItem. The four UX states (loading / empty / error /
// data) follow the brief's lockup. Delete confirmation lives here so
// the list-item stays presentational (REQ-CATALOG-41).
//
// mobile-ux-redesign Phase 4: adds StockAlertsList for inventory alerts
// and ProductionCapacityCard for each producible product.
import { computed, onMounted, ref } from 'vue'

import FabNuevo from '@/components/business/FabNuevo.vue'
import MateriaPrimaForm from '@/components/business/MateriaPrimaForm.vue'
import MateriaPrimaListItem from '@/components/business/MateriaPrimaListItem.vue'
import StockAlertsList from '@/components/inventario/StockAlertsList.vue'
import ProductionCapacityCard from '@/components/inventario/ProductionCapacityCard.vue'
import { useIngredients } from '@/composables/useIngredients'
import { useRecipesStore } from '@/stores/recipes.store'
import type { MateriaPrima, MateriaPrimaInput, RecetaConIngredientes } from '@/types'

const { materiasPrimas, cargando, error, cargarTodas, crear, actualizar, eliminar } = useIngredients()

type Dialogo =
  | { tipo: 'cerrado' }
  | { tipo: 'crear' }
  | { tipo: 'editar'; materia: MateriaPrima }
  | { tipo: 'eliminar'; materia: MateriaPrima }

const dialogo = ref<Dialogo>({ tipo: 'cerrado' })
const materiaEnEdicion = computed<MateriaPrimaInput | null>(() =>
  dialogo.value.tipo === 'editar'
    ? {
        nombre: dialogo.value.materia.nombre,
        unidad: dialogo.value.materia.unidad,
        costo_por_unidad: dialogo.value.materia.costo_por_unidad,
        notas: dialogo.value.materia.notas,
      }
    : null,
)

onMounted(() => {
  cargarTodas()
})

// Phase 4: Products with recipes for ProductionCapacityCard.
// Each recipe becomes a "product" shape the card can consume.
const recipesStore = useRecipesStore()

const productosConReceta = computed(() =>
  recipesStore.recetas.map((r: RecetaConIngredientes) => ({
    id: r.id,
    nombre: r.nombre,
    receta: r.ingredientes.map((i) => ({
      materia_prima_id: i.materia_prima_id,
      cantidad: i.cantidad,
    })),
  })),
)

async function manejarSubmit(input: MateriaPrimaInput) {
  if (dialogo.value.tipo === 'editar') {
    await actualizar(dialogo.value.materia.id, input)
  } else {
    await crear(input)
  }
  dialogo.value = { tipo: 'cerrado' }
}

async function confirmarEliminar() {
  if (dialogo.value.tipo !== 'eliminar') return
  const id = dialogo.value.materia.id
  await eliminar(id)
  dialogo.value = { tipo: 'cerrado' }
}

function abrirCrear() {
  dialogo.value = { tipo: 'crear' }
}

function abrirEditar(id: string) {
  const mat = materiasPrimas.value.find((x) => x.id === id)
  if (mat) dialogo.value = { tipo: 'editar', materia: mat }
}

function abrirEliminar(id: string) {
  const mat = materiasPrimas.value.find((x) => x.id === id)
  if (mat) dialogo.value = { tipo: 'eliminar', materia: mat }
}

function cerrarDialogo() {
  dialogo.value = { tipo: 'cerrado' }
}
</script>

<template>
  <v-container>
    <div class="d-flex align-center justify-space-between mb-4">
      <h1>Inventario</h1>
    </div>

    <!-- Phase 4: Stock alerts section (prominent, at top) -->
    <StockAlertsList />

    <!-- Phase 4: Production capacity per product recipe -->
    <v-row v-if="productosConReceta.length > 0" class="mb-4">
      <v-col
        v-for="p in productosConReceta"
        :key="p.id"
        cols="12"
        sm="6"
        md="4"
      >
        <ProductionCapacityCard :producto="p" />
      </v-col>
    </v-row>

    <!-- Existing materias primas CRUD section -->
    <FabNuevo
      testid="materia-prima-fab-nuevo"
      ariaLabel="Nueva materia prima"
      @click="abrirCrear"
    />

    <v-progress-linear v-if="cargando" indeterminate color="primary" data-testid="mp-loading" />

    <v-alert
      v-if="error"
      type="error"
      class="mb-4"
      data-testid="mp-error"
    >
      {{ error }}
      <template #append>
        <v-btn variant="text" @click="cargarTodas()">Reintentar</v-btn>
      </template>
    </v-alert>

    <v-card v-if="!cargando && materiasPrimas.length === 0 && !error" class="pa-6 text-center" data-testid="mp-empty">
      <p class="text-h6 mb-4">No hay materias primas todavía</p>
      <v-btn color="primary" @click="abrirCrear">
        Agregar primera materia prima
      </v-btn>
    </v-card>

    <v-list v-if="materiasPrimas.length > 0" data-testid="mp-list">
      <MateriaPrimaListItem
        v-for="m in materiasPrimas"
        :key="m.id"
        :materia="m"
        @edit="abrirEditar"
        @delete="abrirEliminar"
      />
    </v-list>

    <v-dialog :model-value="dialogo.tipo === 'crear' || dialogo.tipo === 'editar'" max-width="600" @update:model-value="(v) => { if (!v) cerrarDialogo() }">
      <v-card>
        <v-card-title>{{ dialogo.tipo === 'editar' ? 'Editar materia prima' : 'Nueva materia prima' }}</v-card-title>
        <v-card-text>
          <MateriaPrimaForm
            :valores-iniciales="materiaEnEdicion"
            @submit="manejarSubmit"
            @cancel="cerrarDialogo"
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="dialogo.tipo === 'eliminar'" max-width="400" @update:model-value="(v) => { if (!v) cerrarDialogo() }">
      <v-card v-if="dialogo.tipo === 'eliminar'">
        <v-card-title>¿Eliminar {{ dialogo.materia.nombre }}?</v-card-title>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="cerrarDialogo">Cancelar</v-btn>
          <v-btn color="error" @click="confirmarEliminar">Eliminar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

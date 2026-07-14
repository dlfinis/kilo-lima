<script setup lang="ts">
// REQ-CATALOG-1..8, REQ-CATALOG-35, REQ-CATALOG-38..41, REQ-CATALOG-46:
// view layer wires useIngredients() composable + MateriaPrimaForm +
// MateriaPrimaListItem. The four UX states (loading / empty / error /
// data) follow the brief's lockup. Delete confirmation lives here so
// the list-item stays presentational (REQ-CATALOG-41).
import { computed, onMounted, ref } from 'vue'

import FabNuevo from '@/components/business/FabNuevo.vue'
import MateriaPrimaForm from '@/components/business/MateriaPrimaForm.vue'
import MateriaPrimaListItem from '@/components/business/MateriaPrimaListItem.vue'
import { useIngredients } from '@/composables/useIngredients'
import { useStockMovementsStore } from '@/stores/stockMovements.store'
import type { MateriaPrima, MateriaPrimaInput, CategoriaMateriaPrima } from '@/types'

const { materiasPrimas, cargando, error, cargarTodas, crear, actualizar, eliminar } = useIngredients()
const stockMovementsStore = useStockMovementsStore()

const stockDerivadoMap = computed<Map<string, number>>(() => {
  const map = new Map<string, number>()
  for (const entry of stockMovementsStore.stockActual) {
    map.set(entry.materia_prima_id, entry.stock_actual)
  }
  return map
})

const filtroCategoria = ref<CategoriaMateriaPrima | 'todos'>('todos')
const ordenAlfabetico = ref<'asc' | 'desc'>('asc')

const materiasPrimasFiltradas = computed<MateriaPrima[]>(() => {
  const lista = filtroCategoria.value === 'todos'
    ? [...materiasPrimas.value]
    : materiasPrimas.value.filter((m) => m.categoria === filtroCategoria.value)

  lista.sort((a, b) => {
    const cmp = a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    return ordenAlfabetico.value === 'asc' ? cmp : -cmp
  })

  return lista
})

const sinCoincidenciasFiltro = computed<boolean>(
  () => materiasPrimas.value.length > 0 && materiasPrimasFiltradas.value.length === 0,
)

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
        categoria: dialogo.value.materia.categoria,
        notas: dialogo.value.materia.notas,
      }
    : null,
)

onMounted(() => {
  cargarTodas()
  void stockMovementsStore.cargarStockActual()
})

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

    <!-- Category filter + alphabetical sort controls -->
    <div class="d-flex align-center flex-wrap ga-3 mb-4">
      <div class="d-flex align-center ga-2">
        <v-btn
          :color="filtroCategoria === 'todos' ? 'grey' : undefined"
          :variant="filtroCategoria === 'todos' ? 'tonal' : 'text'"
          size="small"
          data-testid="mp-filter-todos"
          @click="filtroCategoria = 'todos'"
        >
          Todos
        </v-btn>
        <v-btn
          :color="filtroCategoria === 'ingrediente' ? 'primary' : undefined"
          :variant="filtroCategoria === 'ingrediente' ? 'tonal' : 'text'"
          size="small"
          data-testid="mp-filter-ingrediente"
          @click="filtroCategoria = 'ingrediente'"
        >
          Ingredientes
        </v-btn>
        <v-btn
          :color="filtroCategoria === 'empaque' ? 'secondary' : undefined"
          :variant="filtroCategoria === 'empaque' ? 'tonal' : 'text'"
          size="small"
          data-testid="mp-filter-empaque"
          @click="filtroCategoria = 'empaque'"
        >
          Empaques
        </v-btn>
      </div>
      <v-divider vertical class="mx-2" />
      <div class="d-flex align-center ga-1">
        <v-btn
          :color="ordenAlfabetico === 'asc' ? 'primary' : undefined"
          :variant="ordenAlfabetico === 'asc' ? 'tonal' : 'text'"
          size="small"
          icon="mdi-sort-alphabetical-ascending"
          aria-label="Ordenar A-Z"
          data-testid="mp-sort-asc"
          @click="ordenAlfabetico = 'asc'"
        />
        <v-btn
          :color="ordenAlfabetico === 'desc' ? 'primary' : undefined"
          :variant="ordenAlfabetico === 'desc' ? 'tonal' : 'text'"
          size="small"
          icon="mdi-sort-alphabetical-descending"
          aria-label="Ordenar Z-A"
          data-testid="mp-sort-desc"
          @click="ordenAlfabetico = 'desc'"
        />
      </div>
    </div>

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

    <v-card v-if="!cargando && sinCoincidenciasFiltro && !error" class="pa-6 text-center" data-testid="mp-empty-filter">
      <p class="text-h6 mb-4">No hay materias primas que coincidan con el filtro actual</p>
      <v-btn variant="outlined" @click="filtroCategoria = 'todos'">
        Limpiar filtro
      </v-btn>
    </v-card>

    <v-card v-if="!cargando && materiasPrimas.length === 0 && !error" class="pa-6 text-center" data-testid="mp-empty-global">
      <p class="text-h6 mb-4">No hay materias primas todavía</p>
      <v-btn color="primary" @click="abrirCrear">
        Agregar primera materia prima
      </v-btn>
    </v-card>

    <v-list v-if="materiasPrimasFiltradas.length > 0" data-testid="mp-list">
      <MateriaPrimaListItem
        v-for="m in materiasPrimasFiltradas"
        :key="m.id"
        :materia="m"
        :stock-actual="stockDerivadoMap.get(m.id) ?? null"
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

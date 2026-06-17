<script setup lang="ts">
// REQ-CATALOG-1..8, REQ-CATALOG-35, REQ-CATALOG-38..41, REQ-CATALOG-46:
// view layer wires useIngredients() composable + MateriaPrimaForm +
// MateriaPrimaListItem. The four UX states (loading / empty / error /
// data) follow the brief's lockup. Delete confirmation lives here so
// the list-item stays presentational (REQ-CATALOG-41).
import { computed, onMounted, ref } from 'vue'

import MateriaPrimaForm from '@/components/business/MateriaPrimaForm.vue'
import MateriaPrimaListItem from '@/components/business/MateriaPrimaListItem.vue'
import { useIngredients } from '@/composables/useIngredients'
import type { MateriaPrima, MateriaPrimaInput } from '@/types'

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
      <h1>Materias primas</h1>
      <v-btn
        v-if="materiasPrimas.length > 0 || !cargando"
        color="primary"
        prepend-icon="mdi-plus"
        data-testid="mp-nueva"
        @click="abrirCrear"
      >
        Nueva materia prima
      </v-btn>
    </div>

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

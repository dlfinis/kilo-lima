<script setup lang="ts">
// REQ-CATALOG-9, REQ-CATALOG-10..13, REQ-CATALOG-35, REQ-CATALOG-38..41,
// REQ-CATALOG-46: view wires useRecipes() composable + RecetaForm + the
// ingredient store for the autocomplete. Four UX states (loading / empty
// / error / data) match the ingredients view lockup. Row click navigates
// to the recipe-detail route (REQ-CATALOG-30). Delete confirmation
// dialog lives here, the form stays presentational.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import RecetaForm from '@/components/business/RecetaForm.vue'
import { useRecipes } from '@/composables/useRecipes'
import { useIngredients } from '@/composables/useIngredients'
import type { RecetaConIngredientes, RecetaInputCompleto } from '@/types'

const { recetas, cargando, error, cargarTodas, crear, actualizar, eliminar } = useRecipes()
const { materiasPrimas, cargarTodas: cargarIngredientes } = useIngredients()
const router = useRouter()

type Dialogo =
  | { tipo: 'cerrado' }
  | { tipo: 'crear' }
  | { tipo: 'editar'; receta: RecetaConIngredientes }
  | { tipo: 'eliminar'; receta: RecetaConIngredientes }

const dialogo = ref<Dialogo>({ tipo: 'cerrado' })
const recetaEnEdicion = computed<RecetaInputCompleto | null>(() =>
  dialogo.value.tipo === 'editar'
    ? {
        nombre: dialogo.value.receta.nombre,
        descripcion: dialogo.value.receta.descripcion,
        rendimiento_unidades: dialogo.value.receta.rendimiento_unidades,
        notas: dialogo.value.receta.notas,
        ingredientes: dialogo.value.receta.ingredientes.map((i) => ({
          materia_prima_id: i.materia_prima_id,
          cantidad: i.cantidad,
        })),
      }
    : null,
)

onMounted(() => {
  cargarTodas()
  if (materiasPrimas.value.length === 0) cargarIngredientes()
})

async function manejarSubmit(input: RecetaInputCompleto) {
  if (dialogo.value.tipo === 'editar') {
    await actualizar(dialogo.value.receta.id, input)
  } else {
    await crear(input)
  }
  dialogo.value = { tipo: 'cerrado' }
}

async function confirmarEliminar() {
  if (dialogo.value.tipo !== 'eliminar') return
  await eliminar(dialogo.value.receta.id)
  dialogo.value = { tipo: 'cerrado' }
}

function abrirDetalle(id: string) {
  router.push({ name: 'receta-detalle', params: { id } })
}

function abrirCrear() {
  dialogo.value = { tipo: 'crear' }
}

function abrirEditar(id: string, event: Event) {
  event.stopPropagation()
  const rec = recetas.value.find((x) => x.id === id)
  if (rec) dialogo.value = { tipo: 'editar', receta: rec }
}

function abrirEliminar(id: string, event: Event) {
  event.stopPropagation()
  const rec = recetas.value.find((x) => x.id === id)
  if (rec) dialogo.value = { tipo: 'eliminar', receta: rec }
}

function cerrarDialogo() {
  dialogo.value = { tipo: 'cerrado' }
}
</script>

<template>
  <v-container>
    <div class="d-flex align-center justify-space-between mb-4">
      <h1>Recetas</h1>
      <v-btn
        v-if="recetas.length > 0 || !cargando"
        color="primary"
        prepend-icon="mdi-plus"
        data-testid="receta-nueva"
        @click="abrirCrear"
      >
        Nueva receta
      </v-btn>
    </div>

    <v-progress-linear v-if="cargando" indeterminate color="primary" data-testid="receta-loading" />

    <v-alert v-if="error" type="error" class="mb-4" data-testid="receta-error">
      {{ error }}
      <template #append>
        <v-btn variant="text" @click="cargarTodas()">Reintentar</v-btn>
      </template>
    </v-alert>

    <v-card v-if="!cargando && recetas.length === 0 && !error" class="pa-6 text-center" data-testid="receta-empty">
      <p class="text-h6 mb-4">No hay recetas todavía</p>
      <v-btn color="primary" @click="abrirCrear">Crear primera receta</v-btn>
    </v-card>

    <v-list v-if="recetas.length > 0" data-testid="receta-list">
      <v-list-item
        v-for="receta in recetas"
        :key="receta.id"
        :data-testid="`receta-row-${receta.id}`"
        @click="abrirDetalle(receta.id)"
      >
        <v-list-item-title>{{ receta.nombre }}</v-list-item-title>
        <v-list-item-subtitle>
          {{ receta.descripcion ?? 'Sin descripción' }} · Rendimiento: {{ receta.rendimiento_unidades }}
        </v-list-item-subtitle>
        <template #append>
          <v-btn
            icon="mdi-pencil"
            variant="text"
            size="small"
            :data-testid="`receta-edit-${receta.id}`"
            @click="abrirEditar(receta.id, $event)"
          />
          <v-btn
            icon="mdi-delete"
            variant="text"
            size="small"
            color="error"
            :data-testid="`receta-delete-${receta.id}`"
            @click="abrirEliminar(receta.id, $event)"
          />
        </template>
      </v-list-item>
    </v-list>

    <v-dialog
      :model-value="dialogo.tipo === 'crear' || dialogo.tipo === 'editar'"
      max-width="700"
      @update:model-value="(v) => { if (!v) cerrarDialogo() }"
    >
      <v-card>
        <v-card-title>{{ dialogo.tipo === 'editar' ? 'Editar receta' : 'Nueva receta' }}</v-card-title>
        <v-card-text>
          <RecetaForm
            :valores-iniciales="recetaEnEdicion"
            :materias-primas="materiasPrimas"
            @submit="manejarSubmit"
            @cancel="cerrarDialogo"
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog
      :model-value="dialogo.tipo === 'eliminar'"
      max-width="400"
      @update:model-value="(v) => { if (!v) cerrarDialogo() }"
    >
      <v-card v-if="dialogo.tipo === 'eliminar'">
        <v-card-title>¿Eliminar {{ dialogo.receta.nombre }}?</v-card-title>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="cerrarDialogo">Cancelar</v-btn>
          <v-btn color="error" @click="confirmarEliminar">Eliminar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

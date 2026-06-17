<script setup lang="ts">
// REQ-CATALOG-10, REQ-CATALOG-11, REQ-CATALOG-40, REQ-CATALOG-45:
// recipe form with N dynamic ingredient rows. Each row pairs a
// `SelectorMateriaPrima` autocomplete with a `cantidad` number input.
// Spanish inline validation runs before the `submit` emit so the
// parent view gets a typed payload ready for the joined insert.
import { computed, reactive, ref, watch } from 'vue'

import SelectorMateriaPrima from './SelectorMateriaPrima.vue'
import type { IngredienteRecetaInput, MateriaPrima, RecetaInput } from '@/types'
import type { RecetaInputCompleto } from '@/services/recipes.service'

interface LineaForm {
  materia_prima_id: string | null
  cantidad: number
}

const props = withDefaults(
  defineProps<{
    valoresIniciales?: RecetaInputCompleto | null
    materiasPrimas: MateriaPrima[]
  }>(),
  { valoresIniciales: null },
)

const emit = defineEmits<{
  submit: [input: RecetaInputCompleto]
  cancel: []
}>()

const nombre = ref<string>('')
const descripcion = ref<string | null>(null)
const rendimiento_unidades = ref<number>(1)
const notas = ref<string | null>(null)
const lineas = reactive<LineaForm[]>([{ materia_prima_id: null, cantidad: 0 }])
const errores = ref<{ nombre?: string; ingredientes?: string; cantidad?: string }>({})

watch(
  () => props.valoresIniciales,
  (v) => {
    if (!v) {
      nombre.value = ''
      descripcion.value = null
      rendimiento_unidades.value = 1
      notas.value = null
      lineas.splice(0, lineas.length, { materia_prima_id: null, cantidad: 0 })
      errores.value = {}
      return
    }
    nombre.value = v.nombre
    descripcion.value = v.descripcion
    rendimiento_unidades.value = v.rendimiento_unidades
    notas.value = v.notas
    lineas.splice(0, lineas.length, ...v.ingredientes.map<LineaForm>((i) => ({ ...i })))
    errores.value = {}
  },
  { immediate: true },
)

const formularioValido = computed(
  () =>
    nombre.value.trim().length > 0 &&
    lineas.length > 0 &&
    lineas.every((l) => l.materia_prima_id !== null && l.cantidad > 0),
)

function agregarLinea() {
  lineas.push({ materia_prima_id: null, cantidad: 0 })
}

function quitarLinea(indice: number) {
  if (lineas.length <= 1) return
  lineas.splice(indice, 1)
}

function validar(): boolean {
  const nuevos: typeof errores.value = {}
  if (nombre.value.trim().length === 0) nuevos.nombre = 'El nombre de la receta es obligatorio'
  if (lineas.length === 0) nuevos.ingredientes = 'Agregá al menos un ingrediente'
  if (lineas.some((l) => l.cantidad <= 0)) nuevos.cantidad = 'La cantidad debe ser mayor a 0'
  errores.value = nuevos
  return Object.keys(nuevos).length === 0
}

function onSubmit() {
  if (!validar()) return
  const base: RecetaInput = {
    nombre: nombre.value.trim(),
    descripcion: descripcion.value?.trim() ? descripcion.value.trim() : null,
    rendimiento_unidades: rendimiento_unidades.value,
    notas: notas.value?.trim() ? notas.value.trim() : null,
  }
  const ingredientes: IngredienteRecetaInput[] = lineas.map((l) => ({
    materia_prima_id: l.materia_prima_id as string,
    cantidad: l.cantidad,
  }))
  emit('submit', { ...base, ingredientes })
}

function onCancelar() {
  emit('cancel')
}
</script>

<template>
  <form class="receta-form" @submit.prevent="onSubmit">
    <v-text-field
      v-model="nombre"
      label="Nombre de la receta"
      :error-messages="errores.nombre ? [errores.nombre] : []"
      data-testid="receta-nombre"
    />
    <v-textarea v-model="descripcion" label="Descripción (opcional)" rows="2" data-testid="receta-descripcion" />
    <v-text-field
      v-model.number="rendimiento_unidades"
      label="Rendimiento (unidades producidas)"
      type="number"
      min="0.01"
      step="0.01"
      data-testid="receta-rendimiento"
    />
    <v-textarea v-model="notas" label="Notas (opcional)" rows="2" />

    <h3 class="mt-4 mb-2">Ingredientes</h3>
    <div
      v-for="(linea, indice) in lineas"
      :key="indice"
      class="d-flex ga-2 align-center mb-2"
      data-testid="receta-linea"
    >
      <SelectorMateriaPrima
        v-model="linea.materia_prima_id"
        :materias-primas="materiasPrimas"
        class="flex-grow-1"
      />
      <v-text-field
        v-model.number="linea.cantidad"
        label="Cantidad"
        type="number"
        min="0"
        step="0.01"
        density="compact"
        style="max-width: 140px"
        data-testid="receta-cantidad"
      />
      <v-btn
        v-if="lineas.length > 1"
        icon="mdi-close"
        size="small"
        variant="text"
        color="error"
        :data-testid="'receta-quitar'"
        @click="quitarLinea(indice)"
      />
    </div>
    <v-btn
      v-if="!errores.ingredientes"
      variant="text"
      prepend-icon="mdi-plus"
      data-testid="receta-agregar"
      @click="agregarLinea"
    >
      Agregar ingrediente
    </v-btn>
    <p v-if="errores.ingredientes" class="text-error text-caption" data-testid="receta-error-ingredientes">
      {{ errores.ingredientes }}
    </p>
    <p v-if="errores.cantidad" class="text-error text-caption" data-testid="receta-error-cantidad">
      {{ errores.cantidad }}
    </p>

    <div class="d-flex ga-2 mt-4">
      <v-btn type="submit" color="primary" :disabled="!formularioValido" data-testid="receta-guardar">
        Guardar
      </v-btn>
      <v-btn variant="text" type="button" @click="onCancelar" data-testid="receta-cancelar">Cancelar</v-btn>
    </div>
  </form>
</template>

<script setup lang="ts">
// REQ-CATALOG-2, REQ-CATALOG-3, REQ-CATALOG-40, REQ-CATALOG-45:
// pure form component (no DI, no store import). Spanish inline validation
// runs before `submit` fires so the parent view gets a typed payload.
import { computed, ref, watch } from 'vue'

import type { CategoriaMateriaPrima, MateriaPrimaInput, UnidadMedida } from '@/types'

const props = withDefaults(defineProps<{ valoresIniciales?: MateriaPrimaInput | null }>(), {
  valoresIniciales: null,
})

const emit = defineEmits<{
  submit: [input: MateriaPrimaInput]
  cancel: []
}>()

const UNIDADES: UnidadMedida[] = ['kg', 'g', 'l', 'ml', 'unidad']
const CATEGORIAS: { title: string; value: CategoriaMateriaPrima }[] = [
  { title: 'Ingrediente', value: 'ingrediente' },
  { title: 'Empaque', value: 'empaque' },
]

const nombre = ref<string>('')
const unidad = ref<UnidadMedida>('kg')
const categoria = ref<CategoriaMateriaPrima>('ingrediente')
const costo_por_unidad = ref<number>(0)
const notas = ref<string | null>(null)

const errores = ref<{ nombre?: string; costo?: string }>({})

watch(
  () => props.valoresIniciales,
  (v) => {
    if (!v) {
      nombre.value = ''
      unidad.value = 'kg'
      categoria.value = 'ingrediente'
      costo_por_unidad.value = 0
      notas.value = null
      errores.value = {}
      return
    }
    nombre.value = v.nombre
    unidad.value = v.unidad
    categoria.value = v.categoria
    costo_por_unidad.value = v.costo_por_unidad
    notas.value = v.notas
    errores.value = {}
  },
  { immediate: true },
)

const formularioValido = computed(
  () => Object.keys(errores.value).length === 0 && nombre.value.trim().length > 0,
)

function validar(): boolean {
  const nuevos: typeof errores.value = {}
  if (nombre.value.trim().length === 0) nuevos.nombre = 'El nombre es obligatorio'
  if (costo_por_unidad.value < 0) nuevos.costo = 'El costo por unidad debe ser mayor o igual a 0'
  errores.value = nuevos
  return Object.keys(nuevos).length === 0
}

function onSubmit() {
  if (!validar()) return
  emit('submit', {
    nombre: nombre.value.trim(),
    unidad: unidad.value,
    categoria: categoria.value,
    costo_por_unidad: costo_por_unidad.value,
    notas: notas.value?.trim() ? notas.value.trim() : null,
  })
}

function onCancelar() {
  emit('cancel')
}
</script>

<template>
  <form class="materia-prima-form" @submit.prevent="onSubmit">
    <v-text-field
      v-model="nombre"
      label="Nombre"
      :error-messages="errores.nombre ? [errores.nombre] : []"
      data-testid="mp-nombre"
    />
    <v-select
      v-model="unidad"
      :items="UNIDADES"
      label="Unidad"
      data-testid="mp-unidad"
    />
    <v-select
      v-model="categoria"
      :items="CATEGORIAS"
      label="Categoría"
      data-testid="mp-categoria"
    />
    <v-text-field
      v-model.number="costo_por_unidad"
      label="Costo por unidad"
      type="number"
      min="0"
      step="0.01"
      prefix="$"
      :error-messages="errores.costo ? [errores.costo] : []"
      data-testid="mp-costo"
    />
    <v-textarea v-model="notas" label="Notas (opcional)" rows="2" data-testid="mp-notas" />
    <div class="d-flex ga-2 mt-2">
      <v-btn type="submit" color="primary" :disabled="!formularioValido" data-testid="mp-guardar">
        Guardar
      </v-btn>
      <v-btn variant="text" type="button" @click="onCancelar" data-testid="mp-cancelar">Cancelar</v-btn>
    </div>
  </form>
</template>

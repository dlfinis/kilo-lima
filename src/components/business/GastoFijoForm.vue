<script setup lang="ts">
// REQ-EVENTS-10, REQ-EVENTS-11, REQ-EVENTS-12, REQ-EVENTS-13,
// REQ-EVENTS-26, REQ-EVENTS-36, REQ-EVENTS-43: pure form. Six
// categories with Spanish labels, monto must be > 0, descripcion
// optional. Lockup via `editable` prop matches EventoForm's pattern.
import { computed, ref, watch } from 'vue'

import type { CategoriaGasto, GastoFijoInput } from '@/types'

const props = withDefaults(
  defineProps<{
    valoresIniciales?: GastoFijoInput | null
    editable?: boolean
  }>(),
  { valoresIniciales: null, editable: true },
)

const emit = defineEmits<{
  submit: [input: GastoFijoInput]
  cancel: []
}>()

const CATEGORIAS: Array<{ valor: CategoriaGasto; etiqueta: string }> = [
  { valor: 'renta', etiqueta: 'Renta' },
  { valor: 'transporte', etiqueta: 'Transporte' },
  { valor: 'permisos', etiqueta: 'Permisos' },
  { valor: 'publicidad', etiqueta: 'Publicidad' },
  { valor: 'servicios', etiqueta: 'Servicios' },
  { valor: 'otro', etiqueta: 'Otro' },
]

const eventoId = ref<string>('')
const categoria = ref<CategoriaGasto>('renta')
const monto = ref<number>(0)
const descripcion = ref<string>('')

const errores = ref<{ monto?: string }>({})

watch(
  () => props.valoresIniciales,
  (v) => {
    if (!v) {
      eventoId.value = ''
      categoria.value = 'renta'
      monto.value = 0
      descripcion.value = ''
      errores.value = {}
      return
    }
    eventoId.value = v.evento_id
    categoria.value = v.categoria
    monto.value = v.monto
    descripcion.value = v.descripcion ?? ''
    errores.value = {}
  },
  { immediate: true },
)

const formularioValido = computed(
  () => Object.keys(errores.value).length === 0 && monto.value > 0,
)

function validar(): boolean {
  const nuevos: typeof errores.value = {}
  if (monto.value <= 0) nuevos.monto = 'El monto debe ser mayor a 0'
  errores.value = nuevos
  return Object.keys(nuevos).length === 0
}

function onSubmit() {
  if (!props.editable) return
  if (!validar()) return
  emit('submit', {
    evento_id: eventoId.value,
    categoria: categoria.value,
    monto: monto.value,
    descripcion: descripcion.value.trim() || null,
  })
}

function onCancelar() {
  emit('cancel')
}
</script>

<template>
  <form class="gasto-form" @submit.prevent="onSubmit">
    <v-alert v-if="!editable" type="warning" density="compact" class="mb-3">
      Evento cerrado — no editable
    </v-alert>
    <v-select
      v-model="categoria"
      :items="CATEGORIAS"
      item-title="etiqueta"
      item-value="valor"
      label="Categoría"
      :disabled="!editable"
      data-testid="gasto-categoria"
    />
    <v-text-field
      v-model.number="monto"
      label="Monto (USD)"
      type="number"
      min="0.01"
      step="0.01"
      :disabled="!editable"
      :error-messages="errores.monto ? [errores.monto] : []"
      data-testid="gasto-monto"
    />
    <v-text-field
      v-model="descripcion"
      label="Descripción (opcional)"
      :disabled="!editable"
      data-testid="gasto-descripcion"
    />
    <div class="d-flex ga-2 mt-2">
      <v-btn
        v-if="editable"
        type="submit"
        color="primary"
        :disabled="!formularioValido"
        data-testid="gasto-guardar"
      >
        Guardar
      </v-btn>
      <v-btn variant="text" type="button" @click="onCancelar" data-testid="gasto-cancelar">
        Cancelar
      </v-btn>
    </div>
  </form>
</template>

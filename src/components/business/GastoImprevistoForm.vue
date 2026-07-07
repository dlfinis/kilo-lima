<script setup lang="ts">
// REQ-POS-37, REQ-POS-50, REQ-POS-54, REQ-POS-55: pure form (no DI,
// no store import). Same shape as GastoFijoForm: monto > 0, motivo
// non-empty + ≤500 chars (REQ-POS-50), categoria optional with 5
// Spanish labels (REQ-POS-37). `editable=false` lockup matches the
// events pattern.
import { computed, ref, watch } from 'vue'

import type { CategoriaImprevisto, GastoImprevistoInput } from '@/types'

type SocioOption = { id: string; nombre: string }

const props = withDefaults(
  defineProps<{
    valoresIniciales?: GastoImprevistoInput | null
    editable?: boolean
    socios?: SocioOption[]
  }>(),
  { valoresIniciales: null, editable: true, socios: () => [] },
)

const emit = defineEmits<{
  submit: [input: GastoImprevistoInput]
  cancel: []
}>()

const CATEGORIAS: Array<{ valor: CategoriaImprevisto; etiqueta: string }> = [
  { valor: 'insumos_extra', etiqueta: 'Insumos extra' },
  { valor: 'transporte', etiqueta: 'Transporte' },
  { valor: 'reparacion', etiqueta: 'Reparación' },
  { valor: 'propina', etiqueta: 'Propina' },
  { valor: 'otro', etiqueta: 'Otro' },
]

const eventoId = ref<string>('')
const categoria = ref<CategoriaImprevisto>('insumos_extra')
const monto = ref<number>(0)
const motivo = ref<string>('')
const socioId = ref<string | null>(null)

const errores = ref<{ monto?: string; motivo?: string }>({})

watch(
  () => props.valoresIniciales,
  (v) => {
    if (!v) {
      eventoId.value = ''
      categoria.value = 'insumos_extra'
      monto.value = 0
      motivo.value = ''
      socioId.value = null
      errores.value = {}
      return
    }
    eventoId.value = v.evento_id
    categoria.value = v.categoria ?? 'insumos_extra'
    monto.value = v.monto
    motivo.value = v.motivo
    socioId.value = v.socio_id ?? null
    errores.value = {}
  },
  { immediate: true },
)

const formularioValido = computed(
  () => Object.keys(errores.value).length === 0 && monto.value > 0 && motivo.value.trim().length > 0,
)

function validar(): boolean {
  const nuevos: typeof errores.value = {}
  if (monto.value <= 0) nuevos.monto = 'El monto debe ser mayor a 0'
  if (motivo.value.trim().length === 0) nuevos.motivo = 'El motivo es obligatorio'
  else if (motivo.value.length > 500) nuevos.motivo = 'El motivo no puede superar 500 caracteres'
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
    motivo: motivo.value.trim(),
    socio_id: socioId.value || null,
  })
}

function onCancelar() {
  emit('cancel')
}
</script>

<template>
  <form class="imprevisto-form" @submit.prevent="onSubmit">
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
      data-testid="imprevisto-categoria"
    />
    <v-text-field
      v-model.number="monto"
      label="Monto (USD)"
      type="number"
      min="0.01"
      step="0.01"
      :disabled="!editable"
      :error-messages="errores.monto ? [errores.monto] : []"
      data-testid="imprevisto-monto"
    />
    <v-text-field
      v-model="motivo"
      label="Motivo"
      :disabled="!editable"
      :error-messages="errores.motivo ? [errores.motivo] : []"
      data-testid="imprevisto-motivo"
    />
    <v-select
      v-model="socioId"
      :items="socios"
      item-title="nombre"
      item-value="id"
      label="Pagado por (opcional)"
      :disabled="!editable"
      clearable
      data-testid="imprevisto-socio"
    />
    <div class="d-flex ga-2 mt-2">
      <v-btn
        v-if="editable"
        type="submit"
        color="primary"
        :disabled="!formularioValido"
        data-testid="imprevisto-guardar"
      >
        Guardar
      </v-btn>
      <v-btn variant="text" type="button" @click="onCancelar" data-testid="imprevisto-cancelar">
        Cancelar
      </v-btn>
    </div>
  </form>
</template>
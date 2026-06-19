<script setup lang="ts">
// REQ-EVENTS-2, REQ-EVENTS-3, REQ-EVENTS-26, REQ-EVENTS-36,
// REQ-EVENTS-43: pure form. The parent view owns the freeze gate
// (`estadoEsEditable`) and passes `editable=false` when the evento is
// cerrado; the form is a passive lockup so the same component works
// for create and edit flows (REQ-EVENTS-43 ISP — receives only the
// `EventoInput` contract).
import { computed, ref, watch } from 'vue'

import type { EventoInput } from '@/types'

const props = withDefaults(
  defineProps<{
    valoresIniciales?: EventoInput | null
    editable?: boolean
  }>(),
  { valoresIniciales: null, editable: true },
)

const emit = defineEmits<{
  submit: [input: EventoInput]
  cancel: []
}>()

const nombre = ref<string>('')
const fecha = ref<string>('')
const fechaFin = ref<string>('')
const margenGanancia = ref<string>('40')
const ubicacion = ref<string>('')
const notas = ref<string>('')
const estado = ref<EventoInput['estado']>('planificacion')

const errores = ref<{ nombre?: string; fecha?: string }>({})

watch(
  () => props.valoresIniciales,
  (v) => {
    if (!v) {
      nombre.value = ''
      fecha.value = ''
      fechaFin.value = ''
      margenGanancia.value = '40'
      ubicacion.value = ''
      notas.value = ''
      estado.value = 'planificacion'
      errores.value = {}
      return
    }
    nombre.value = v.nombre
    fecha.value = v.fecha
    fechaFin.value = v.fecha_fin ?? ''
    margenGanancia.value =
      v.margen_ganancia !== null && v.margen_ganancia !== undefined
        ? String(Math.round(v.margen_ganancia * 100))
        : '40'
    ubicacion.value = v.ubicacion ?? ''
    notas.value = v.notas ?? ''
    estado.value = v.estado
    errores.value = {}
  },
  { immediate: true },
)

const formularioValido = computed(
  () =>
    Object.keys(errores.value).length === 0 &&
    nombre.value.trim().length > 0 &&
    fecha.value.length > 0,
)

function validar(): boolean {
  const nuevos: typeof errores.value = {}
  if (nombre.value.trim().length === 0) nuevos.nombre = 'El nombre es obligatorio'
  if (fecha.value.length === 0) nuevos.fecha = 'La fecha no es válida'
  errores.value = nuevos
  return Object.keys(nuevos).length === 0
}

function onSubmit() {
  if (!props.editable) return
  if (!validar()) return
  const margenDecimal = Number.parseFloat(margenGanancia.value) / 100
  emit('submit', {
    nombre: nombre.value.trim(),
    fecha: fecha.value,
    fecha_fin: fechaFin.value === '' ? null : fechaFin.value,
    margen_ganancia: Number.isFinite(margenDecimal) ? margenDecimal : null,
    ubicacion: ubicacion.value.trim() || null,
    notas: notas.value.trim() || null,
    estado: estado.value,
  })
}

function onCancelar() {
  emit('cancel')
}
</script>

<template>
  <form class="evento-form" @submit.prevent="onSubmit">
    <v-alert v-if="!editable" type="warning" density="compact" class="mb-3">
      Evento cerrado — no editable
    </v-alert>
    <v-text-field
      v-model="nombre"
      label="Nombre"
      :disabled="!editable"
      :error-messages="errores.nombre ? [errores.nombre] : []"
      data-testid="evento-nombre"
    />
    <v-text-field
      v-model="fecha"
      label="Fecha"
      type="date"
      :disabled="!editable"
      :error-messages="errores.fecha ? [errores.fecha] : []"
      data-testid="evento-fecha"
    />
    <v-text-field
      v-model="ubicacion"
      label="Ubicación"
      :disabled="!editable"
      data-testid="evento-ubicacion"
    />
    <v-textarea
      v-model="notas"
      label="Notas (opcional)"
      rows="2"
      :disabled="!editable"
      data-testid="evento-notas"
    />
    <div class="d-flex ga-2 mt-2">
      <v-btn
        v-if="editable"
        type="submit"
        color="primary"
        :disabled="!formularioValido"
        data-testid="evento-guardar"
      >
        Guardar
      </v-btn>
      <v-btn variant="text" type="button" @click="onCancelar" data-testid="evento-cancelar">
        Cancelar
      </v-btn>
    </div>
  </form>
</template>

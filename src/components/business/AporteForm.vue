<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import type { AporteInput, Socio } from '@/types'
import { useSociosStore } from '@/stores/socios.store'

const props = defineProps<{
  eventoId: string
}>()

const emit = defineEmits<{
  submit: [input: AporteInput]
  cancel: []
}>()

const sociosStore = useSociosStore()

const socioId = ref<string | null>(null)
const monto = ref<number>(0)
const fecha = ref<string>(new Date().toISOString().slice(0, 10))
const descripcion = ref<string>('')

const errores = ref<Record<string, string>>({})

const socios = computed<Socio[]>(() => sociosStore.socios)

const formularioValido = computed(
  () =>
    Object.keys(errores.value).length === 0 &&
    monto.value > 0 &&
    socioId.value !== null &&
    socioId.value !== '',
)

function validar(): boolean {
  const nuevos: Record<string, string> = {}
  if (!socioId.value) nuevos.socio = 'El socio es obligatorio'
  if (monto.value <= 0) nuevos.monto = 'El monto debe ser mayor a 0'
  errores.value = nuevos
  return Object.keys(nuevos).length === 0
}

function onSubmit() {
  if (!validar()) return
  emit('submit', {
    evento_id: props.eventoId,
    socio_id: socioId.value!,
    monto: monto.value,
    fecha: fecha.value,
    descripcion: descripcion.value.trim() || null,
  })
}

function onCancelar() {
  emit('cancel')
}

onMounted(() => {
  if (sociosStore.socios.length === 0) void sociosStore.cargarTodos()
})
</script>

<template>
  <form class="aporte-form" @submit.prevent="onSubmit">
    <v-select
      v-model="socioId"
      :items="socios"
      item-title="nombre"
      item-value="id"
      label="Socio"
      :error-messages="errores.socio ? [errores.socio] : []"
      data-testid="aporte-socio"
    />
    <v-text-field
      v-model.number="monto"
      label="Monto (USD)"
      type="number"
      min="0.01"
      step="0.01"
      :error-messages="errores.monto ? [errores.monto] : []"
      data-testid="aporte-monto"
    />
    <v-text-field
      v-model="fecha"
      label="Fecha"
      type="date"
      data-testid="aporte-fecha"
    />
    <v-text-field
      v-model="descripcion"
      label="Descripción (opcional)"
      data-testid="aporte-descripcion"
    />
    <div class="d-flex ga-2 mt-2">
      <v-btn
        type="submit"
        color="primary"
        :disabled="!formularioValido"
        data-testid="aporte-guardar"
      >
        Guardar
      </v-btn>
      <v-btn variant="text" type="button" @click="onCancelar" data-testid="aporte-cancelar">
        Cancelar
      </v-btn>
    </div>
  </form>
</template>

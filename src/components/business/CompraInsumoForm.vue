<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import type { CompraInsumoInput, MateriaPrima, Socio } from '@/types'
import { useSociosStore } from '@/stores/socios.store'
import { useIngredients } from '@/composables/useIngredients'

const props = defineProps<{
  eventoId: string | null
}>()

const emit = defineEmits<{
  submit: [input: CompraInsumoInput]
  cancel: []
}>()

const sociosStore = useSociosStore()
const { materiasPrimas } = useIngredients()

const socioId = ref<string | null>(null)
const materiaPrimaId = ref<string | null>(null)
const cantidad = ref<number>(0)
const costoTotal = ref<number>(0)
const fecha = ref<string>(new Date().toISOString().slice(0, 10))
const descripcion = ref<string>('')

const errores = ref<Record<string, string>>({})

const socios = computed<Socio[]>(() => sociosStore.socios)
const materias = computed<MateriaPrima[]>(() => materiasPrimas.value)

const formularioValido = computed(
  () =>
    Object.keys(errores.value).length === 0 &&
    cantidad.value > 0 &&
    costoTotal.value > 0 &&
    socioId.value !== null &&
    socioId.value !== '' &&
    materiaPrimaId.value !== null &&
    materiaPrimaId.value !== '',
)

function validar(): boolean {
  const nuevos: Record<string, string> = {}
  if (!socioId.value) nuevos.socio = 'El socio es obligatorio'
  if (!materiaPrimaId.value) nuevos.materiaPrima = 'La materia prima es obligatoria'
  if (cantidad.value <= 0) nuevos.cantidad = 'La cantidad debe ser mayor a 0'
  if (costoTotal.value <= 0) nuevos.costoTotal = 'El costo total debe ser mayor a 0'
  errores.value = nuevos
  return Object.keys(nuevos).length === 0
}

function onSubmit() {
  if (!validar()) return
  emit('submit', {
    evento_id: props.eventoId,
    socio_id: socioId.value!,
    materia_prima_id: materiaPrimaId.value!,
    cantidad: cantidad.value,
    costo_total: costoTotal.value,
    fecha: fecha.value,
    descripcion: descripcion.value.trim() || null,
  })
}

function onCancelar() {
  emit('cancel')
}

onMounted(() => {
  if (sociosStore.socios.length === 0) void sociosStore.cargarTodos()
  if (materiasPrimas.value.length === 0) {
    const store = useIngredients()
    void store.cargarTodas()
  }
})
</script>

<template>
  <form class="compra-insumo-form" @submit.prevent="onSubmit">
    <v-select
      v-model="socioId"
      :items="socios"
      item-title="nombre"
      item-value="id"
      label="Socio"
      :error-messages="errores.socio ? [errores.socio] : []"
      data-testid="compra-socio"
    />
    <v-select
      v-model="materiaPrimaId"
      :items="materias"
      item-title="nombre"
      item-value="id"
      label="Materia prima"
      :error-messages="errores.materiaPrima ? [errores.materiaPrima] : []"
      data-testid="compra-materia-prima"
    />
    <v-text-field
      v-model.number="cantidad"
      label="Cantidad"
      type="number"
      min="0.01"
      step="0.01"
      :error-messages="errores.cantidad ? [errores.cantidad] : []"
      data-testid="compra-cantidad"
    />
    <v-text-field
      v-model.number="costoTotal"
      label="Costo total (USD)"
      type="number"
      min="0.01"
      step="0.01"
      :error-messages="errores.costoTotal ? [errores.costoTotal] : []"
      data-testid="compra-costo-total"
    />
    <v-text-field
      v-model="fecha"
      label="Fecha"
      type="date"
      data-testid="compra-fecha"
    />
    <v-text-field
      v-model="descripcion"
      label="Descripción (opcional)"
      data-testid="compra-descripcion"
    />
    <div class="d-flex ga-2 mt-2">
      <v-btn
        type="submit"
        color="primary"
        :disabled="!formularioValido"
        data-testid="compra-guardar"
      >
        Guardar
      </v-btn>
      <v-btn variant="text" type="button" @click="onCancelar" data-testid="compra-cancelar">
        Cancelar
      </v-btn>
    </div>
  </form>
</template>

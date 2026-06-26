<script setup lang="ts">
// REQ-POS-1, REQ-POS-4, REQ-POS-46, REQ-POS-50, REQ-POS-54: producto
// form for create + edit. Controlled component — parent owns the
// receta list and decides whether to lock the receta selector via
// `recetaIdInicial` (used by the cross-slice "Vender esta receta"
// flow where the receta is already known). Validations:
//   - precio_venta > 0
//   - receta_id selected
//   - orden integer >= 0
// Spanish inline errors mirror `RecetaForm` patterns (REQ-POS-48).
import { computed, ref, watch } from 'vue'

import type { Producto, ProductoInput } from '@/types'

interface OpcionReceta {
  id: string
  nombre: string
}

const props = withDefaults(
  defineProps<{
    valoresIniciales?: Producto | null
    recetas: OpcionReceta[]
    recetaIdInicial?: string
  }>(),
  { valoresIniciales: null, recetaIdInicial: '' },
)

const MAX_DESCRIPCION = 500

const emit = defineEmits<{
  submit: [input: ProductoInput]
  cancel: []
}>()

const recetaId = ref<string>('')
const precioVenta = ref<number>(0)
const disponible = ref<boolean>(true)
const orden = ref<number>(0)
// productos-mejoras / producto-descripcion: optional free-text field.
// Nullable in the DB (≤ 500 chars); empty string → null on submit so
// the form mirrors the DB state without keeping an empty string around.
const descripcion = ref<string>('')
const errores = ref<{ precio?: string; receta?: string; descripcion?: string }>({})

watch(
  () => [props.valoresIniciales, props.recetaIdInicial] as const,
  ([v, inicial]) => {
    if (v) {
      recetaId.value = v.receta_id
      precioVenta.value = v.precio_venta
      disponible.value = v.disponible
      orden.value = v.orden
      descripcion.value = v.descripcion ?? ''
    } else {
      recetaId.value = inicial ?? ''
      precioVenta.value = 0
      disponible.value = true
      orden.value = 0
      descripcion.value = ''
    }
    errores.value = {}
  },
  { immediate: true },
)

const formularioValido = computed(
  () =>
    recetaId.value !== '' &&
    precioVenta.value > 0 &&
    Number.isFinite(orden.value) &&
    orden.value >= 0 &&
    descripcion.value.length <= MAX_DESCRIPCION,
)

function validar(): boolean {
  const nuevos: typeof errores.value = {}
  if (!recetaId.value) nuevos.receta = 'Seleccioná una receta'
  if (!(precioVenta.value > 0)) nuevos.precio = 'El precio de venta debe ser mayor a 0'
  if (descripcion.value.length > MAX_DESCRIPCION) {
    nuevos.descripcion = `Máximo ${MAX_DESCRIPCION} caracteres`
  }
  errores.value = nuevos
  return Object.keys(nuevos).length === 0
}

function onSubmit() {
  if (!validar()) return
  const payload: ProductoInput = {
    receta_id: recetaId.value,
    precio_venta: precioVenta.value,
    disponible: disponible.value,
    orden: orden.value,
    // Coerce empty string to null so the DB row matches the schema
    // contract (nullable, no defaults).
    descripcion: descripcion.value.trim() === '' ? null : descripcion.value,
  }
  emit('submit', payload)
}

function onCancelar() {
  emit('cancel')
}
</script>

<template>
  <form class="producto-form" @submit.prevent="onSubmit">
    <v-select
      v-model="recetaId"
      :items="recetas"
      item-title="nombre"
      item-value="id"
      label="Receta"
      :error-messages="errores.receta ? [errores.receta] : []"
      data-testid="producto-receta"
    />
    <v-text-field
      v-model.number="precioVenta"
      label="Precio de venta"
      type="number"
      min="0.01"
      step="0.01"
      :error-messages="errores.precio ? [errores.precio] : []"
      data-testid="producto-precio"
    />
    <v-textarea
      v-model="descripcion"
      label="Descripción (opcional)"
      rows="2"
      :counter="MAX_DESCRIPCION"
      :maxlength="MAX_DESCRIPCION"
      :error-messages="errores.descripcion ? [errores.descripcion] : []"
      data-testid="producto-descripcion"
    />
    <v-text-field
      v-model.number="orden"
      label="Orden"
      type="number"
      min="0"
      step="1"
      data-testid="producto-orden"
    />
    <v-switch
      v-model="disponible"
      label="Disponible para la venta"
      color="primary"
      data-testid="producto-disponible"
    />

    <div class="d-flex ga-2 mt-4">
      <v-btn type="submit" color="primary" :disabled="!formularioValido" data-testid="producto-guardar">
        Guardar
      </v-btn>
      <v-btn variant="text" type="button" data-testid="producto-cancelar" @click="onCancelar">
        Cancelar
      </v-btn>
    </div>
  </form>
</template>
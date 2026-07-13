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
//
// catalog-domain-refactor / Slice 1: `nombre` (required commercial
// name) and `categoria` (optional filter tag) are now part of the
// product payload. precio_venta is nullable — event pricing is the
// sell-price authority, but the column stays for backward compat.
import { computed, ref, watch } from 'vue'

import SelectorColor from './SelectorColor.vue'
import SelectorIcono from './SelectorIcono.vue'
import type { CategoriaProducto, Producto, ProductoInput } from '@/types'

interface OpcionReceta {
  id: string
  nombre: string
}

// catalog-domain-refactor: closed category set. Defined in pos.types.ts
// as CategoriaProducto; this local list drives the v-select.
const CATEGORIAS: { value: CategoriaProducto; label: string }[] = [
  { value: 'dulce', label: 'Dulce' },
  { value: 'salado', label: 'Salado' },
  { value: 'helado', label: 'Helado' },
  { value: 'bebida', label: 'Bebida' },
]

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
// catalog-domain-refactor: commercial name independent from preparation.
// Required + unique (enforced at DB). Mirrored in ProductoInput contract.
const nombre = ref<string>('')
// catalog-domain-refactor: closed-set filter tag. Nullable — clear the
// select to leave the product uncategorized.
const categoria = ref<CategoriaProducto | ''>('')
// catalog-domain-refactor / Slice 2: product price is no longer
// managed in the product screen. Event pricing
// (evento_productos.precio_venta) is the sole sell-price authority.
const disponible = ref<boolean>(true)
const orden = ref<number>(0)
// productos-mejoras / producto-descripcion: optional free-text field.
// Nullable in the DB (≤ 500 chars); empty string → null on submit so
// the form mirrors the DB state without keeping an empty string around.
const descripcion = ref<string>('')
// productos-icono: MDI icon name. Defaults to 'mdi-food' when creating.
const icono = ref<string>('mdi-food')
// productos-color: card color. Defaults to 'primary'.
const color = ref<string>('primary')
const errores = ref<{ receta?: string; descripcion?: string; nombre?: string }>({})

watch(
  () => [props.valoresIniciales, props.recetaIdInicial] as const,
  ([v, inicial]) => {
    if (v) {
      recetaId.value = v.receta_id
      nombre.value = v.nombre
      categoria.value = v.categoria ?? ''
      disponible.value = v.disponible
      orden.value = v.orden
      descripcion.value = v.descripcion ?? ''
      icono.value = v.icono ?? 'mdi-food'
      color.value = v.color ?? 'primary'
    } else {
      recetaId.value = inicial ?? ''
      nombre.value = ''
      categoria.value = ''
      disponible.value = true
      orden.value = 0
      descripcion.value = ''
      icono.value = 'mdi-food'
      color.value = 'primary'
    }
    errores.value = {}
  },
  { immediate: true },
)

// catalog-domain-refactor / Slice 2: prefill `nombre` from the selected
// receta name when creating a new product. The operator MAY override
// the default before saving. Does NOT fire when valoresIniciales is set
// (edit mode).
watch(recetaId, (nuevoId) => {
  if (nombre.value.trim() === '' && nuevoId) {
    const receta = props.recetas.find((r) => r.id === nuevoId)
    if (receta) nombre.value = receta.nombre
  }
})

const formularioValido = computed(
  () =>
    recetaId.value !== '' &&
    nombre.value.trim() !== '' &&
    Number.isFinite(orden.value) &&
    orden.value >= 0 &&
    descripcion.value.length <= MAX_DESCRIPCION,
)

function validar(): boolean {
  const nuevos: typeof errores.value = {}
  if (!recetaId.value) nuevos.receta = 'Selecciona una receta'
  // catalog-domain-refactor: nombre is required and unique (DB-enforced).
  // Empty or whitespace-only names are rejected client-side.
  if (nombre.value.trim() === '') nuevos.nombre = 'El nombre comercial es requerido'
  if (descripcion.value.length > MAX_DESCRIPCION) {
    nuevos.descripcion = `Maximo ${MAX_DESCRIPCION} caracteres`
  }
  errores.value = nuevos
  return Object.keys(nuevos).length === 0
}

function onSubmit() {
  if (!validar()) return
  const payload: ProductoInput = {
    receta_id: recetaId.value,
    // catalog-domain-refactor: required commercial name, unique at DB.
    nombre: nombre.value.trim(),
    // catalog-domain-refactor: closed-set category; '' → null.
    categoria: categoria.value === '' ? null : categoria.value,
    // catalog-domain-refactor / Slice 2: product price is no longer
    // managed here. Event pricing (evento_productos.precio_venta)
    // is the sole sell-price authority. precio_venta stays null
    // on create and is left unchanged on update.
    disponible: disponible.value,
    orden: orden.value,
    // Coerce empty string to null so the DB row matches the schema
    // contract (nullable, no defaults).
    descripcion: descripcion.value.trim() === '' ? null : descripcion.value,
    icono: icono.value,
    color: color.value,
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
    <!-- catalog-domain-refactor / Slice 1: editable commercial name.
         Later slices will prefill this from the selected receta name. -->
    <v-text-field
      v-model="nombre"
      label="Nombre comercial"
      :error-messages="errores.nombre ? [errores.nombre] : []"
      data-testid="producto-nombre"
    />
    <!-- catalog-domain-refactor: closed-set category (select, clearable).
         Leaving it empty stores null — product is uncategorized. -->
    <v-select
      v-model="categoria"
      :items="CATEGORIAS"
      item-title="label"
      item-value="value"
      label="Categoría (opcional)"
      clearable
      data-testid="producto-categoria"
    />
    <div class="d-flex ga-4 mb-2">
      <div class="flex-grow-1">
        <SelectorIcono v-model="icono" data-testid="producto-icono" />
      </div>
      <div>
        <SelectorColor v-model="color" data-testid="producto-color" />
      </div>
    </div>
    <v-textarea
      v-model="descripcion"
      label="Descripcion (opcional)"
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

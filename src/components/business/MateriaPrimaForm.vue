<script setup lang="ts">
// REQ-CATALOG-2, REQ-CATALOG-3, REQ-CATALOG-40, REQ-CATALOG-45:
// pure form component (no DI, no store import). Spanish inline validation
// runs before `submit` fires so the parent view gets a typed payload.
//
// REQ-UX-MONEY-1: the cost field uses type="text" + inputmode="decimal"
// instead of type="number" so trailing zeros are preserved during edit
// (e.g. "1.200" stays "1.200") and the decimal separator is always a dot.
import { computed, ref, watch } from 'vue'

import { formatearUSDInput, parsearUSDInput } from '@/utils/format'
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

// REQ-UX-MONEY-1: separate string ref for the input display so the
// user sees consistent trailing zeros (e.g. "1.20" not "1.2").
// No watcher back to costo_por_unidad — that was a write-back cycle
// that destroyed in-progress values like "1.200" or ".".
const costoTexto = ref<string>('0.00')

// REQ-UX-MONEY-2: track whether the user has interacted with the cost
// field.  Used by onCostoBlur to skip reformatting on untouched fields
// (avoiding mutation of the displayed over-precision value).  onSubmit
// does NOT use this flag — it always emits costo_por_unidad, which is
// only updated on valid parses and therefore always holds the last
// accepted numeric value.
const costoTocado = ref(false)

const errores = ref<{ nombre?: string; costo?: string }>({})

// Parse typed input back to the numeric model.  Vuetify's
// v-text-field emits the string value directly (not a DOM Event).
// Invalid/partial text does NOT update costo_por_unidad; on blur,
// the field either normalizes to formatted form or resets to the
// last valid value.
function onCostoInput(valor: string): void {
  costoTexto.value = valor
  costoTocado.value = true
  // Actually delete the costo key — setting it to undefined is NOT
  // enough because formularioValido uses Object.keys(errores).length.
  // Without this, errores.costo stays sticky after an invalid submit
  // and formularioValido stays false even with a valid cost typed.
  if (errores.value.costo) {
    const { costo: _costo, ...rest } = errores.value
    errores.value = rest
  }
  const parsed = parsearUSDInput(valor)
  if (!Number.isNaN(parsed)) {
    costo_por_unidad.value = parsed
  }
}

// On blur, normalize the displayed text. If the input is empty or
// invalid, reset to the last-valid numeric value. If valid, reformat
// to the policy's preferred representation (e.g. "1.2" → "1.20").
//
// REQ-UX-MONEY-2: when the cost field was never touched, blur is a
// no-op — do NOT mutate costo_por_unidad from the rendered text,
// which would silently truncate an over-precision original value.
function onCostoBlur(): void {
  if (!costoTocado.value) return

  const parsed = parsearUSDInput(costoTexto.value)
  if (!Number.isNaN(parsed) && costoTexto.value.trim() !== '') {
    costo_por_unidad.value = parsed
    costoTexto.value = formatearUSDInput(parsed)
  } else {
    costoTexto.value = formatearUSDInput(costo_por_unidad.value)
  }
}

// Clear the name error reactively when the user types a non-empty
// name.  Must actually delete the key — setting it to undefined is NOT
// enough because formularioValido uses Object.keys(errores).length.
// Without this, errores.nombre remains sticky after an invalid submit
// and formularioValido stays false even with a valid name typed.
watch(nombre, (newVal: string) => {
  if (newVal.trim().length > 0 && errores.value.nombre) {
    const { nombre: _nombre, ...rest } = errores.value
    errores.value = rest
  }
})

watch(
  () => props.valoresIniciales,
  (v) => {
    if (!v) {
      nombre.value = ''
      unidad.value = 'kg'
      categoria.value = 'ingrediente'
      costo_por_unidad.value = 0
      costoTexto.value = '0.00'
      notas.value = null
      errores.value = {}
      costoTocado.value = false
      return
    }
    nombre.value = v.nombre
    unidad.value = v.unidad
    categoria.value = v.categoria ?? 'ingrediente'
    costo_por_unidad.value = v.costo_por_unidad
    costoTexto.value = formatearUSDInput(v.costo_por_unidad)
    notas.value = v.notas
    errores.value = {}
    costoTocado.value = false
  },
  { immediate: true },
)

const formularioValido = computed(
  () => Object.keys(errores.value).length === 0 && nombre.value.trim().length > 0,
)

// Validate against the live costoTexto so partial/invalid text is caught.
function validar(): boolean {
  const nuevos: typeof errores.value = {}
  if (nombre.value.trim().length === 0) nuevos.nombre = 'El nombre es obligatorio'
  const costo = parsearUSDInput(costoTexto.value)
  if (Number.isNaN(costo) || costo < 0) {
    nuevos.costo = 'El costo por unidad debe ser un número mayor o igual a 0'
  }
  errores.value = nuevos
  return Object.keys(nuevos).length === 0
}

function onSubmit() {
  if (!validar()) return
  // REQ-UX-MONEY-2: costo_por_unidad acts as the "last accepted numeric
  // value." It is only updated on valid parses in onCostoInput; when the
  // user types garbage and blurs, costo_por_unidad is untouched — so
  // submit will preserve the original exact numeric value.  If the user
  // made a valid edit, costo_por_unidad already holds that edit, making
  // the costoTocado binary unnecessary for the submit decision.
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
    <!-- REQ-UX-MONEY-1: text input with inputmode="decimal" preserves
         trailing zeros (e.g. "1.200" stays "1.200") and enforces dot
         decimal consistently across edit and display. -->
    <v-text-field
      :model-value="costoTexto"
      label="Costo por unidad"
      type="text"
      inputmode="decimal"
      prefix="$"
      :error-messages="errores.costo ? [errores.costo] : []"
      data-testid="mp-costo"
      @update:model-value="onCostoInput"
      @blur="onCostoBlur"
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

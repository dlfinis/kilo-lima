<script setup lang="ts">
// REQ-EVENTS-15, REQ-EVENTS-16, REQ-EVENTS-17, REQ-EVENTS-19,
// REQ-EVENTS-36: grid container for the production plan. Owns the
// local list of `PlanProduccionInput` rows, runs the duplicate-
// receta client-side check (REQ-EVENTS-17) and disables all
// controls when `editable` is false (REQ-EVENTS-16).
//
// Save strategy matches design §3: the grid holds a `v-model:filas`
// array and emits `save(filas)` so the parent view (PlanificarEvento
// View) decides when to call `guardarPlan` on the store.
import { computed, ref, watch } from 'vue'

import PlanProduccionRow from './PlanProduccionRow.vue'
import type {
  EventoProductoConDetalle,
  PlanProduccionInput,
  Producto,
  RecetaConIngredientes,
} from '@/types'
import { useProductosStore } from '@/stores/productos.store'
import { useRecipesStore } from '@/stores/recipes.store'

// UI-only enriched option (design: plan-fila-layout). The selector
// still needs `nombre` for the autocomplete title, while the row
// needs both the commercial product name and the preparation name
// for identity zones. No schema change — the persisted identifier
// remains receta_id (REQ-EVENTS-15).
export type RecetaPlanOption = RecetaConIngredientes & {
  recetaNombre: string
  productoId: string | null
  productoNombre: string | null
}

const props = withDefaults(
  defineProps<{
    eventoId: string
    filasIniciales: PlanProduccionInput[]
    editable?: boolean
    pricingData?: EventoProductoConDetalle[]
  }>(),
  { editable: true, pricingData: undefined },
)

const emit = defineEmits<{
  save: [filas: PlanProduccionInput[]]
}>()

// Lazy store access — same pattern as SelectorReceta so the component
// can be unit-tested with a `recetas` prop and skip Pinia init.
const recetas = computed<RecetaConIngredientes[]>(() => useRecipesStore().recetas)

// Stage B: surface the commercial product name when a producto exists
// for a receta; otherwise fall back to receta.nombre. No schema change
// — the persisted identifier remains receta_id (REQ-EVENTS-15).
const productos = computed<Producto[]>(() => useProductosStore().productos)

const recetasParaPlan = computed<RecetaPlanOption[]>(() => {
  const byRecetaId = new Map(productos.value.map((p) => [p.receta_id, p]))
  return recetas.value.map((r) => {
    const producto = byRecetaId.get(r.id)
    return {
      ...r,
      // SelectorReceta displays `nombre` — keep the product name when
      // a linked product exists so the autocomplete shows the
      // commercial identity.
      nombre: producto?.nombre ?? r.nombre,
      recetaNombre: r.nombre,
      productoId: producto?.id ?? null,
      productoNombre: producto?.nombre ?? null,
    }
  })
})

const filas = ref<PlanProduccionInput[]>([])
const errorDuplicado = ref<string | null>(null)

watch(
  () => props.filasIniciales,
  (iniciales) => {
    filas.value = iniciales.map((f) => ({ ...f }))
    errorDuplicado.value = null
  },
  { immediate: true },
)

const todasConReceta = computed(() => filas.value.every((f) => f.receta_id))

function agregarFila() {
  filas.value = [
    ...filas.value,
    { evento_id: props.eventoId, receta_id: '', unidades_a_producir: 1 },
  ]
}

function quitarFila(recetaId: string) {
  filas.value = filas.value.filter((f) => f.receta_id !== recetaId)
  validarDuplicados()
}

function actualizarFila(indice: number, fila: PlanProduccionInput) {
  const copia = [...filas.value]
  copia[indice] = fila
  filas.value = copia
  validarDuplicados()
}

function validarDuplicados(): boolean {
  const ids = filas.value.map((f) => f.receta_id).filter((id) => id !== '')
  const set = new Set(ids)
  if (set.size !== ids.length) {
    errorDuplicado.value = 'Esta receta ya está en el plan'
    return false
  }
  errorDuplicado.value = null
  return true
}

function guardar() {
  if (!props.editable) return
  if (!validarDuplicados()) return
  if (!todasConReceta.value) return
  emit('save', filas.value)
}

// Live per-row cost: relies on the catalog store's reactive computed
// so a `costoPorUnidad` change recomputes without watchers. Returns
// 0 when the receta is unknown so the UI never shows NaN.
function calcularCostoLinea(fila: PlanProduccionInput): number {
  if (!fila.receta_id) return 0
  const calculo = useRecipesStore().costoPorReceta(fila.receta_id).value
  const unidades = Number(fila.unidades_a_producir) || 0
  return calculo.costoPorUnidad * unidades
}

// Unit cost for the row's cost zone supporting context (design:
// plan-fila-layout). Same store path as calcularCostoLinea but
// without the units multiplier.
function calcularCostoUnitario(recetaId: string): number {
  if (!recetaId) return 0
  return useRecipesStore().costoPorReceta(recetaId).value.costoPorUnidad
}
</script>

<template>
  <div class="plan-grid" data-testid="plan-grid">
    <p
      v-if="filas.length === 0"
      class="text-medium-emphasis text-center py-4"
      data-testid="plan-empty"
    >
      Sin filas en el plan — agregá una receta para empezar
    </p>

    <PlanProduccionRow
      v-for="(fila, indice) in filas"
      :key="`${fila.receta_id}-${indice}`"
      :fila="fila"
      :recetas="recetasParaPlan"
      :costo-linea="calcularCostoLinea(fila)"
      :costo-unitario="calcularCostoUnitario(fila.receta_id)"
      :editable="editable"
      :pricing-data="pricingData"
      @update="(f) => actualizarFila(indice, f)"
      @eliminar="quitarFila"
    />

    <p
      v-if="errorDuplicado"
      class="text-error text-caption mt-2"
      data-testid="plan-error-duplicado"
    >
      {{ errorDuplicado }}
    </p>

    <div class="d-flex ga-2 mt-2">
      <v-btn
        v-if="editable"
        variant="text"
        prepend-icon="mdi-plus"
        data-testid="plan-agregar-fila"
        @click="agregarFila"
      >
        Agregar fila
      </v-btn>
      <v-btn
        v-if="editable"
        color="primary"
        :disabled="filas.length === 0 || !todasConReceta || !!errorDuplicado"
        data-testid="plan-guardar"
        @click="guardar"
      >
        Guardar plan
      </v-btn>
    </div>
  </div>
</template>
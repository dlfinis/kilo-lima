<script setup lang="ts">
// inventory-tabs-redesign / Work Unit 2: stock movement modal.
// Supports two movement types — entrada (stock inflow) and ajuste
// (correction/merma). The modal emits a submit event with the composed
// input that the parent view routes to the appropriate RPC.
import { computed, ref, watch } from 'vue'

import type { RegistrarAjusteInput, RegistrarCompraInput } from '@/types'

const props = defineProps<{
  modelValue: boolean
  materiaPrimaId: string
  materiaPrimaNombre: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [
    payload:
      | { rpc: 'registrarCompra'; input: RegistrarCompraInput }
      | { rpc: 'registrarAjuste'; input: RegistrarAjusteInput },
  ]
}>()

// ----- form state -----
const tipoMovimiento = ref<'entrada' | 'ajuste'>('entrada')
const cantidad = ref<number | null>(null)
const responsable = ref<string>('')
const razon = ref<'compra' | 'conteo' | 'merma_dano' | 'correccion' | 'otro'>('compra')
const razonOtro = ref<string>('')

// ----- derived -----
const razonLabel = computed<string>(() => {
  const map: Record<string, string> = {
    compra: 'Compra',
    conteo: 'Conteo físico',
    merma_dano: 'Merma / Daño',
    correccion: 'Corrección',
    otro: 'Otro',
  }
  return map[razon.value] ?? razon.value
})

const razonesDisponibles = computed<{ value: string; label: string }[]>(() => {
  if (tipoMovimiento.value === 'entrada') {
    return [
      { value: 'compra', label: 'Compra' },
      { value: 'conteo', label: 'Conteo físico' },
      { value: 'otro', label: 'Otro' },
    ]
  }
  return [
    { value: 'merma_dano', label: 'Merma / Daño' },
    { value: 'correccion', label: 'Corrección' },
    { value: 'otro', label: 'Otro' },
  ]
})

const errores = ref<Record<string, string>>({})

// ----- reset on open -----
watch(
  () => props.modelValue,
  (abierto) => {
    if (abierto) {
      tipoMovimiento.value = 'entrada'
      cantidad.value = null
      responsable.value = ''
      razon.value = 'compra'
      razonOtro.value = ''
      errores.value = {}
    }
  },
)

// ----- validation -----
function validar(): boolean {
  const e: Record<string, string> = {}
  if (cantidad.value === null || cantidad.value <= 0) {
    e.cantidad = 'La cantidad debe ser mayor que cero'
  }
  if (!responsable.value.trim()) {
    e.responsable = 'La persona responsable es obligatoria'
  }
  if (razon.value === 'otro' && !razonOtro.value.trim()) {
    e.razonOtro = 'Describe el motivo del movimiento'
  }
  errores.value = e
  return Object.keys(e).length === 0
}

// ----- submit -----
function manejarSubmit() {
  if (!validar()) return

  const motivoFinal =
    razon.value === 'otro'
      ? `Otro: ${razonOtro.value.trim()} — Responsable: ${responsable.value.trim()}`
      : `${razonLabel.value} — Responsable: ${responsable.value.trim()}`

    if (razon.value === 'compra') {
      // Purchase-style addition: route through registrar_compra so the
      // movement gets tipo='compra' and appears in the Compras tab.
      const input: RegistrarCompraInput = {
        materia_prima_id: props.materiaPrimaId,
        cantidad: cantidad.value!,
        costo_unitario: 0,
        evento_id: null,
        compra_insumo_id: null,
        motivo: motivoFinal,
        fecha: new Date().toISOString().slice(0, 10),
      }
    emit('submit', { rpc: 'registrarCompra', input })
  } else {
    // All other reasons route through registrar_ajuste (tipo='ajuste').
    // cantidad is positive for entrada, negative for merma/corrección.
    const cantidadAjuste =
      tipoMovimiento.value === 'entrada' ? cantidad.value! : -(cantidad.value!)
    const input: RegistrarAjusteInput = {
      materia_prima_id: props.materiaPrimaId,
      cantidad: cantidadAjuste,
      motivo: motivoFinal,
      fecha: new Date().toISOString().slice(0, 10),
    }
    emit('submit', { rpc: 'registrarAjuste', input })
  }
}

function cerrar() {
  emit('update:modelValue', false)
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="520"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card data-testid="stock-movement-modal">
      <v-card-title class="d-flex align-center">
        <span>Movimiento de stock</span>
        <v-chip size="small" class="ml-2" variant="tonal">
          {{ materiaPrimaNombre }}
        </v-chip>
      </v-card-title>

      <v-card-text>
        <!-- Movement type selector -->
        <v-btn-toggle
          v-model="tipoMovimiento"
          mandatory
          divided
          class="mb-4"
          data-testid="movement-type-toggle"
        >
          <v-btn
            value="entrada"
            size="small"
            color="success"
            variant="tonal"
            data-testid="movement-type-entrada"
          >
            <v-icon size="18" class="mr-1">mdi-arrow-down-bold</v-icon>
            Entrada
          </v-btn>
          <v-btn
            value="ajuste"
            size="small"
            color="info"
            variant="tonal"
            data-testid="movement-type-ajuste"
          >
            <v-icon size="18" class="mr-1">mdi-swap-horizontal</v-icon>
            Ajuste
          </v-btn>
        </v-btn-toggle>

        <!-- Quantity -->
        <v-text-field
          v-model.number="cantidad"
          label="Cantidad"
          type="number"
          :min="0.01"
          :step="0.01"
          :error-messages="errores.cantidad ? [errores.cantidad] : []"
          variant="outlined"
          density="comfortable"
          class="mb-3"
          data-testid="movement-cantidad"
          hide-spin-buttons
        />

        <!-- Responsible person -->
        <v-text-field
          v-model="responsable"
          label="Persona responsable"
          placeholder="¿Quién hizo la compra o el ajuste?"
          :error-messages="errores.responsable ? [errores.responsable] : []"
          variant="outlined"
          density="comfortable"
          class="mb-3"
          data-testid="movement-responsable"
        />

        <!-- Reason -->
        <v-select
          v-model="razon"
          :items="razonesDisponibles"
          item-title="label"
          item-value="value"
          label="Motivo"
          variant="outlined"
          density="comfortable"
          class="mb-3"
          data-testid="movement-razon"
        />

        <!-- Free-text reason (when "otro") -->
        <v-text-field
          v-if="razon === 'otro'"
          v-model="razonOtro"
          label="Describe el motivo"
          :error-messages="errores.razonOtro ? [errores.razonOtro] : []"
          variant="outlined"
          density="comfortable"
          class="mb-3"
          data-testid="movement-razon-otro"
        />
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" data-testid="movement-cancel" @click="cerrar">
          Cancelar
        </v-btn>
        <v-btn
          color="primary"
          variant="tonal"
          data-testid="movement-submit"
          @click="manejarSubmit"
        >
          Registrar movimiento
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

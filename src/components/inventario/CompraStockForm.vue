<script setup lang="ts">
// inventory-tabs-redesign / Work Unit 3: global purchase form.
// Presentational (DIP) — validates input fields without store access
// and emits a RegistrarCompraInput on submit. Used by ComprasTab.
import { computed, ref, watch } from 'vue'

import type { MateriaPrima, RegistrarCompraInput } from '@/types'

const props = defineProps<{
  modelValue: boolean
  materiasPrimas: MateriaPrima[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [input: RegistrarCompraInput]
  cancel: []
}>()

// ----- form state -----
const materiaPrimaId = ref<string | null>(null)
const cantidad = ref<number | null>(null)
const costoUnitario = ref<number | null>(null)
const fechaManual = ref<string>('')

// ----- derived -----
const errores = ref<Record<string, string>>({})

const materiaOptions = computed(() =>
  props.materiasPrimas.map((mp) => ({
    title: `${mp.nombre} (${mp.unidad})`,
    value: mp.id,
  })),
)

const materiaSeleccionada = computed<MateriaPrima | undefined>(() =>
  props.materiasPrimas.find((mp) => mp.id === materiaPrimaId.value),
)

const fechaHoy = computed<string>(() => new Date().toISOString().slice(0, 10))

// ----- reset on open -----
watch(
  () => props.modelValue,
  (abierto) => {
    if (abierto) {
      materiaPrimaId.value = null
      cantidad.value = null
      costoUnitario.value = null
      fechaManual.value = ''
      errores.value = {}
    }
  },
)

// ----- validation -----
function validar(): boolean {
  const e: Record<string, string> = {}
  if (!materiaPrimaId.value) {
    e.materiaPrima = 'Seleccioná una materia prima'
  }
  if (cantidad.value === null || cantidad.value <= 0) {
    e.cantidad = 'La cantidad debe ser mayor que cero'
  }
  if (costoUnitario.value === null || costoUnitario.value < 0) {
    e.costoUnitario = 'El costo unitario no puede ser negativo'
  }
  errores.value = e
  return Object.keys(e).length === 0
}

// ----- submit -----
function manejarSubmit() {
  if (!validar()) return

  const input: RegistrarCompraInput = {
    materia_prima_id: materiaPrimaId.value!,
    cantidad: cantidad.value!,
    costo_unitario: costoUnitario.value!,
    evento_id: null,
    compra_insumo_id: null,
    fecha: fechaManual.value || undefined,
  }
  emit('submit', input)
}

function cerrar() {
  emit('cancel')
  emit('update:modelValue', false)
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="520"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card data-testid="compra-stock-form">
      <v-card-title>Registrar compra</v-card-title>

      <v-card-text>
        <!-- Materia prima selector -->
        <v-autocomplete
          v-model="materiaPrimaId"
          :items="materiaOptions"
          label="Materia prima"
          variant="outlined"
          density="comfortable"
          class="mb-3"
          :error-messages="errores.materiaPrima ? [errores.materiaPrima] : []"
          data-testid="compra-materia-prima"
          no-data-text="No hay materias primas disponibles"
        />

        <!-- Cantidad -->
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
          data-testid="compra-cantidad"
          hide-spin-buttons
        >
          <template v-if="materiaSeleccionada" #append-inner>
            <span class="text-caption text-medium-emphasis">{{ materiaSeleccionada.unidad }}</span>
          </template>
        </v-text-field>

        <!-- Costo unitario -->
        <v-text-field
          v-model.number="costoUnitario"
          label="Costo unitario"
          type="number"
          :min="0"
          :step="0.01"
          prefix="$"
          :error-messages="errores.costoUnitario ? [errores.costoUnitario] : []"
          variant="outlined"
          density="comfortable"
          class="mb-3"
          data-testid="compra-costo"
          hide-spin-buttons
        />

        <!-- Fecha (optional, defaults to today) -->
        <v-text-field
          v-model="fechaManual"
          label="Fecha"
          type="date"
          :placeholder="fechaHoy"
          variant="outlined"
          density="comfortable"
          class="mb-3"
          data-testid="compra-fecha"
          :hint="!fechaManual ? `Por defecto: ${fechaHoy}` : undefined"
          persistent-hint
        />
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" data-testid="compra-cancel" @click="cerrar">
          Cancelar
        </v-btn>
        <v-btn
          color="primary"
          variant="tonal"
          data-testid="compra-submit"
          @click="manejarSubmit"
        >
          Registrar compra
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

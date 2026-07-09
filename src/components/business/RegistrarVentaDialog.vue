<script setup lang="ts">
// REQ-POS-12, REQ-POS-48, REQ-POS-54: confirmation dialog that shows
// the total, the active evento, and lets the user pick a metodo_pago.
// The parent (PosView) wires the actual `registrarVenta` call so the
// optimistic UI / revert-on-failure lives in the store, not here.
//
// pos-redesign (REQ-POS-CAMBIO-1..3, REQ-POS-57): when metodo_pago is
// `efectivo`, the dialog renders a monto_recibido input, a live cambio
// preview, and an EXACTO button. The `confirmar` emit now carries the
// optional montoRecibido so the store can validate (MONTO_INSUFICIENTE
// when monto < total). For non-efectivo methods, the cash-back fields
// are hidden and the emit omits montoRecibido.
import { computed, ref, watch } from 'vue'

import { formatearUSD } from '@/utils/format'
import { METODOS_PAGO, type Evento, type MetodoPago } from '@/types'

const props = defineProps<{
  modelValue: boolean
  total: number
  evento: Evento | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  // pos-redesign (REQ-POS-CAMBIO-3): widened contract — emits an
  // object with the metodoPago and the optional montoRecibido.
  // Caller (PosView) destructures and forwards to the store.
  confirmar: [payload: { metodoPago: MetodoPago; montoRecibido?: number | null }]
}>()

const metodoPago = ref<MetodoPago>('efectivo')
// Single source of truth — `METODOS_PAGO` lives in pos.types.ts so the
// history dialog and the edit dialog stay in lockstep with the
// `MetodoPago` union. Adding a new method only requires updating
// pos.types.ts.
const opciones = METODOS_PAGO

// Billetes rápidos para velocidad en feria. Tapping uno de estos
// suma ese monto al monto_recibido (acumulativo — el operador puede
// combinar billetes: $20 + $5 = $25).
const billetesRapidos = [1, 5, 10, 20, 50]
function agregarBillete(monto: number): void {
  montoRecibido.value = (montoRecibido.value ?? 0) + monto
}

// pos-redesign: cash-back input (REQ-POS-CAMBIO-1). Null when the
// dialog first opens — the operator must opt in by typing a value
// OR by tapping EXACTO. Reactive via v-model on the text field.
const montoRecibido = ref<number | null>(null)

// pos-redesign (REQ-POS-CAMBIO-2): live cambio = montoRecibido −
// total. Rounded to 2 decimals via the same rounding policy the store
// uses (calcularCambio semantics). Null when montoRecibido is null
// (no preview yet — shows nothing instead of "Cambio: 0").
const cambio = computed<number | null>(() => {
  if (montoRecibido.value === null || montoRecibido.value === undefined) return null
  return Math.round((montoRecibido.value - props.total + Number.EPSILON) * 100) / 100
})

// pos-redesign (REQ-POS-CAMBIO-3): EXACTO button handler — sets the
// input to the exact total so cambio = 0. Exposed via `defineExpose`
// so the test suite can call it directly (the template uses a
// `@click` binding; the handler does not need to be in the template
// scope if we expose it).
function exacto(): void {
  montoRecibido.value = props.total
}
// pos-redesign (T14 testability): tests need to switch metodoPago
// without going through the v-select (which is in the Teleport target
// and can't be reached via wrapper.find). `establecerMetodoPago` is a
// pure setter that mutates the same ref the v-select binds to.
function establecerMetodoPago(metodo: MetodoPago): void {
  metodoPago.value = metodo
}
defineExpose({ exacto, montoRecibido, cambio, alConfirmar, establecerMetodoPago })

watch(
  () => props.modelValue,
  (abierto) => {
    if (abierto) {
      metodoPago.value = 'efectivo'
      // Reset the cash-back input on each open so the operator
      // doesn't carry the previous sale's value into a new dialog.
      montoRecibido.value = null
    }
  },
)

const totalTexto = computed(() => formatearUSD(props.total))

const cambioTexto = computed<string>(() => {
  if (cambio.value === null) return ''
  return formatearUSD(cambio.value)
})

function alConfirmar(): void {
  emit('confirmar', {
    metodoPago: metodoPago.value,
    // Only forward montoRecibido when metodo_pago === 'efectivo'. For
    // other methods the store ignores it anyway, but we keep the
    // payload narrow to make the contract obvious.
    montoRecibido: metodoPago.value === 'efectivo' ? montoRecibido.value : undefined,
  })
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="420"
    data-testid="registrar-venta-dialogo"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <v-card>
      <v-card-title>Registrar venta</v-card-title>
      <v-card-text>
        <div class="mb-2">
          <span class="text-medium-emphasis">Evento:</span>
          <span class="ml-1">{{ evento?.nombre ?? 'Sin evento' }}</span>
        </div>
        <div class="mb-4">
          <span class="text-medium-emphasis">Total:</span>
          <span class="ml-1 text-h6">{{ totalTexto }}</span>
        </div>
        <v-select
          v-model="metodoPago"
          :items="opciones"
          item-title="label"
          item-value="value"
          label="Método de pago"
          data-testid="registrar-venta-metodo"
        />

        <!-- pos-redesign (REQ-POS-CAMBIO-1): monto_recibido input
             shown only when metodo_pago === 'efectivo'. Other
             methods have no cash-back math. -->
        <template v-if="metodoPago === 'efectivo'">
          <v-text-field
            v-model.number="montoRecibido"
            type="number"
            label="Monto recibido"
            prepend-inner-icon="mdi-cash"
            data-testid="registrar-venta-monto"
            class="mt-2"
            min="0"
            step="0.01"
          />
          <!-- Billetes rápidos para velocidad en feria -->
          <div class="d-flex flex-wrap ga-2 mb-2">
            <v-btn
              v-for="billete in billetesRapidos"
              :key="billete"
              size="small"
              variant="outlined"
              :data-testid="`registrar-venta-billete-${billete}`"
              @click="agregarBillete(billete)"
            >
              +{{ billete }}
            </v-btn>
          </div>
          <div class="d-flex align-center ga-2 mb-2">
            <v-btn
              size="small"
              variant="tonal"
              data-testid="registrar-venta-exacto"
              @click="exacto"
            >
              Exacto
            </v-btn>
            <span v-if="cambioTexto" class="text-medium-emphasis">
              Cambio: <strong>{{ cambioTexto }}</strong>
            </span>
          </div>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          data-testid="registrar-venta-cancelar"
          @click="emit('update:modelValue', false)"
        >
          Cancelar
        </v-btn>
        <v-btn
          color="primary"
          data-testid="registrar-venta-confirmar"
          @click="alConfirmar"
        >
          Registrar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

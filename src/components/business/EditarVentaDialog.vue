<script setup lang="ts">
// REQ-POS-CORRECCION-1..3: sale-correction dialog.
//
// Pure presentational — receives the original venta and emits a
// typed payload on submit. The parent (PosView) owns the store
// call (useVentas.corregirVenta). The dialog enforces:
//
//   - motivo is required (REQ-POS-CORRECCION-3). Submit button is
//     disabled until motivo has non-whitespace text.
//   - the items array starts as a clone of the original venta's
//     items so the operator sees the existing sale and can adjust
//     quantities / remove lines. The total recomputes live as
//     quantities change so the operator sees the financial delta
//     before committing.
//
// The dialog does NOT persist anything itself. Audit trail (the
// venta_correcciones row) is the store/service's responsibility.
import { computed, ref, watch } from 'vue'

import { formatearUSD } from '@/utils/format'
import { METODOS_PAGO, type MetodoPago, type VentaConItems, type VentaItemInput } from '@/types'

interface ProductoDisponible {
  id: string
  nombre: string
  precio_venta: number
}

const props = defineProps<{
  modelValue: boolean
  venta: VentaConItems | null
  productosDisponibles: ProductoDisponible[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  corregir: [
    payload: {
      ventaId: string
      nuevoTotal: number
      nuevoMetodoPago: MetodoPago
      nuevoMontoRecibido: number | null
      nuevosItems: VentaItemInput[]
      motivo: string
    },
  ]
}>()

// Centralized payment-method list (REQ-POS-CORRECCION-2 follow-up):
// previously the edit dialog hard-coded 3 options, drifting from
// `MetodoPago`'s `mixto` member and from the history dialog's
// `METODOS_ETIQUETA` map. Now sourced from the same constant the
// registrar dialog and history dialog use.
const METODOS = METODOS_PAGO

// Mutable local state — initialized from props.venta every time the
// dialog opens so a previous edit doesn't leak into a new sale.
const items = ref<VentaItemInput[]>([])
const metodoPago = ref<MetodoPago>('efectivo')
const montoRecibido = ref<number | null>(null)
const motivo = ref<string>('')

// Single source of truth for the open-dialog reset. Called both by
// the `props.venta` watcher (when the parent swaps to a different
// sale) AND by the `props.modelValue` watcher (when the same sale
// is reopened after a cancel). Without the modelValue hook the
// cancel→reopen path leaks motivo/items/payment edits because the
// venta reference does not change between sessions.
function sincronizarDesdeVenta(venta: VentaConItems | null): void {
  if (!venta) {
    items.value = []
    metodoPago.value = 'efectivo'
    montoRecibido.value = null
    motivo.value = ''
    return
  }
  items.value = venta.items.map((it) => ({
    producto_id: it.producto_id,
    cantidad: it.cantidad,
    precio_unitario: it.precio_unitario,
    subtotal: it.subtotal,
    costo_unitario: it.costo_unitario,
    margen_aplicado: it.margen_aplicado,
    evento_producto_id: it.evento_producto_id,
  }))
  metodoPago.value = venta.metodo_pago
  montoRecibido.value = venta.monto_recibido
  motivo.value = ''
}

watch(() => props.venta, sincronizarDesdeVenta, { immediate: true })
// Cancel→reopen of the SAME sale does NOT change `props.venta`,
// so the watcher above never re-runs. Reset on the false→true
// transition of `modelValue` so the operator always starts a
// fresh edit on reopen (no leaked motivo from a cancelled session).
watch(
  () => props.modelValue,
  (abierto) => {
    if (abierto) sincronizarDesdeVenta(props.venta)
  },
)

const totalNuevo = computed<number>(() =>
  Math.round(
    items.value.reduce((acc, it) => acc + it.cantidad * it.precio_unitario, 0) *
      100 +
      Number.EPSILON,
  ) / 100,
)

const totalAnterior = computed<number>(() => props.venta?.total ?? 0)
const deltaTotal = computed<number>(() =>
  Math.round((totalNuevo.value - totalAnterior.value + Number.EPSILON) * 100) / 100,
)

const motivoValido = computed<boolean>(() => motivo.value.trim().length > 0)
const puedeAplicar = computed<boolean>(
  () => motivoValido.value && items.value.length > 0,
)

function formatearMoneda(n: number): string {
  return formatearUSD(n)
}

function nombreProducto(productoId: string): string {
  return (
    props.productosDisponibles.find((p) => p.id === productoId)?.nombre ??
    productoId.slice(0, 8)
  )
}

function cantidadCambiada(idx: number, nuevaCantidad: number): void {
  if (nuevaCantidad < 1) return
  items.value[idx]!.cantidad = nuevaCantidad
  items.value[idx]!.subtotal = Math.round(
    nuevaCantidad * items.value[idx]!.precio_unitario * 100 + Number.EPSILON,
  ) / 100
}

function eliminarLinea(idx: number): void {
  items.value = items.value.filter((_, i) => i !== idx)
}

function aplicar(): void {
  if (!props.venta) return
  if (!puedeAplicar.value) return
  emit('corregir', {
    ventaId: props.venta.id,
    nuevoTotal: totalNuevo.value,
    nuevoMetodoPago: metodoPago.value,
    nuevoMontoRecibido: metodoPago.value === 'efectivo' ? montoRecibido.value : null,
    nuevosItems: items.value.map((it) => ({ ...it })),
    motivo: motivo.value.trim(),
  })
}

function cancelar(): void {
  emit('update:modelValue', false)
}

defineExpose({ aplicar, motivo, items })
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="640"
    data-testid="editar-venta-dialogo"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <span>Corregir venta</span>
        <v-chip
          size="small"
          color="primary"
          variant="tonal"
          data-testid="editar-venta-comprobante"
        >
          {{ venta?.comprobante_numero ?? '—' }}
        </v-chip>
      </v-card-title>
      <v-card-text>
        <!-- Before/After totals so the operator sees the financial
             delta before committing the edit. -->
        <div class="d-flex justify-space-between mb-4">
          <div>
            <div class="text-caption text-medium-emphasis">Total anterior</div>
            <div class="text-h6">{{ formatearMoneda(totalAnterior) }}</div>
          </div>
          <div class="text-right">
            <div class="text-caption text-medium-emphasis">Total nuevo</div>
            <div
              class="text-h6"
              :class="deltaTotal === 0 ? '' : deltaTotal > 0 ? 'text-success' : 'text-error'"
              data-testid="editar-venta-total-nuevo"
            >
              {{ formatearMoneda(totalNuevo) }}
            </div>
            <div
              v-if="deltaTotal !== 0"
              class="text-caption"
              data-testid="editar-venta-delta"
            >
              Δ {{ formatearMoneda(deltaTotal) }}
            </div>
          </div>
        </div>

        <!-- Items editor. Each row shows qty controls + subtotal. The
             product name is denormalized via productosDisponibles so
             we don't need a second lookup. -->
        <p class="text-subtitle-2 mb-2">Items</p>
        <v-table v-if="items.length > 0" density="compact" data-testid="editar-venta-items">
          <tbody>
            <tr v-for="(item, idx) in items" :key="`${item.producto_id}-${idx}`">
              <td>{{ nombreProducto(item.producto_id) }}</td>
              <td class="text-right" style="width: 7rem">
                <input
                  type="number"
                  min="1"
                  :value="item.cantidad"
                  :data-testid="`editar-venta-cantidad-${item.producto_id}`"
                  style="width: 5rem; text-align: right"
                  @input="(e) => cantidadCambiada(idx, Number((e.target as HTMLInputElement).value))"
                />
              </td>
              <td class="text-right">
                {{ formatearMoneda(item.cantidad * item.precio_unitario) }}
              </td>
              <td class="text-right" style="width: 4rem">
                <v-btn
                  icon="mdi-close"
                  size="x-small"
                  variant="text"
                  color="error"
                  :data-testid="`editar-venta-eliminar-${item.producto_id}`"
                  @click="eliminarLinea(idx)"
                />
              </td>
            </tr>
          </tbody>
        </v-table>
        <p
          v-else
          class="text-medium-emphasis"
          data-testid="editar-venta-sin-items"
        >
          La venta no tendrá items — no se puede guardar.
        </p>

        <v-select
          v-model="metodoPago"
          :items="METODOS"
          item-title="label"
          item-value="value"
          label="Método de pago"
          class="mt-4"
          data-testid="editar-venta-metodo"
        />

        <v-text-field
          v-if="metodoPago === 'efectivo'"
          v-model.number="montoRecibido"
          type="number"
          label="Monto recibido"
          prepend-inner-icon="mdi-cash"
          min="0"
          step="0.01"
          class="mt-2"
          data-testid="editar-venta-monto"
        />

        <v-textarea
          v-model="motivo"
          label="Motivo de la corrección"
          placeholder="Ej: cliente pidió factura / cambio de método / error en cantidad"
          required
          rows="2"
          class="mt-4"
          data-testid="editar-venta-motivo"
        />
        <p
          v-if="!motivoValido"
          class="text-caption text-error"
          data-testid="editar-venta-motivo-error"
        >
          El motivo es obligatorio para registrar la corrección.
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          data-testid="editar-venta-cancelar"
          @click="cancelar"
        >
          Cancelar
        </v-btn>
        <v-btn
          color="primary"
          :disabled="!puedeAplicar"
          data-testid="editar-venta-aplicar"
          @click="aplicar"
        >
          Aplicar corrección
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
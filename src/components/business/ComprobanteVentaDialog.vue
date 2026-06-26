<script setup lang="ts">
// REQ-POS-COMPROBANTE-1..3: printable receipt dialog. Opens after a
// successful sale (PosView wires it on `registrarVenta` success).
// Sections: header (evento + fecha), items (subtotals), totals,
// metodo_pago badge, comprobante_numero, optional monto_recibido +
// cambio for efectivo sales.
//
// Print: clicking "Imprimir" calls `window.print()`. Scoped
// `@media print` styles (REQ-POS-COMPROBANTE-3, T15) hide everything
// except the `.comprobante-print` block and shrink the layout for
// thermal-paper widths (80mm).
//
// Pure presentation — no store / service access. The parent supplies
// the venta + evento props (snapshotted from the registrarVenta
// response).
import { computed } from 'vue'

import type { Evento, VentaConItems } from '@/types'

const props = defineProps<{
  modelValue: boolean
  venta: VentaConItems
  evento: Evento | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const METODOS_ETIQUETA: Record<VentaConItems['metodo_pago'], string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  mixto: 'Mixto',
}

const usd = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD' })

const totalTexto = computed(() => usd.format(props.venta.total))
const montoRecibidoTexto = computed(() =>
  props.venta.monto_recibido !== null ? usd.format(props.venta.monto_recibido) : null,
)
const cambioTexto = computed(() =>
  props.venta.cambio !== null ? usd.format(props.venta.cambio) : null,
)
const comprobanteTexto = computed(() => props.venta.comprobante_numero ?? '—')

const fechaTexto = computed(() => {
  // ISO string → dd/mm/yyyy HH:MM (no dayjs — one formatter).
  const iso = props.venta.fecha
  if (!iso) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso)
  if (!match) return iso
  const [, yyyy, mm, dd, hh, mi] = match
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`
})

function cerrar(): void {
  emit('update:modelValue', false)
}

function imprimir(): void {
  // REQ-POS-COMPROBANTE-3 / AD5: zero-dep browser print. The scoped
  // `@media print` CSS hides everything except `.comprobante-print`.
  if (typeof window !== 'undefined') window.print()
}

defineExpose({ cerrar, imprimir })
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="480"
    data-testid="comprobante-dialogo"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <v-card class="comprobante-print">
      <v-card-title class="d-flex align-center justify-space-between">
        <span>Comprobante</span>
        <v-chip
          size="small"
          color="primary"
          variant="tonal"
          data-testid="comprobante-numero"
        >
          {{ comprobanteTexto }}
        </v-chip>
      </v-card-title>
      <v-card-text>
        <!-- Header (REQ-POS-COMPROBANTE-2): evento + fecha -->
        <div class="mb-3 comprobante-header">
          <p class="text-h6 mb-1">{{ evento?.nombre ?? 'Sin evento' }}</p>
          <p class="text-caption text-medium-emphasis">
            {{ fechaTexto }}
          </p>
        </div>

        <!-- Items (REQ-POS-COMPROBANTE-2): the VentaConItems shape
             already carries subtotal + precio_unitario on each item.
             Product names aren't denormalized into venta_items so the
             receipt shows qty × unit price = subtotal per line. -->
        <v-table density="compact" class="comprobante-items" data-testid="comprobante-items">
          <tbody>
            <tr v-for="item in venta.items" :key="item.id">
              <td class="text-right" style="width: 40px">{{ item.cantidad }}</td>
              <td>
                <div>{{ usd.format(item.precio_unitario) }}</div>
                <div class="text-caption text-medium-emphasis">
                  c/u
                </div>
              </td>
              <td class="text-right font-weight-medium">
                {{ usd.format(item.subtotal) }}
              </td>
            </tr>
          </tbody>
        </v-table>

        <!-- Totals (REQ-POS-COMPROBANTE-2) -->
        <div class="mt-3 comprobante-totales">
          <div class="d-flex justify-space-between text-h6">
            <span>Total</span>
            <strong data-testid="comprobante-total">{{ totalTexto }}</strong>
          </div>
          <div
            v-if="montoRecibidoTexto"
            class="d-flex justify-space-between text-medium-emphasis"
          >
            <span>Monto recibido</span>
            <span>{{ montoRecibidoTexto }}</span>
          </div>
          <div
            v-if="cambioTexto"
            class="d-flex justify-space-between text-medium-emphasis"
          >
            <span>Cambio</span>
            <span data-testid="comprobante-cambio">{{ cambioTexto }}</span>
          </div>
        </div>

        <!-- metodo_pago badge (REQ-POS-COMPROBANTE-2) -->
        <div class="mt-3">
          <v-chip
            size="small"
            color="secondary"
            variant="tonal"
            data-testid="comprobante-metodo"
          >
            {{ METODOS_ETIQUETA[venta.metodo_pago] }}
          </v-chip>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          color="primary"
          data-testid="comprobante-cerrar"
          @click="cerrar"
        >
          Cerrar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* REQ-POS-COMPROBANTE-3 / T15: thermal-paper print layout.
   Width is targeted at 80mm rolls; on screen the dialog keeps its
   Vuetify card look. We strip navigation / chrome and let the
   receipt flow vertically. */
@media print {
  /* Hide all chrome except the print block. The v-dialog overlay
     sits outside .comprobante-print — we hide everything by
     default and reshow only the print surface. */
  :deep(.v-overlay__scrim),
  :deep(.v-overlay__content),
  :deep(.v-card-actions),
  :deep(.v-app-bar),
  :deep(.v-main__wrap) > *:not(.comprobante-print) {
    display: none !important;
  }
  .comprobante-print {
    /* Thermal-paper width: ~80mm = 302px @ 96dpi. Use 80mm for
       accurate printer sizing. */
    width: 80mm !important;
    max-width: 80mm !important;
    padding: 4mm !important;
    box-shadow: none !important;
    font-size: 11pt !important;
    color: #000 !important;
    background: #fff !important;
  }
  .comprobante-header p {
    margin: 0 !important;
  }
  .comprobante-items td {
    padding: 1mm 2mm !important;
    border-bottom: 1px dashed #999 !important;
  }
  .comprobante-totales {
    border-top: 1px solid #000 !important;
    padding-top: 2mm !important;
    margin-top: 2mm !important;
  }
  /* Page margins: 0 so the receipt fills the printable area. */
  @page {
    size: 80mm auto;
    margin: 0;
  }
}
</style>

<script setup lang="ts">
// POS sales-history dialog. Surfaces the active evento's sales as a
// per-row list (timestamp, comprobante_numero, metodo_pago, total, items
// summary). Pure presentational — receives ventas + evento + editable
// flag. The parent (PosView) owns the source of truth.
//
// `editable` is true for open eventos (en_curso/planificacion) and
// false for cerrado. The dialog forwards per-row "Editar" events to
// the parent so the edit flow lives in a separate dialog (concern
// separation).
//
// Error/loading state (REQ-POS-HISTORIAL + review finding #5): the
// dialog also receives `cargando` and `error` from the store. When
// the previous `cargarPorEvento` failed the ventas array would be
// reset to `[]` and the dialog rendered the misleading "Aún no hay
// ventas" empty state. Now the dialog surfaces the error with a
// retry button instead — the operator can recover without seeing
// a confusing empty list.
//
// Pure functions live in this file (no store/service imports) — date
// formatting and money formatting are local computed properties so
// the component can be unit-tested without mocking Pinia.
import { computed } from 'vue'

import { METODOS_PAGO, type Evento, type MetodoPago, type VentaConItems } from '@/types'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    ventas: VentaConItems[]
    evento: Evento | null
    editable: boolean
    // Review finding #5: optional error / loading state. When the
    // parent passes these, the dialog surfaces load failures with a
    // retry button instead of pretending the list is empty.
    cargando?: boolean
    error?: string | null
  }>(),
  { cargando: false, error: null },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  editar: [venta: VentaConItems]
  reintentar: []
}>()

// Single source of truth for the metodo_pago label map (kept in
// lockstep with the `METODOS_PAGO` option list). When the parent
// adds a new method to `MetodoPago` it must also extend this map;
// the TypeScript exhaustiveness check on `MetodoPago` would catch
// a missing label, but the option list is a runtime concern.
const METODOS_ETIQUETA: Record<MetodoPago, string> = Object.fromEntries(
  METODOS_PAGO.map((m) => [m.value, m.label]),
) as Record<MetodoPago, string>

const usd = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD' })

// Sort the sales newest-first so the operator sees the latest
// transaction at the top of the list (read-only UX invariant — the
// store keeps insertion order but the display layer is responsible
// for sorting).
const ventasOrdenadas = computed<VentaConItems[]>(() => {
  return [...props.ventas].sort((a, b) => {
    const ta = Date.parse(a.fecha ?? a.created_at ?? '')
    const tb = Date.parse(b.fecha ?? b.created_at ?? '')
    return tb - ta
  })
})

// ISO 8601 string → dd/mm/yyyy HH:MM. Kept inline (no dayjs) so this
// dialog has zero deps beyond the existing types.
function formatearFechaHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso)
  if (!match) return iso
  const [, yyyy, mm, dd, hh, mi] = match
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`
}

// Render the items summary. Without denormalized product names the
// row shows qty × unit price for each item. Adequate for the
// "what was sold" glance — the receipt dialog gives the full
// printable detail.
function resumenItems(venta: VentaConItems): string {
  return venta.items
    .map((it) => `${it.cantidad} × ${usd.format(it.precio_unitario)}`)
    .join(' · ')
}

function formatearTotal(venta: VentaConItems): string {
  return usd.format(venta.total)
}

function comprobante(venta: VentaConItems): string {
  return venta.comprobante_numero ?? '—'
}

function metodo(venta: VentaConItems): string {
  return METODOS_ETIQUETA[venta.metodo_pago]
}

function alEditar(venta: VentaConItems): void {
  emit('editar', venta)
}

function cerrar(): void {
  emit('update:modelValue', false)
}

function alReintentar(): void {
  emit('reintentar')
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="640"
    data-testid="historial-dialogo"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <span>Historial de ventas</span>
        <v-chip
          size="small"
          color="primary"
          variant="tonal"
          data-testid="historial-evento"
        >
          {{ evento?.nombre ?? 'Sin evento' }}
        </v-chip>
      </v-card-title>
      <v-card-text>
        <!-- Review finding #5: surface load errors with a retry path.
             The banner is independent of the table/empty-state
             below — when an error fires AFTER a successful load
             we keep showing the last successful ventas AND the
             error banner so the operator can decide whether to
             retry. The store no longer clears ventas on error
             (see ventas.store.cargarPorEvento), so this combined
             surface is the natural rendering. -->
        <v-alert
          v-if="error"
          type="error"
          class="mb-3"
          data-testid="historial-error"
        >
          <p class="text-body-2 mb-2">
            {{ error }} — no se pudo actualizar el historial.
          </p>
          <v-btn
            color="error"
            variant="tonal"
            size="small"
            :loading="cargando"
            data-testid="historial-reintentar"
            @click="alReintentar"
          >
            Reintentar
          </v-btn>
        </v-alert>
        <p
          v-if="!error && ventasOrdenadas.length === 0"
          class="text-medium-emphasis"
          data-testid="historial-vacio"
        >
          Aún no hay ventas registradas para este evento.
        </p>
        <v-table
          v-if="ventasOrdenadas.length > 0"
          density="compact"
          data-testid="historial-tabla"
        >
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Comprobante</th>
              <th>Método</th>
              <th class="text-right">Total</th>
              <th>Items</th>
              <th v-if="editable" class="text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="venta in ventasOrdenadas"
              :key="venta.id"
              :data-testid="`historial-fila-${venta.id}`"
            >
              <td>{{ formatearFechaHora(venta.fecha ?? venta.created_at) }}</td>
              <td>{{ comprobante(venta) }}</td>
              <td>{{ metodo(venta) }}</td>
              <td class="text-right font-weight-medium">
                {{ formatearTotal(venta) }}
              </td>
              <td class="text-caption">
                {{ resumenItems(venta) }}
              </td>
              <td v-if="editable" class="text-right">
                <v-btn
                  size="x-small"
                  variant="text"
                  color="primary"
                  :data-testid="`historial-editar-${venta.id}`"
                  @click="alEditar(venta)"
                >
                  Editar
                </v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          data-testid="historial-cerrar"
          @click="cerrar"
        >
          Cerrar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
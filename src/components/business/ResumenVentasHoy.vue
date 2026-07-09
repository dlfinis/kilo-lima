<script setup lang="ts">
// REQ-POS-HOY-1..4: per-metodo_pago totals panel for the active
// evento. Mounts on PosView, refreshes reactively after a sale is
// registered (REQ-POS-HOY-3). Skeleton fallback during load keeps
// the grid non-blocking (REQ-POS-HOY-4).
//
// Pure presentational — receives ventas + cargando as props. The
// parent owns the fetch via `cargarPorEvento` (called in onMounted
// in parallel with productos per REQ-POS-HOY-1).
import { computed } from 'vue'

import { formatearUSD } from '@/utils/format'
import type { MetodoPago, VentaConItems } from '@/types'

const props = defineProps<{
  ventas: VentaConItems[]
  cargando: boolean
}>()

const METODOS_ETIQUETA: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  mixto: 'Mixto',
}

// Group ventas by metodo_pago → { count, total }. We don't sort by
// amount — operators want to see efectivo first, the rest follows
// the enum order. Iteration order: efectivo, transferencia, tarjeta,
// mixto.
interface MetodoResumen {
  metodo: MetodoPago
  cantidad: number
  total: number
}

const resumenPorMetodo = computed<MetodoResumen[]>(() => {
  const mapa = new Map<MetodoPago, MetodoResumen>()
  for (const v of props.ventas) {
    const actual = mapa.get(v.metodo_pago) ?? {
      metodo: v.metodo_pago,
      cantidad: 0,
      total: 0,
    }
    actual.cantidad += 1
    actual.total += v.total
    mapa.set(v.metodo_pago, actual)
  }
  // Preserve enum order so the chip row stays predictable.
  const orden: MetodoPago[] = ['efectivo', 'transferencia', 'tarjeta', 'mixto']
  return orden
    .map((m) => mapa.get(m))
    .filter((m): m is MetodoResumen => m !== undefined)
})
</script>

<template>
  <v-card class="pa-4 mb-4" data-testid="resumen-hoy">
    <h2 class="text-h6 mb-3">Ventas de hoy</h2>

    <!-- REQ-POS-HOY-4: skeleton during load. The grid renders
         independently — the panel is non-blocking. -->
    <div v-if="cargando" data-testid="resumen-hoy-cargando">
      <v-skeleton-loader type="list-item-three-line" />
    </div>

    <!-- REQ-POS-HOY-2: empty state when no sales yet today. -->
    <p
      v-else-if="resumenPorMetodo.length === 0"
      class="text-medium-emphasis"
      data-testid="resumen-hoy-empty"
    >
      Sin ventas todavía — registrá una venta para empezar
    </p>

    <!-- REQ-POS-HOY-2: per-metodo_pago chips with count + total. -->
    <div v-else class="d-flex flex-wrap ga-2">
      <v-chip
        v-for="r in resumenPorMetodo"
        :key="r.metodo"
        color="primary"
        variant="tonal"
        :data-testid="`resumen-hoy-chip-${r.metodo}`"
      >
        {{ METODOS_ETIQUETA[r.metodo] }}: {{ r.cantidad }} venta(s) ·
        {{ formatearUSD(r.total) }}
      </v-chip>
    </div>
  </v-card>
</template>

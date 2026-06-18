<script setup lang="ts">
// REQ-EVENTS-22, REQ-EVENTS-23, REQ-EVENTS-24, REQ-EVENTS-36: the
// full breakdown card per design §6. Receives the pre-computed
// `ProyeccionResultado` via prop (no service / store calls — pure
// presentation component) and renders:
//   - Costos fijos sum + per-gasto line breakdown
//   - Costos variables sum + per-receta line breakdown
//   - Costo total (bold)
//   - Yellow v-alert when any line has MATERIA_PRIMA_FALTANTE /
//     RECETA_FALTANTE advertencia
//   - Friendly empty state when there are no gastos and no plan
//
// Replaces the compact summary that PR2b's EventoDetalleView shipped
// (REQ-EVENTS-22 design §6).
import type { CategoriaGasto, ProyeccionResultado } from '@/types'

import { formatearUSD } from '@/utils/format'

defineProps<{ proyeccion: ProyeccionResultado | null }>()

const ETIQUETAS_CATEGORIA: Record<CategoriaGasto, string> = {
  renta: 'Renta',
  transporte: 'Transporte',
  permisos: 'Permisos',
  publicidad: 'Publicidad',
  servicios: 'Servicios',
  otro: 'Otro',
}

// Component-scoped helper so the template stays declarative. Wraps
// the categoria label lookup in one place — keeps the template lean.
function categoria(c: CategoriaGasto): string {
  return ETIQUETAS_CATEGORIA[c]
}
</script>

<template>
  <v-card
    v-if="
      proyeccion &&
      (proyeccion.costosFijos > 0 ||
        proyeccion.costosVariables > 0 ||
        proyeccion.lineas.some((l) => l.advertencia))
    "
    class="pa-4"
    data-testid="proyeccion-card"
  >
    <h2 class="mb-2">Proyección de costos</h2>

    <v-alert
      v-if="proyeccion.lineas.some((l) => l.advertencia)"
      type="warning"
      variant="tonal"
      class="mb-4"
      data-testid="proyeccion-alerta"
    >
      Hay {{ proyeccion.lineas.filter((l) => l.advertencia).length }} línea(s) con
      problemas — revisá la receta o el catálogo de materia prima
    </v-alert>

    <div class="mb-3">
      <h3 class="text-subtitle-1">Costos fijos</h3>
      <p class="text-h6" data-testid="proyeccion-fijos-total">{{ formatearUSD(proyeccion.costosFijos) }}</p>
      <ul
        v-if="proyeccion.desgloseFijos.length > 0"
        class="ml-4"
        data-testid="proyeccion-fijos-lista"
      >
        <li v-for="gasto in proyeccion.desgloseFijos" :key="gasto.gastoId">
          {{ categoria(gasto.categoria) }} — {{ formatearUSD(gasto.monto) }}
          <span v-if="gasto.descripcion" class="text-medium-emphasis">
            · {{ gasto.descripcion }}
          </span>
        </li>
      </ul>
    </div>

    <div class="mb-3">
      <h3 class="text-subtitle-1">Costos variables</h3>
      <p class="text-h6" data-testid="proyeccion-variables-total">
        {{ formatearUSD(proyeccion.costosVariables) }}
      </p>
      <ul
        v-if="proyeccion.desgloseVariables.length > 0"
        class="ml-4"
        data-testid="proyeccion-variables-lista"
      >
        <li v-for="linea in proyeccion.desgloseVariables" :key="linea.recetaId">
          {{ linea.recetaNombre }} — {{ formatearUSD(linea.costoLinea) }}
        </li>
      </ul>
    </div>

    <hr class="my-3" />

    <p class="text-h5" data-testid="proyeccion-total">
      Total: <strong>{{ formatearUSD(proyeccion.costoTotal) }}</strong>
    </p>
  </v-card>

  <v-card v-else class="pa-4 text-center text-medium-emphasis" data-testid="proyeccion-empty">
    Sin gastos ni plan — agregá datos para ver la proyección
  </v-card>
</template>
<script setup lang="ts">
// REQ-EVENTS-10, REQ-EVENTS-11: one row in the gastos fijos list.
// Shows categoria label, monto USD, descripcion. Emits `eliminar`
// so the parent view owns the confirmation dialog (REQ-EVENTS-39).
// `editable` hides the delete button when the parent evento is
// cerrado (REQ-EVENTS-27 — read-only mode surfaces here too).
import { computed } from 'vue'
import { formatearUSD } from '@/utils/format'
import type { CategoriaGasto, GastoFijo } from '@/types'
import { useSociosStore } from '@/stores/socios.store'

const props = withDefaults(
  defineProps<{ gasto: GastoFijo; editable?: boolean }>(),
  { editable: true },
)

const emit = defineEmits<{
  eliminar: [id: string]
}>()

const sNombre = computed<string | null>(() => {
  if (!props.gasto.socio_id) return null
  return useSociosStore().nombreSocio(props.gasto.socio_id) || null
})

const ETIQUETAS: Record<CategoriaGasto, string> = {
  renta: 'Renta',
  transporte: 'Transporte',
  permisos: 'Permisos',
  publicidad: 'Publicidad',
  servicios: 'Servicios',
  otro: 'Otro',
}
</script>

<template>
  <v-list-item :data-testid="`gasto-row-${gasto.id}`">
    <v-list-item-title>{{ ETIQUETAS[gasto.categoria] }}</v-list-item-title>
    <v-list-item-subtitle>
      {{ gasto.descripcion ?? 'Sin descripción' }}
      <template v-if="sNombre"> · Pagado por {{ sNombre }}</template>
    </v-list-item-subtitle>
    <template #append>
      <span class="text-body-2 mr-3">{{ formatearUSD(gasto.monto) }}</span>
      <v-btn
        v-if="editable"
        icon="mdi-delete"
        variant="text"
        size="small"
        color="error"
        :data-testid="`gasto-eliminar-${gasto.id}`"
        @click="emit('eliminar', gasto.id)"
      />
    </template>
  </v-list-item>
</template>

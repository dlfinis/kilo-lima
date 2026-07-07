<script setup lang="ts">
// REQ-POS-37, REQ-POS-39, REQ-POS-54: one row in the gastos
// imprevistos list. Shows categoria label, motivo, monto USD. Emits
// `eliminar` so the parent view owns the confirmation dialog.
// `editable` hides the delete button when the parent evento is
// cerrado (REQ-POS-39).
import { computed } from 'vue'
import { formatearUSD } from '@/utils/format'
import type { CategoriaImprevisto, GastoImprevisto } from '@/types'
import { useSociosStore } from '@/stores/socios.store'

const props = withDefaults(
  defineProps<{ gasto: GastoImprevisto; editable?: boolean }>(),
  { editable: true },
)

const emit = defineEmits<{
  eliminar: [id: string]
}>()

const sNombre = computed<string | null>(() => {
  if (!props.gasto.socio_id) return null
  return useSociosStore().nombreSocio(props.gasto.socio_id) || null
})

const ETIQUETAS: Record<CategoriaImprevisto, string> = {
  insumos_extra: 'Insumos extra',
  transporte: 'Transporte',
  reparacion: 'Reparación',
  propina: 'Propina',
  otro: 'Otro',
}
</script>

<template>
  <v-list-item :data-testid="`imprevisto-row-${gasto.id}`">
    <v-list-item-title>
      {{ gasto.categoria ? ETIQUETAS[gasto.categoria] : 'Sin categoría' }}
    </v-list-item-title>
    <v-list-item-subtitle>
      {{ gasto.motivo }}
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
        :data-testid="`imprevisto-eliminar-${gasto.id}`"
        @click="emit('eliminar', gasto.id)"
      />
    </template>
  </v-list-item>
</template>
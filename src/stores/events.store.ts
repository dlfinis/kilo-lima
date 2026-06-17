// PR1 skeleton — full action surface (crear/actualizar/cambiarEstado/
// eliminar + gasto CRUD) lands in PR2a per tasks.md. The reactive
// `useProyeccionCostos` composable already reads from this store's
// state, so the shape must exist now. Defining the reactive state
// with no actions means mutations happen only in PR2a — anything
// outside PR2a that mutates this state is a bug.
import { ref } from 'vue'
import { defineStore } from 'pinia'

import type { Evento, GastoFijo } from '@/types'

export const useEventsStore = defineStore('events', () => {
  const eventos = ref<Evento[]>([])
  const eventoActual = ref<Evento | null>(null)
  const gastosFijos = ref<GastoFijo[]>([])

  return { eventos, eventoActual, gastosFijos }
})

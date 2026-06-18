// PR1 skeleton — full action surface (cargarPara, guardarPlan) lands
// in PR3 per tasks.md. The reactive `useProyeccionCostos` composable
// already reads from this store's `plan` ref, so the shape must exist
// now. PR3 wires the actions and the cross-store freeze gate.
import { ref } from 'vue'
import { defineStore } from 'pinia'

import type { PlanProduccion } from '@/types'

export const usePlansStore = defineStore('plans', () => {
  const plan = ref<PlanProduccion[]>([])

  return { plan }
})

// REQ-POS-37, REQ-POS-38, REQ-POS-39, REQ-POS-44, REQ-POS-55: PR1
// skeleton — per-evento list + EVENTO_CERRADO guard land in PR4. PR1
// ships the reactive state shape so PR4 can plug `cargarParaEvento`,
// `crear`, and `eliminar`.
import { inject, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, GastoImprevisto } from '@/types'

export const useGastosImprevistosStore = defineStore('gastosImprevistos', () => {
  const supabaseInyectado = inject<SupabaseClient<Database>>('supabase')
  if (!supabaseInyectado) {
    throw new Error('Supabase client no inyectado — ¿servicesPlugin instalado?')
  }
  void supabaseInyectado

  const gastos = ref<GastoImprevisto[]>([])
  const cargando = ref<boolean>(false)
  const error = ref<string | null>(null)

  return {
    gastos,
    cargando,
    error,
  }
})

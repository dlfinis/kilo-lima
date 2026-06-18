// REQ-POS-32, REQ-POS-33, REQ-POS-35, REQ-POS-36, REQ-POS-44, REQ-POS-55:
// PR1 skeleton — UNIQUE(evento_id) violation handling + transicion
// forward land in PR4. PR1 ships the reactive state shape (one cierre
// per evento) so PR4 can plug `cargarParaEvento` and
// `registrarCierre`.
import { inject, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { CierreCaja, Database } from '@/types'

export const useCierresCajaStore = defineStore('cierresCaja', () => {
  const supabaseInyectado = inject<SupabaseClient<Database>>('supabase')
  if (!supabaseInyectado) {
    throw new Error('Supabase client no inyectado — ¿servicesPlugin instalado?')
  }
  void supabaseInyectado

  const cierre = ref<CierreCaja | null>(null)
  const cargando = ref<boolean>(false)
  const error = ref<string | null>(null)

  return {
    cierre,
    cargando,
    error,
  }
})

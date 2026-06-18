// REQ-POS-1, REQ-POS-2, REQ-POS-3, REQ-POS-4, REQ-POS-5, REQ-POS-44,
// REQ-POS-55: PR1 skeleton — full CRUD + UNIQUE(receta_id) handling
// land in PR2. PR1 ships the reactive state shape so PR2 can plug
// `cargarDisponibles` and the cross-slice "Vender esta receta" button
// from RecetaDetalleView.
import { inject, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Producto } from '@/types'

export const useProductosStore = defineStore('productos', () => {
  const supabaseInyectado = inject<SupabaseClient<Database>>('supabase')
  if (!supabaseInyectado) {
    throw new Error('Supabase client no inyectado — ¿servicesPlugin instalado?')
  }
  void supabaseInyectado

  const productos = ref<Producto[]>([])
  const cargando = ref<boolean>(false)
  const error = ref<string | null>(null)

  return {
    productos,
    cargando,
    error,
  }
})

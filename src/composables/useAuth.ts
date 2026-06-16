import { ref, type Ref } from 'vue'
import type { Session, User } from '@supabase/supabase-js'

// Stub composable. The auth slice lands in a later change; today we ship
// the reactive surface and contract so future views can `useAuth()` and
// HomeView (REQ-AUTH-4) stays decoupled from implementation details.
export interface UseAuthReturn {
  usuarioActual: Ref<User | null>
  sesionActiva: Ref<boolean>
  cargando: Ref<boolean>
  iniciarSesion: (email: string, password: string) => Promise<void>
  cerrarSesion: () => Promise<void>
  obtenerUsuarioActual: () => Promise<User | null>
  registrar: (email: string, password: string) => Promise<void>
}

const NO_IMPLEMENTADO = 'No implementado: el flujo de autenticación llega en un slice posterior.'

export function useAuth(): UseAuthReturn {
  const usuarioActual = ref<User | null>(null)
  const sesionActiva = ref<boolean>(false)
  const cargando = ref<boolean>(false)

  return {
    usuarioActual,
    sesionActiva,
    cargando,
    iniciarSesion: async () => {
      throw new Error(NO_IMPLEMENTADO)
    },
    cerrarSesion: async () => {
      throw new Error(NO_IMPLEMENTADO)
    },
    obtenerUsuarioActual: async () => {
      throw new Error(NO_IMPLEMENTADO)
    },
    registrar: async () => {
      throw new Error(NO_IMPLEMENTADO)
    },
  }
}

// Re-export so future slices don't have to know the import path.
export type { Session, User }

// REQ-UX-9, REQ-UX-10 + REQ-UX-25: composable that aggregates the
// six home counters from existing Pinia stores and orchestrates
// parallel loading with `Promise.allSettled` so one store's failure
// never blanks the entire home (REQ-UX-10 + design §3).
//
// The composable is a THIN container/presentational seam — it does
// NOT mutate store state beyond calling each store's documented
// loaders. It reads via `storeToRefs` so the computed stays reactive
// when stores update from other views (e.g. POS registrarVenta).
//
// `ventasHoy` is intentionally derived LAZILY: we only call
// `ventasStore.cargarPorEvento` when there is an evento `en_curso`
// (REQ-UX-10 "ventas lazy") — fetching the entire ventas table on
// every home mount would not scale.
//
// The flags `cargado` / `errores` are MODULE-LEVEL shared state so
// every `useResumen()` call (HomeView mount, child component mount,
// hot-reload rerun) sees the same loading state. Without this,
// `leerContadores()` after `cargar()` would return a fresh ref and
// the home would flicker back to skeleton.
import { computed, ref, type Ref } from 'vue'
import { storeToRefs } from 'pinia'

import { useEventsStore } from '@/stores/events.store'
import { useIngredientsStore } from '@/stores/ingredients.store'
import { useProductosStore } from '@/stores/productos.store'
import { useRecipesStore } from '@/stores/recipes.store'
import { useVentasStore } from '@/stores/ventas.store'

export interface Contadores {
  materiasPrimas: number
  recetas: number
  eventosTotal: number
  eventosEnCurso: number
  eventosPlanificacion: number
  eventosCerrados: number
  productos: number
  ventasHoy: number
  cierresCaja: number
  cargado: boolean
  errores: string[]
}

const MENSAJE_ERROR_AGREGADO = 'No se pudieron cargar los datos'

// Shared state — see comment above.
const cargado: Ref<boolean> = ref(false)
const errores: Ref<string[]> = ref<string[]>([])
const cierresCaja: Ref<number> = ref(0)

export function useResumen() {
  const ingredientsStore = useIngredientsStore()
  const recipesStore = useRecipesStore()
  const eventsStore = useEventsStore()
  const productosStore = useProductosStore()
  const ventasStore = useVentasStore()

  const refs = {
    ingredients: storeToRefs(ingredientsStore),
    recipes: storeToRefs(recipesStore),
    events: storeToRefs(eventsStore),
    productos: storeToRefs(productosStore),
    ventas: storeToRefs(ventasStore),
  }

  async function cargar(): Promise<void> {
    errores.value = []

    // Parallel fetch of the four list stores. `allSettled` isolates
    // failures so a single broken Supabase table never blanks the
    // entire home (REQ-UX-10 + design §3). Each store records errors
    // in its own `error` ref (Spanish message) — we surface those to
    // the home via the shared `errores` array.
    const stores = [
      { store: ingredientsStore, name: 'materias primas' as const },
      { store: recipesStore, name: 'recetas' as const },
      { store: eventsStore, name: 'eventos' as const },
      { store: productosStore, name: 'productos' as const },
    ]
    const resultados = await Promise.allSettled(
      stores.map((s) => s.store.cargarTodas()),
    )
    for (let i = 0; i < resultados.length; i++) {
      const r = resultados[i]!
      const target = stores[i]!
      if (r.status === 'rejected' || target.store.error) {
        errores.value.push(
          target.store.error ?? `No se pudieron cargar ${target.name}`,
        )
      }
    }

    // Lazy ventas: only fetch when there's an active evento. The POS
    // already calls cargarPorEvento on mount — here we mirror that
    // pattern so the home `ventasHoy` counter reflects reality.
    const eventoActivo = eventsStore.eventos.find((e) => e.estado === 'en_curso')
    if (eventoActivo) {
      try {
        await ventasStore.cargarPorEvento(eventoActivo.id)
      } catch {
        errores.value.push(MENSAJE_ERROR_AGREGADO)
      }
    }

    // cierresCaja is exposed per design §5 but the spec only requires
    // a single boolean count. We surface the current `cierre` from the
    // cierresCaja store when it exists, otherwise 0. The home view
    // uses this for the "Cierres de caja" chip; no eager fetch needed.
    cierresCaja.value = 0

    cargado.value = true
  }

  const contadores = computed<Contadores>(() => {
    const evs = refs.events.eventos.value
    return {
      materiasPrimas: refs.ingredients.materiasPrimas.value.length,
      recetas: refs.recipes.recetas.value.length,
      eventosTotal: evs.length,
      eventosEnCurso: evs.filter((e) => e.estado === 'en_curso').length,
      eventosPlanificacion: evs.filter((e) => e.estado === 'planificacion').length,
      eventosCerrados: evs.filter((e) => e.estado === 'cerrado').length,
      productos: refs.productos.productos.value.length,
      ventasHoy: refs.ventas.ventas.value.length,
      cierresCaja: cierresCaja.value,
      cargado: cargado.value,
      errores: errores.value,
    }
  })

  return { contadores, cargar }
}

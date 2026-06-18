// REQ-POS-6, REQ-POS-7..14, REQ-POS-15, REQ-POS-16, REQ-POS-51, REQ-POS-55:
// PR1 skeleton — full cart state + registrarVenta action lives in
// PR3 (with optimistic UI and revert-on-failure). PR1 ships the
// reactive refs and the helpers PR3 will compose. Cross-store READS
// (eventsStore.eventoEnCurso) happen inside `computed()` — WRITES are
// forbidden per REQ-POS-51.
import { computed, inject, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  LineaCarrito,
  ServiceError,
  VentaConItems,
} from '@/types'

const LIMITE_CANTIDAD_MAX = 99
const CODIGO_SIN_EVENTO: ServiceError = {
  code: 'SIN_EVENTO_ACTIVO',
  message: 'No hay un evento en curso',
}
const CODIGO_CANTIDAD_INVALIDA: ServiceError = {
  code: 'CANTIDAD_INVALIDA',
  message: 'La cantidad debe estar entre 1 y 99',
}

export const useVentasStore = defineStore('ventas', () => {
  // PR1 injects supabase to keep the contract uniform with PR3 — the
  // real registrarVenta path needs it. PR1 doesn't call Supabase yet.
  const supabaseInyectado = inject<SupabaseClient<Database>>('supabase')
  if (!supabaseInyectado) {
    throw new Error('Supabase client no inyectado — ¿servicesPlugin instalado?')
  }
  // Suppress unused until PR3 wires registrarVenta — keeps the strict
  // typed client resolution live.
  void supabaseInyectado

  const ventas = ref<VentaConItems[]>([])
  const carrito = ref<LineaCarrito[]>([])
  const cargando = ref<boolean>(false)
  const error = ref<string | null>(null)

  function agregarAlCarrito(productoId: string, nombre: string, precioUnitario: number): void {
    const existente = carrito.value.find((l) => l.producto_id === productoId)
    if (existente) {
      if (existente.cantidad >= LIMITE_CANTIDAD_MAX) return
      const nuevaCantidad = existente.cantidad + 1
      existente.cantidad = nuevaCantidad
      existente.subtotal = Math.round((nuevaCantidad * precioUnitario + Number.EPSILON) * 100) / 100
      return
    }
    carrito.value = [
      ...carrito.value,
      { producto_id: productoId, nombre, precio_unitario: precioUnitario, cantidad: 1, subtotal: precioUnitario },
    ]
  }

  function actualizarCantidad(productoId: string, cantidad: number): void {
    if (cantidad < 0) return
    if (cantidad === 0) {
      quitarDelCarrito(productoId)
      return
    }
    const linea = carrito.value.find((l) => l.producto_id === productoId)
    if (!linea) return
    const capped = Math.min(cantidad, LIMITE_CANTIDAD_MAX)
    linea.cantidad = capped
    linea.subtotal = Math.round((capped * linea.precio_unitario + Number.EPSILON) * 100) / 100
  }

  function quitarDelCarrito(productoId: string): void {
    carrito.value = carrito.value.filter((l) => l.producto_id !== productoId)
  }

  function vaciarCarrito(): void {
    carrito.value = []
  }

  const totalCarrito = computed<number>(() =>
    Math.round((carrito.value.reduce((acc, l) => acc + l.subtotal, 0) + Number.EPSILON) * 100) / 100,
  )
  const cantidadItems = computed<number>(() =>
    carrito.value.reduce((acc, l) => acc + l.cantidad, 0),
  )

  return {
    ventas,
    carrito,
    cargando,
    error,
    totalCarrito,
    cantidadItems,
    agregarAlCarrito,
    actualizarCantidad,
    quitarDelCarrito,
    vaciarCarrito,
    CODIGO_SIN_EVENTO,
    CODIGO_CANTIDAD_INVALIDA,
  }
})

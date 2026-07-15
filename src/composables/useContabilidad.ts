import { computed, type ComputedRef, ref } from 'vue'

import { useSociosStore } from '@/stores/socios.store'
import { useAbastecimientoStore } from '@/stores/abastecimiento.store'
import { useGastosFijosStore } from '@/stores/gastosFijos.store'
import { useGastosImprevistosStore } from '@/stores/gastosImprevistos.store'
import { useVentasStore } from '@/stores/ventas.store'
import { useStockMovementsStore } from '@/stores/stockMovements.store'
import { redondearCentavos } from '@/utils/moneda'
import type {
  Aporte,
  CompraInsumo,
  EventoSocio,
  GastoFijo,
  GastoImprevisto,
  InversionSocio,
  MovimientoTimeline,
  DistribucionResultado,
} from '@/types'

// Phase 4 (REQ-STOCK-MOVEMENTS-4): cogsConfiable indicates whether
// COGS is computed from real stock consumption movements (trusted)
// or falls back to venta-item theoretical costs (untrusted).
export interface ResumenContabilidad {
  totalVentas: number
  totalCogs: number
  cogsConfiable: boolean
  totalGastosFijos: number
  totalGastosImprevistos: number
  totalAportes: number
  totalCompras: number
  utilidadBruta: number
  utilidadNeta: number
}

export function useContabilidad(eventoId: ComputedRef<string | null>) {
  const cargando = ref<boolean>(false)
  const error = ref<string | null>(null)

  const eventosSocios = computed<EventoSocio[]>(() => {
    const id = eventoId.value
    if (!id) return []
    return useSociosStore().evento_socios.get(id) ?? []
  })

  const gastosFijos = computed<GastoFijo[]>(() => {
    const id = eventoId.value
    if (!id) return []
    return useGastosFijosStore().gastosPorEvento.get(id) ?? []
  })

  const gastosImprevistos = computed<GastoImprevisto[]>(() => {
    const id = eventoId.value
    if (!id) return []
    return useGastosImprevistosStore().gastosPorEvento.get(id) ?? []
  })

  const ventas = computed(() => {
    const id = eventoId.value
    if (!id) return []
    return useVentasStore().ventas
  })

  const aportes = computed<Aporte[]>(() => {
    const id = eventoId.value
    if (!id) return []
    return useSociosStore().aportes.get(id) ?? []
  })

  const compras = computed<CompraInsumo[]>(() => {
    const id = eventoId.value
    if (!id) return []
    return useAbastecimientoStore().comprasInsumos.get(id) ?? []
  })

  // Phase 4: COGS from stock movement consumption evidence.
  // Trusted when real consumption movements exist for the event;
  // untrusted (zero COGS, flagged) when consumption evidence is missing.
  // This prevents silent fallback to theoretical costo_unitario values.
  const cogsDesdeMovimientos = computed<{ total: number; confiable: boolean }>(() => {
    const id = eventoId.value
    if (!id) return { total: 0, confiable: false }

    const stockStore = useStockMovementsStore()
    const consumos = stockStore.movements.filter(
      (m) => m.tipo === 'consumo' && m.evento_id === id,
    )

    if (consumos.length === 0) {
      return { total: 0, confiable: false }
    }

    const total = consumos.reduce(
      (s, m) => s + Math.abs(m.cantidad) * (m.costo_unitario_snapshot ?? 0),
      0,
    )
    return { total: redondearCentavos(total), confiable: true }
  })

  const resumen = computed<ResumenContabilidad>(() => {
    const gFijos = gastosFijos.value
    const gImp = gastosImprevistos.value
    const vtas = ventas.value
    const ap = aportes.value
    const comp = compras.value
    const cogs = cogsDesdeMovimientos.value

    const totalVentas = vtas.reduce((s, v) => s + (Number.isFinite(v.total) ? v.total : 0), 0)

    // Phase 4: use movement-backed COGS when available.
    // When no consumption movements exist, cogsConfiable is false
    // and totalCogs is 0 — the UI should surface the untrusted state.
    const totalCogs = cogs.total
    const cogsConfiable = cogs.confiable

    const totalGastosFijos = gFijos.reduce((s, g) => s + (Number.isFinite(g.monto) ? g.monto : 0), 0)
    const totalGastosImprevistos = gImp.reduce((s, g) => s + (Number.isFinite(g.monto) ? g.monto : 0), 0)
    const totalAportes = ap.reduce((s, a) => s + (Number.isFinite(a.monto) ? a.monto : 0), 0)
    const totalCompras = comp.reduce((s, c) => s + (Number.isFinite(c.costo_total) ? c.costo_total : 0), 0)
    const utilidadBruta = totalVentas - totalCogs
    const utilidadNeta = utilidadBruta - totalGastosFijos - totalGastosImprevistos

    return {
      totalVentas: redondearCentavos(totalVentas),
      totalCogs: redondearCentavos(totalCogs),
      cogsConfiable,
      totalGastosFijos: redondearCentavos(totalGastosFijos),
      totalGastosImprevistos: redondearCentavos(totalGastosImprevistos),
      totalAportes: redondearCentavos(totalAportes),
      totalCompras: redondearCentavos(totalCompras),
      utilidadBruta: redondearCentavos(utilidadBruta),
      utilidadNeta: redondearCentavos(utilidadNeta),
    }
  })

  const inversionPorSocio = computed<InversionSocio[]>(() => {
    const id = eventoId.value
    if (!id) return []

    const gFijos = gastosFijos.value
    const gImp = gastosImprevistos.value
    const ap = aportes.value
    const comp = compras.value
    const sociosStore = useSociosStore()

    const mapa = new Map<string, InversionSocio>()

    function asegurar(socioId: string): InversionSocio {
      let existe = mapa.get(socioId)
      if (!existe) {
        existe = {
          socioId,
          socioNombre: sociosStore.nombreSocio(socioId),
          totalAportes: 0,
          totalCompras: 0,
          totalGastosFijos: 0,
          totalGastosImprevistos: 0,
          inversionTotal: 0,
          porcentajeInversion: 0,
        }
        mapa.set(socioId, existe)
      }
      return existe
    }

    for (const a of ap) {
      const s = asegurar(a.socio_id)
      s.totalAportes += Number.isFinite(a.monto) ? a.monto : 0
    }
    for (const c of comp) {
      const s = asegurar(c.socio_id)
      s.totalCompras += Number.isFinite(c.costo_total) ? c.costo_total : 0
    }
    for (const g of gFijos) {
      if (!g.socio_id) continue
      const s = asegurar(g.socio_id)
      s.totalGastosFijos += Number.isFinite(g.monto) ? g.monto : 0
    }
    for (const g of gImp) {
      if (!g.socio_id) continue
      const s = asegurar(g.socio_id)
      s.totalGastosImprevistos += Number.isFinite(g.monto) ? g.monto : 0
    }

    const resultado = Array.from(mapa.values())
    for (const s of resultado) {
      s.inversionTotal = redondearCentavos(s.totalAportes + s.totalCompras + s.totalGastosFijos + s.totalGastosImprevistos)
    }

    const totalInversion = resultado.reduce((s, r) => s + r.inversionTotal, 0)
    for (const s of resultado) {
      s.porcentajeInversion = totalInversion > 0 ? redondearCentavos(s.inversionTotal / totalInversion) : 0
    }

    return resultado.sort((a, b) => b.inversionTotal - a.inversionTotal)
  })

  const distribucion = computed<DistribucionResultado>(() => {
    const sociosList = inversionPorSocio.value
    const totalInversion = sociosList.reduce((s, r) => s + r.inversionTotal, 0)
    const utilidadNeta = resumen.value.utilidadNeta
    const sociosStore = useSociosStore()
    const evSocios = eventosSocios.value

    const distribucion = evSocios.map((es) => {
      const socio = sociosList.find((s) => s.socioId === es.socio_id)
      const nombre = socio?.socioNombre ?? sociosStore.nombreSocio(es.socio_id)
      const parte = redondearCentavos(utilidadNeta * es.porcentaje_ganancia)
      return {
        socioId: es.socio_id,
        socioNombre: nombre,
        porcentajeGanancia: es.porcentaje_ganancia,
        parteGanancia: parte,
      }
    })

    return {
      socios: sociosList,
      totalInversion: redondearCentavos(totalInversion),
      utilidadNeta,
      distribucion,
    }
  })

  const timeline = computed<MovimientoTimeline[]>(() => {
    const id = eventoId.value
    if (!id) return []

    const sociosStore = useSociosStore()
    const movimientos: MovimientoTimeline[] = []

    for (const v of ventas.value) {
      movimientos.push({
        fecha: v.fecha ?? v.created_at,
        socioId: null,
        socioNombre: null,
        tipo: 'venta',
        concepto: `Venta #${v.comprobante_numero ?? ''} (${v.metodo_pago})`,
        monto: v.total,
        eventoId: id,
      })
    }

    for (const g of gastosFijos.value) {
      movimientos.push({
        fecha: g.created_at,
        socioId: g.socio_id ?? null,
        socioNombre: g.socio_id ? sociosStore.nombreSocio(g.socio_id) : null,
        tipo: 'gasto_fijo',
        concepto: `Gasto fijo: ${g.categoria}${g.descripcion ? ` (${g.descripcion})` : ''}`,
        monto: -Math.abs(g.monto),
        eventoId: id,
      })
    }

    for (const g of gastosImprevistos.value) {
      movimientos.push({
        fecha: g.created_at,
        socioId: g.socio_id ?? null,
        socioNombre: g.socio_id ? sociosStore.nombreSocio(g.socio_id) : null,
        tipo: 'gasto_imprevisto',
        concepto: `Imprevisto: ${g.motivo}`,
        monto: -Math.abs(g.monto),
        eventoId: id,
      })
    }

    for (const a of aportes.value) {
      movimientos.push({
        fecha: a.fecha,
        socioId: a.socio_id,
        socioNombre: sociosStore.nombreSocio(a.socio_id),
        tipo: 'aporte',
        concepto: `Aporte de capital${a.descripcion ? `: ${a.descripcion}` : ''}`,
        monto: Math.abs(a.monto),
        eventoId: id,
      })
    }

    for (const c of compras.value) {
      movimientos.push({
        fecha: c.fecha,
        socioId: c.socio_id,
        socioNombre: sociosStore.nombreSocio(c.socio_id),
        tipo: 'compra_insumo',
        concepto: `Compra insumo${c.descripcion ? `: ${c.descripcion}` : ''}`,
        monto: -Math.abs(c.costo_total),
        eventoId: id,
      })
    }

    return movimientos.sort((a, b) => b.fecha.localeCompare(a.fecha))
  })

  async function cargarTodo() {
    const id = eventoId.value
    if (!id) return

    cargando.value = true
    error.value = null

    const sociosStore = useSociosStore()
    const abastecimientoStore = useAbastecimientoStore()
    const stockStore = useStockMovementsStore()
    await Promise.all([
      sociosStore.cargarSociosEvento(id),
      sociosStore.cargarAportes(id),
      abastecimientoStore.cargarComprasInsumos(id),
      // Phase 4: load stock movements so COGS can be computed from
      // real consumption evidence.
      stockStore.cargarMovimientos(),
    ])

    cargando.value = false
  }

  return {
    cargando,
    error,
    resumen,
    cogsDesdeMovimientos,
    inversionPorSocio,
    distribucion,
    timeline,
    cargarTodo,
  }
}

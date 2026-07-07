export interface Socio {
  id: string
  nombre: string
  email: string | null
  telefono: string | null
  notas: string | null
  created_at: string
}

export type SocioInput = Omit<Socio, 'id' | 'created_at'>

export interface EventoSocio {
  id: string
  evento_id: string
  socio_id: string
  porcentaje_ganancia: number
  created_at: string
}

export type EventoSocioInput = Omit<EventoSocio, 'id' | 'created_at'>

export interface Aporte {
  id: string
  evento_id: string
  socio_id: string
  monto: number
  fecha: string
  descripcion: string | null
  created_at: string
}

export type AporteInput = Omit<Aporte, 'id' | 'created_at'>

export interface CompraInsumo {
  id: string
  evento_id: string | null
  socio_id: string
  materia_prima_id: string
  cantidad: number
  costo_total: number
  fecha: string
  descripcion: string | null
  created_at: string
}

export type CompraInsumoInput = Omit<CompraInsumo, 'id' | 'created_at'>

export interface SocioConDetalle extends Socio {
  evento_socios?: EventoSocio
}

export interface EventoSocioConDetalle extends EventoSocio {
  socio_nombre: string
}

export interface AporteConDetalle extends Aporte {
  socio_nombre: string
}

export interface CompraInsumoConDetalle extends CompraInsumo {
  socio_nombre: string
  materia_prima_nombre: string
}

export interface InversionSocio {
  socioId: string
  socioNombre: string
  totalAportes: number
  totalCompras: number
  totalGastosFijos: number
  totalGastosImprevistos: number
  inversionTotal: number
  porcentajeInversion: number
}

export interface DistribucionResultado {
  socios: InversionSocio[]
  totalInversion: number
  utilidadNeta: number
  distribucion: Array<{
    socioId: string
    socioNombre: string
    porcentajeGanancia: number
    parteGanancia: number
  }>
}

export interface MovimientoTimeline {
  fecha: string
  socioId: string | null
  socioNombre: string | null
  tipo: 'venta' | 'gasto_fijo' | 'gasto_imprevisto' | 'aporte' | 'compra_insumo'
  concepto: string
  monto: number
  eventoId: string
}

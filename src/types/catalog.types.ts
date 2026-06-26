// Spanish domain types per REQ-CATALOG-26 / REQ-CATALOG-37.
// Field names mirror SQL columns 1:1 to eliminate name-mapping bugs.
export type UnidadMedida = 'kg' | 'g' | 'l' | 'ml' | 'unidad'
export type CategoriaMateriaPrima = 'ingrediente' | 'empaque'

export interface MateriaPrima {
  id: string
  nombre: string
  unidad: UnidadMedida
  costo_por_unidad: number
  categoria: CategoriaMateriaPrima
  notas: string | null
  created_at: string
  updated_at: string
}

export type MateriaPrimaInput = Omit<MateriaPrima, 'id' | 'created_at' | 'updated_at'>

export interface Receta {
  id: string
  nombre: string
  descripcion: string | null
  rendimiento_unidades: number
  notas: string | null
  created_at: string
  updated_at: string
}

export type RecetaInput = Omit<Receta, 'id' | 'created_at' | 'updated_at'>

export interface IngredienteReceta {
  id: string
  receta_id: string
  materia_prima_id: string
  cantidad: number
  created_at: string
}

export type IngredienteRecetaInput = Pick<IngredienteReceta, 'materia_prima_id' | 'cantidad'>

// Receta + its ingredient lines as a single store-friendly shape. The
// service.listar() returns this so the recipes store and the calculator
// can read both fields without a second round-trip.
export interface RecetaConIngredientes extends Receta {
  ingredientes: IngredienteReceta[]
}

// `RecetaInput` joined with the ingredient inputs the form passes up.
// Lives next to the form-facing types so callers can name it without
// importing from the service layer.
export type RecetaInputCompleto = RecetaInput & { ingredientes: IngredienteRecetaInput[] }

export interface LineaCalculo {
  ingrediente: IngredienteReceta
  materiaPrima: MateriaPrima | null
  subtotal: number
  advertencia?: 'MATERIA_PRIMA_FALTANTE'
}

export interface CalculoReceta {
  ingredientes: LineaCalculo[]
  costoTotal: number
  costoPorUnidad: number
}

// LSP surface for service methods — never-throw contract per REQ-CATALOG-44.
export interface ServiceError {
  code: string
  message: string
}

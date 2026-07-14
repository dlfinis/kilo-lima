// REQ-EVENT-INGREDIENT-PURCHASING: pure derivation core for ingredient
// purchasing planning inside Gestión productos. `calcularIngredientesEvento`
// receives plain arrays and joins them in memory — no stores, no I/O — so
// the math stays testable and reusable without Vue. `useIngredientesEvento`
// wraps it inside a reactive `computed` following the
// `calcularProyeccion`/`useProyeccionCostos` pattern.
//
// Data flow (design §3):
//   producto_produccion → evento_productos → productos → recetas → receta_ingredientes → materias_primas
//   required = (ingredient.cantidad / receta.rendimiento_unidades) * unidades_a_producir
//   group by materia_prima_id → toBuy = max(totalRequired – (cantidad_disponible ?? 0), 0)

import type {
  ProductoProduccion,
  EventoProducto,
  Producto,
  RecetaConIngredientes,
  MateriaPrima,
  UnidadMedida,
} from '@/types'

// ---------------------------------------------------------------------------
// Result contracts
// ---------------------------------------------------------------------------

/** Per-ingredient requirement before stock check — used in per-product
 *  breakdown and as the building block for consolidated totals. */
export interface IngredienteRequerido {
  materiaPrimaId: string
  nombre: string
  unidad: UnidadMedida
  /** Total required quantity for this ingredient in the current context. */
  requerido: number
}

/** Consolidated ingredient row that adds stock and purchase-gap fields. */
export interface IngredienteCompra extends IngredienteRequerido {
  /** On-hand stock (`cantidad_disponible`); 0 when missing. */
  disponible: number
  /** Remaining quantity to purchase (`max(requerido - disponible, 0)`). */
  faltante: number
}

/** Per-product ingredient breakdown entry. */
export interface IngredientesPorProducto {
  eventoProductoId: string
  productoNombre: string
  ingredientes: IngredienteRequerido[]
}

/** Warning codes for missing / invalid links in the derivation chain. */
export type CodigoAdvertencia =
  | 'PRODUCTO_FALTANTE'
  | 'RECETA_FALTANTE'
  | 'RENDIMIENTO_INVALIDO'
  | 'MATERIA_PRIMA_FALTANTE'

export interface Advertencia {
  codigo: CodigoAdvertencia
  /** `evento_producto_id` or `materia_prima_id` of the broken link. */
  referenciaId: string
}

/** Top-level return type of `calcularIngredientesEvento`. */
export interface IngredientesEventoResultado {
  porProducto: IngredientesPorProducto[]
  consolidado: IngredienteCompra[]
  advertencias: Advertencia[]
}

// ---------------------------------------------------------------------------
// Pure derivation function
// ---------------------------------------------------------------------------

/**
 * Pure function: derives per-product ingredient requirements and a
 * consolidated "to-buy" list for one event from in-memory arrays.
 *
 * Only included event products (`incluido === true`) with positive planned
 * units contribute. Missing links or non-positive recipe yield produce
 * warnings and do not create invalid / NaN totals.
 *
 * @param produccion — rows from `producto_produccion` for the event
 * @param eventoProductos — rows from `evento_productos` for the event
 * @param productos — all catalog products (used to find `receta_id`)
 * @param recetas — all recipes with their ingredient lines
 * @param materiasPrimas — all raw materials with optional stock
 */
export function calcularIngredientesEvento(
  produccion: ProductoProduccion[],
  eventoProductos: EventoProducto[],
  productos: Producto[],
  recetas: RecetaConIngredientes[],
  materiasPrimas: MateriaPrima[],
): IngredientesEventoResultado {
  // --- Index helpers (defensive against empty / non-array inputs) ---
  const ppLista = Array.isArray(produccion) ? produccion : []
  const epLista = Array.isArray(eventoProductos) ? eventoProductos : []
  const prodLista = Array.isArray(productos) ? productos : []
  const recLista = Array.isArray(recetas) ? recetas : []
  const mpLista = Array.isArray(materiasPrimas) ? materiasPrimas : []

  const epMap = new Map(epLista.map((ep) => [ep.id, ep]))
  const prodMap = new Map(prodLista.map((p) => [p.id, p]))
  const recetaMap = new Map(recLista.map((r) => [r.id, r]))
  const mpMap = new Map(mpLista.map((m) => [m.id, m]))

  const advertencias: Advertencia[] = []
  const porProducto: IngredientesPorProducto[] = []

  // Accumulator for consolidated totals keyed by materia_prima_id.
  const acumulado = new Map<
    string,
    { nombre: string; unidad: UnidadMedida; requerido: number; disponible: number }
  >()

  for (const pp of ppLista) {
    // 1. Only rows with positive planned units contribute.
    if (pp.unidades_a_producir <= 0) continue

    // 2. Join: producto_produccion → evento_producto.
    const ep = epMap.get(pp.evento_producto_id)
    if (!ep) {
      advertencias.push({
        codigo: 'PRODUCTO_FALTANTE',
        referenciaId: pp.evento_producto_id,
      })
      continue
    }

    // 3. Only included event products contribute (per spec).
    if (!ep.incluido) continue

    // 4. Join: evento_producto → producto.
    const producto = prodMap.get(ep.producto_id)
    if (!producto) {
      advertencias.push({
        codigo: 'PRODUCTO_FALTANTE',
        referenciaId: ep.producto_id,
      })
      continue
    }

    // 5. Join: producto → receta.
    const receta = recetaMap.get(producto.receta_id)
    if (!receta) {
      advertencias.push({
        codigo: 'RECETA_FALTANTE',
        referenciaId: ep.producto_id,
      })
      continue
    }

    // 6. Defensive: non-positive yield → skip with warning.
    if (receta.rendimiento_unidades <= 0) {
      advertencias.push({
        codigo: 'RENDIMIENTO_INVALIDO',
        referenciaId: ep.producto_id,
      })
      continue
    }

    const unidades = pp.unidades_a_producir
    const perProductoIngredientes: IngredienteRequerido[] = []

    for (const ing of receta.ingredientes) {
      const mp = mpMap.get(ing.materia_prima_id)

      if (!mp) {
        advertencias.push({
          codigo: 'MATERIA_PRIMA_FALTANTE',
          referenciaId: ing.materia_prima_id,
        })
        // Missing materia_prima → skip this ingredient (don't create NaN)
        continue
      }

      // per design: required = (cantidad / rendimiento_unidades) * unidades_a_producir
      const requeridoPorUnidad = ing.cantidad / receta.rendimiento_unidades
      const requerido = requeridoPorUnidad * unidades

      if (!Number.isFinite(requerido)) continue

      perProductoIngredientes.push({
        materiaPrimaId: mp.id,
        nombre: mp.nombre,
        unidad: mp.unidad,
        requerido,
      })

      // Accumulate for consolidation
      const acum = acumulado.get(mp.id)
      if (acum) {
        acum.requerido += requerido
      } else {
        acumulado.set(mp.id, {
          nombre: mp.nombre,
          unidad: mp.unidad,
          requerido,
          disponible: mp.cantidad_disponible ?? 0,
        })
      }
    }

    porProducto.push({
      eventoProductoId: ep.id,
      productoNombre: producto.nombre,
      ingredientes: perProductoIngredientes,
    })
  }

  // Build consolidated "to-buy" list
  const consolidado: IngredienteCompra[] = Array.from(acumulado.entries()).map(
    ([id, acc]) => ({
      materiaPrimaId: id,
      nombre: acc.nombre,
      unidad: acc.unidad,
      requerido: acc.requerido,
      disponible: acc.disponible,
      faltante: Math.max(acc.requerido - acc.disponible, 0),
    }),
  )

  return { porProducto, consolidado, advertencias }
}

# Design: `finanzas-evento` — Financial Tracing, Margin Pricing & Post-Event Reports

> **Change**: `finanzas-evento` | **Phase**: `sdd-design` | **34 REQ-FIN-IDs** | **2 phases / 4 PRs**
> **Source**: proposal.md §3.1, spec.md, pricing-evento/spec.md, reporte-evento/spec.md, delta specs (events, pos, home)

---

## 1. Architecture Overview

This change introduces 2 new capabilities (`pricing-evento`, `reporte-evento`) and modifies 3 existing ones (`events`, `pos`, `home`). It spans all 5 architectural layers:

```
┌─────────────────────────────────────────────────────────────┐
│ VIEWS                                                        │
│  EventoProductosView ─ new   ReporteEventoView ─ new         │
│  EventoDetalleView ─ mod    PosView ─ mod    HomeView ─ mod  │
│  PlanificarEventoView ─ mod                                  │
├─────────────────────────────────────────────────────────────┤
│ COMPOSABLES                                                   │
│  usePreciosEvento ─ new    useReporteEvento ─ new            │
│  useCierreCaja ─ mod       useProyeccionCostos ─ mod         │
│  useResumen ─ mod (internal delta)                           │
├─────────────────────────────────────────────────────────────┤
│ STORES (Pinia)                                                │
│  eventoProductos.store ─ new                                 │
│  cierresCaja.store ─ mod   ventas.store ─ mod               │
│  events.store ─ mod (date fields)                            │
├─────────────────────────────────────────────────────────────┤
│ SERVICES (factory pattern, never-throw)                       │
│  eventoProductos.service ─ new                               │
│  cierresCaja.service ─ mod  ventas.service ─ mod             │
├─────────────────────────────────────────────────────────────┤
│ UTILS (pure functions)                                        │
│  pricing.ts ─ new           cierre.ts ─ mod                  │
│  ── calcularPrecioPorMargen ── calcularMargenReal            │
│  ── redondearCentavos (reused verbatim from moneda.ts)       │
├─────────────────────────────────────────────────────────────┤
│ TYPES                                                         │
│  evento_productos.types.ts ─ new                             │
│  pos.types.ts ─ mod         events.types.ts ─ mod            │
├─────────────────────────────────────────────────────────────┤
│ MIGRATION                                                     │
│  20260620000000_finanzas_evento.sql (5 DDL changes)          │
└─────────────────────────────────────────────────────────────┘
```

**Layering contract**: Views → composables → stores → services → Supabase. Utils are pure, called by composables AND services. Types flow downward; no layer imports from a layer above it. Every service is a factory `crear*(supabase)` returning `{ data, error }` — never throws.

---

## 2. Data Model

### 2.1 Entity-Relationship Diagram

```
┌─────────────┐          ┌──────────────────────┐
│   eventos   │ 1──────N │  evento_productos    │
│  (modified) │          │  (NEW)               │
│             │          │  id: uuid PK         │
│  fecha      │          │  evento_id: FK CASCADE│
│  → fecha_inicio (ren) │  producto_id: FK RESTRICT│
│  + fecha_fin (new)    │  precio_venta: NUMERIC │
│             │          │  margen: NUMERIC 0..1  │
│             │          │  incluido: BOOL        │
│             │          │  UNIQUE(evento_id,     │
│             │          │          producto_id)  │
└──────┬──────┘          └───────────┬──────────┘
       │                             │ N
       │                             │
       │ 1                    ┌──────┴──────────┐
       │                      │   productos     │
       │                      │   (unchanged)   │
       │                      │  receta_id FK   │
       │                      │  precio_venta   │
       │                      │  costo (computed)│
       │                      └─────────────────┘
       │
       │ 1
┌──────┴──────────────┐
│  cierres_caja       │
│  (modified)         │
│  + total_cogs       │  ← NEW
│  + total_utilidad_bruta │ ← NEW
│  + total_utilidad_neta  │ ← NEW
│  (existing fields   │
│   unchanged)        │
└─────────────────────┘
       │
       │ references
       ▼
┌──────────────────────────────────┐
│  venta_items                     │
│  (modified)                      │
│  + costo_unitario (NUMERIC NULL) │ ← NEW — snapshot at sale
│  + margen_aplicado (NUMERIC NULL)│ ← NEW — snapshot at sale
│  + evento_producto_id (FK NULL)  │ ← NEW — links to config
│  existing fields unchanged       │
└──────────────────────────────────┘
       │
       │ N:1
       ▼
┌──────────┐
│  ventas  │
│(unchanged)│
└──────────┘
```

### 2.2 Key Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | `evento_productos` is a config entity (event-level scope), NOT transactional | Pricing decisions belong to the evento configuration, not the sale ledger. Changing a `margen` mid-evento is out of scope (PD-5). |
| D2 | `costo_unitario` in `venta_items` is write-once (snapshot at sale time), never recalculated | Same pattern as `precio_unitario` (REQ-POS-13). Historical ventas stay immutable regardless of receta cost changes. |
| D3 | No backfill of historical ventas. `costo_unitario ?? 0` in COGS aggregation | User-confirmed (PD-4). Legacy ventas have NULL `costo_unitario` and `evento_producto_id` → COGS=0. The closure-time backfill only fills items that already have an `evento_producto_id` link. |
| D4 | `utilidadBruta = totalVentas − COGS` | The buggy formula subtracted `gastosFijos + gastosImprevistos` instead of COGS. Fixed here. |
| D5 | `utilidadNeta = utilidadBruta − (gastosFijos + gastosImprevistos)` | Separates COGS (what the goods cost) from OPEX (what the event cost). |
| D6 | `precio = costo / (1 − margen)` — single `redondearCentavos` at final result | No intermediate rounding (AC-7). Prevents float-drift across 100+ items. |
| D7 | Multi-day: `fecha_inicio` (rename of `eventos.fecha`) + `fecha_fin` (new, nullable = same day). CHECK `fecha_fin >= fecha_inicio` on DB. | Reflects real-world ferias (e.g., "18–22 diciembre"). Nullable `fecha_fin` means single-day; non-null means multi-day. |

### 2.3 Modified Column Details

**`eventos` table (REQ-FIN-1):**
```sql
-- Before:
fecha DATE NOT NULL

-- After:
fecha_inicio DATE NOT NULL
fecha_fin    DATE NOT NULL CHECK (fecha_fin >= fecha_inicio)
-- Migration: RENAME fecha TO fecha_inicio; ALTER TABLE ADD fecha_fin DEFAULT fecha_inicio
```

**`venta_items` table (REQ-FIN-12):**
```sql
-- NEW columns (all nullable — legacy rows preserve NULLs):
costo_unitario     NUMERIC                                  -- snapshot at sale time
margen_aplicado    NUMERIC                                  -- snapshot at sale time
evento_producto_id UUID REFERENCES evento_productos(id)     -- nullable (legacy: NULL)
```

**`cierres_caja` table (REQ-FIN-5):**
```sql
-- NEW columns (NOT NULL with DEFAULT 0 for existing rows):
total_cogs            NUMERIC NOT NULL DEFAULT 0
total_utilidad_bruta  NUMERIC NOT NULL DEFAULT 0
total_utilidad_neta   NUMERIC NOT NULL DEFAULT 0
```

---

## 3. Component Tree

```
App.vue
├── HomeView.vue ── MODIFIED
│   ├── ContadoresHome.vue (unchanged)
│   ├── BannerEventoActivo.vue (unchanged)
│   ├── SiguientePasoCta.vue (unchanged)
│   └── Post-evento card ── from disabled → conditional enabled (REQ-FIN-33/34)
│
├── EventoDetalleView.vue ── MODIFIED
│   ├── EventoStatusChip.vue (unchanged)
│   ├── ProyeccionCostosCard.vue ── MODIFIED (REQ-FIN-? see §4)
│   ├── GastoFijoForm.vue (unchanged)
│   ├── GastoFijoListItem.vue (unchanged)
│   ├── "PRODUCTOS DEL EVENTO" section ── NEW (REQ-FIN-20)
│   │   └── links to /eventos/:id/productos
│   └── "REPORTE" section ── NEW (REQ-FIN-27)
│       └── links to /eventos/:id/reporte (cerrado only)
│
├── EventoProductosView.vue ── NEW
│   ├── MargenSlider.vue ── NEW (REQ-FIN-19)
│   ├── v-data-table (producto | costo | margen slider | precio | incluido checkbox)
│   └── Bulk action button "SELECCIONAR TODOS CON MARGEN 40%"
│
├── ReporteEventoView.vue ── NEW
│   ├── v-tabs: "Por día" | "Por producto" | "Cierre"
│   ├── Tab "Por día": table from reportePorDia[]
│   ├── Tab "Por producto": bars from reportePorProducto[]
│   └── Tab "Cierre": CierreResumenCard.vue ── MODIFIED (REQ-FIN-11)
│
├── PosView.vue ── MODIFIED
│   ├── ProductoCardGrid.vue (unchanged — but receives filtered products)
│   ├── ProductoCard.vue (unchanged — but displays evento_producto.precio_venta)
│   ├── CarritoPanel.vue (unchanged)
│   ├── RegistrarVentaDialog.vue (unchanged)
│   └── Cerrado message "Este evento está cerrado" ── NEW (REQ-FIN-32)
│
└── PlanificarEventoView.vue ── MODIFIED
    └── fecha → fecha_inicio + fecha_fin (2 date pickers)
```

---

## 4. New Components Contracts

### 4.1 MargenSlider.vue (REQ-FIN-19)

A reusable slider/input for margin configuration. Accepts 0..1 internally, displays 0%..90% to the user.

```vue
<!-- Props -->
defineProps<{
  modelValue: number       // 0..1 (DB representation)
  costo: number            // product cost, used for live price preview
  disabled?: boolean       // default false
}>()

<!-- Emits -->
defineEmits<{
  'update:modelValue': [value: number]  // emits 0..1 on slider change
}>()
```

**Slots**: none (self-contained)

**Internal behavior**: 
- Renders a `v-slider` 0–90 (percentage) + `v-text-field` for manual input
- Computes `precioPreview = calcularPrecioPorMargen(costo, modelValue)` 
- Displays `{{ (modelValue * 100).toFixed(0) }}%` and `${{ precioPreview.toFixed(2) }}`
- Conversion: UI % ↔ DB decimal handled internally; parent only sees 0..1

### 4.2 EventoProductosView.vue (REQ-FIN-18)

Per-evento product picker at `/eventos/:id/productos`. Gated by `estadoEsEditable`.

```vue
<!-- Props: none (reads eventoId from route.params.id) -->

<!-- Composables consumed -->
const { productos, cargando, error, cargarParaEvento,
        actualizarMargen, actualizarIncluido } = useEventoProductosStore()
const { productos: productosCatalogo } = useProductosStore()
const eventoId = computed(() => route.params.id as string)

<!-- Data flow -->
onMounted → cargarParaEvento(eventoId) + cargarCatalogo si vacío
Table rows ← eventoProductos.filter(ep => ep.evento_id === eventoId)
Bulk action → inicializarDesdeCatalogo(eventoId, 0.40)
```

**Table columns**: producto (name from catalog) | costo | MargenSlider | precio (computed, live) | incluido (checkbox)

**Read-only mode**: When `evento.estado === 'cerrado'`, all sliders/checkboxes disabled, alert "Evento cerrado — no editable".

### 4.3 ReporteEventoView.vue (REQ-FIN-23)

Post-evento report at `/eventos/:id/reporte`. Three tabs consuming `useReporteEvento`.

```vue
<!-- Props: none (reads eventoId from route.params.id) -->

<!-- Composables consumed -->
const eventoId = computed(() => route.params.id as string)
const { reportePorDia, reportePorProducto, cierre,
        cargando, error } = useReporteEvento(eventoId)
const evento = /* from useEvents() */

<!-- Empty state gate -->
If evento.estado !== 'cerrado':
  → "El reporte estará disponible cuando cierres el evento"
If cerrado:
  → Tab "Por día": v-data-table with reportePorDia[]
  → Tab "Por producto": v-simple-table or chart bars
  → Tab "Cierre": CierreResumenCard with cierre snapshot data
```

---

## 5. New Composables Contracts

### 5.1 usePreciosEvento (REQ-FIN-28/29, REQ-PRICING-*)

```ts
// src/composables/usePreciosEvento.ts
export function usePreciosEvento(eventoId: MaybeRefOrGetter<string | null>): {
  // Returns the evento-specific price for a producto.
  // Falls back to producto.precio_venta if no evento_producto exists.
  precioParaProducto: ComputedRef<(productoId: string) => number>
  
  // Returns the configurared margin for a producto in this evento.
  margenParaProducto: ComputedRef<(productoId: string) => number | null>
  
  // Full list of evento_productos for this evento (filtered incluido=true).
  productosDelEvento: ComputedRef<EventoProducto[]>
  
  // Whether the store has loaded data for this evento.
  cargado: ComputedRef<boolean>
}
```

**Reactive dependencies**: `eventoProductosStore.eventoProductos.get(eventoId)`, `productosStore.productos`

**Usage in PosView**: Replaces `producto.precio_venta` → `precioParaProducto(eventoId, productoId)`

### 5.2 useReporteEvento (REQ-REPORTE-1..6, REQ-FIN-21..26)

```ts
// src/composables/useReporteEvento.ts
export function useReporteEvento(
  eventoId: MaybeRefOrGetter<string | null>
): {
  reportePorDia: ComputedRef<ReportePorDia[]>
  reportePorProducto: ComputedRef<ReportePorProducto[]>
  cierre: ComputedRef<CierreCaja | null>
  cargando: ComputedRef<boolean>
  error: ComputedRef<string | null>
}

export interface ReportePorDia {
  fecha: string            // ISO date
  ventas: number           // count of ventas on that day
  cantidad: number         // sum of venta_items.cantidad
  cogs: number             // Σ(cantidad × costo_unitario)
  utilidadBruta: number    // ventas − cogs
  utilidadNeta: number     // utilidadBruta − share of gastosOp
  // gastosOp distributed equally across days with ventas
}

export interface ReportePorProducto {
  productoNombre: string   // denormalized from venta_items join
  unidadesVendidas: number // sum of cantidad
  ingresoTotal: number     // sum of subtotal
  cogsTotal: number        // Σ(cantidad × costo_unitario)
  margenReal: number       // (ingresoTotal − cogsTotal) / ingresoTotal
  utilidadBruta: number    // ingresoTotal − cogsTotal
}
```

**Reactive dependencies**: `ventasStore.ventas`, `cierresCajaStore.cierre`, `gastosFijosStore.gastosPorEvento`

**Data sources**: Reads from `cierres_caja` snapshot (NOT live stores) for the Cierre tab. Por día/Por producto are aggregations of historical `venta_items` from `ventasStore.ventas` (fetched once for the evento, already containing `costo_unitario` snapshots).

**Empty state**: Returns empty arrays / null cierre when `evento.estado !== 'cerrado'`.

---

## 6. New Stores Contracts

### 6.1 eventoProductos.store.ts (REQ-PRICING-7, REQ-FIN-13)

```ts
// src/stores/eventoProductos.store.ts
export const useEventoProductosStore = defineStore('eventoProductos', () => {
  // -- STATE --
  const eventoProductos: Ref<Map<string, EventoProducto[]>>
  const cargando: Ref<boolean>
  const error: Ref<string | null>

  // -- GETTERS (computed) --
  // productosParaEvento(eventoId): EventoProducto[] filtered incluido=true
  
  // -- ACTIONS --
  // cargarParaEvento(eventoId: string): Promise<void>
  //   Fetches all evento_productos for eventId from Supabase
  //   Stores in Map keyed by eventoId
  
  // actualizarMargen(eventoProductoId: string, margen: number):
  //   Promise<{ data: EventoProducto | null; error: ServiceError | null }>
  //   Gated by estadoEsEditable (reads eventsStore)
  //   Recomputes precio_venta via calcularPrecioPorMargen(costo, margen)
  
  // actualizarIncluido(eventoProductoId: string, incluido: boolean):
  //   Promise<{ data: EventoProducto | null; error: ServiceError | null }>
  //   Gated by estadoEsEditable
  
  // inicializarDesdeCatalogo(eventoId: string, margenDefault: number):
  //   Promise<{ data: EventoProducto[] | null; error: ServiceError | null }>
  //   Calls eventoProductosService.inicializarDesdeCatalogo()
  //   Reloads eventoProductos for eventId after success
})
```

---

## 7. New Services Contracts

### 7.1 eventoProductos.service.ts (REQ-PRICING-5)

```ts
// src/services/eventoProductos.service.ts
export interface EventoProductosService {
  listarPorEvento(
    eventoId: string,
  ): Promise<{ data: EventoProducto[] | null; error: ServiceError | null }>

  crear(
    input: CrearEventoProductoInput,
  ): Promise<{ data: EventoProducto | null; error: ServiceError | null }>

  actualizarMargen(
    id: string,
    margen: number,
    precioVenta: number,        // pre-computed by caller
  ): Promise<{ data: EventoProducto | null; error: ServiceError | null }>

  actualizarIncluido(
    id: string,
    incluido: boolean,
  ): Promise<{ data: EventoProducto | null; error: ServiceError | null }>

  inicializarDesdeCatalogo(
    eventoId: string,
    margenDefault: number,
  ): Promise<{ data: EventoProducto[] | null; error: ServiceError | null }>
  // Reads productos table, computes precio_venta for each,
  // UPSERTs into evento_productos (ON CONFLICT evento_id,producto_id DO NOTHING).
  // Returns the inserted/updated rows.

  eliminar(
    id: string,
  ): Promise<{ data: null; error: ServiceError | null }>
}

export function crearEventoProductosService(
  supabase: SupabaseClient<Database>,
): EventoProductosService
```

**Factory pattern**: Matches `crearProductosService`, `crearVentasService`, etc. Receives `supabase` as parameter.

**Never-throw**: Every method returns `{ data, error }`. Supabase errors are returned as `ServiceError`.

---

## 8. New Utils Contracts

### 8.1 pricing.ts (REQ-FIN-14..16, REQ-PRICING-2..4)

```ts
// src/utils/pricing.ts
import { redondearCentavos } from '@/utils/moneda'

/**
 * Compute selling price from cost and desired margin.
 * Formula: precio = costo / (1 − margen)
 * 
 * @param costo  Product cost (≥ 0)
 * @param margen Desired margin 0..1 (e.g., 0.40 = 40%)
 * @returns      Selling price rounded to 2 decimal places
 * 
 * Edge cases:
 *   - margen = 0  → returns costo (price = cost, zero markup)
 *   - costo  = 0  → returns 0
 *   - margen = 1  → would divide by zero — caller must validate (UI limits to 0.90)
 *   - margen = 0.90 → price = costo / 0.10 (10x cost)
 */
export function calcularPrecioPorMargen(costo: number, margen: number): number {
  if (costo === 0) return 0
  if (margen === 0) return redondearCentavos(costo)
  // If margen >= 1, return Infinity — guarded by UI slider max 90%
  if (margen >= 1) return Infinity
  return redondearCentavos(costo / (1 - margen))
}

/**
 * Compute the actual margin achieved from a given price and cost.
 * Formula: margenReal = (precio − costo) / precio
 * 
 * @param precioVenta Actual selling price
 * @param costo       Product cost
 * @returns           Actual margin 0..1
 * 
 * Edge cases:
 *   - costo = 0, precio > 0 → returns 1.0 (100% margin)
 *   - precio = 0             → returns 0 (no sale)
 *   - Bidirectional: calcularMargenReal(calcularPrecioPorMargen(c, m), c) ≈ m
 */
export function calcularMargenReal(precioVenta: number, costo: number): number {
  if (precioVenta === 0) return 0
  if (costo === 0) return 1
  return redondearCentavos((precioVenta - costo) / precioVenta)
}
```

**AC-5 verification inputs**: `(10, 0.40→16.67)`, `(5, 0.25→6.67)`, `(100, 0.50→200.00)`, `(3.33, 0.33→4.97)`, `(0, 0→0)`.

**AC-7 float-drift**: Single `redondearCentavos` at the end of each function. Intermediate arithmetic uses raw float. Test: sum 100 items with `costo_unitario=1.67` → total = 167.00 (not 166.99999).

---

## 9. Modified Files Strategy

### 9.1 `src/utils/cierre.ts` — NEW formula + COGS aggregation

**Before (buggy — line 33):**
```ts
const utilidadBruta = redondearCentavos(totalVentas - totalGastosFijos - totalGastosImprevistos)
```

**After (corrected):**
```ts
// NEW: COGS aggregation from venta_items
const totalCogs = redondearCentavos(
  input.ventaItems.reduce((acc, item) =>
    acc + (item.costo_unitario ?? 0) * item.cantidad, 0)
)
const utilidadBruta = redondearCentavos(totalVentas - totalCogs)
const utilidadNeta = redondearCentavos(utilidadBruta - totalGastosFijos - totalGastosImprevistos)
```

**Changed signatures:**
```ts
// CierreInput gains ventaItems field
export interface CierreInput {
  ventas: Venta[]
  ventaItems: VentaItem[]         // NEW — for COGS aggregation
  gastosFijos: GastoFijo[]
  gastosImprevistos: GastoImprevisto[]
  efectivoEsperado: number | null
  efectivoReal: number | null
}

// CierreResultado gains new fields
export interface CierreResultado {
  // ... existing fields ...
  totalCogs: number               // NEW
  utilidadNeta: number            // NEW
}
```

**Backward compatibility**: `costo_unitario ?? 0` ensures legacy ventas (NULL) contribute 0 to COGS. The `ventaItems` parameter is mandatory — `useCierreCaja` must pass it.

### 9.2 `src/types/pos.types.ts` — Extended types

**VentaItem** gains 3 nullable fields:
```ts
export interface VentaItem {
  // ... existing fields (id, venta_id, producto_id, cantidad, precio_unitario, subtotal, created_at) ...
  costo_unitario: number | null        // NEW (REQ-FIN-12)
  margen_aplicado: number | null       // NEW (REQ-FIN-12)
  evento_producto_id: string | null    // NEW (REQ-FIN-12)
}
```

**CierreCaja** gains 3 NOT NULL fields:
```ts
export interface CierreCaja {
  // ... existing fields ...
  total_cogs: number                   // NEW (REQ-FIN-5)
  total_utilidad_bruta: number         // NEW (REQ-FIN-5)
  total_utilidad_neta: number          // NEW (REQ-FIN-5)
}
```

**CierreInput** gains `ventaItems: VentaItem[]` (for COGS aggregation).

**CierreResultado** gains `totalCogs: number` and `utilidadNeta: number`.

### 9.3 `src/types/events.types.ts` — Multi-day

**Evento** interface:
```ts
// Before:
fecha: string

// After:
fecha_inicio: string        // renamed from fecha
fecha_fin: string             // NEW
```

**EventoInput** mirrors the change. `PlanificarEventoView` + `EventoDetalleView` now show two date pickers.

### 9.4 `src/types/evento_productos.types.ts` — NEW

```ts
export interface EventoProducto {
  id: string
  evento_id: string
  producto_id: string
  precio_venta: number
  margen: number            // 0..1
  incluido: boolean
  created_at: string
  updated_at: string
}

export interface EventoProductoConDetalle extends EventoProducto {
  producto_nombre: string    // joined from productos.receta_id → recetas.nombre
  costo: number              // from receta.costoPorUnidad
}

export type CrearEventoProductoInput = Omit<EventoProducto, 'id' | 'created_at' | 'updated_at'>

export type ActualizarMargenInput = {
  evento_producto_id: string
  margen: number
}
```

### 9.5 `src/services/cierresCaja.service.ts` — Closure-time backfill

`registrar()` method gains a pre-insert hook:

```ts
async registrar(input: CierreCajaInput): Promise<...> {
  // NEW: Backfill COGS on venta_items where null + linked to evento_producto
  // REQ-FIN-9: Only fills when evento_producto_id IS NOT NULL AND costo_unitario IS NULL
  const { error: backfillError } = await supabase.rpc('backfill_cogs_cierre', {
    p_evento_id: input.evento_id
  })
  // backfillError is non-fatal — legacy ventas proceed with COGS=0

  // ... existing insert logic ...
}
```

Alternatively (if RPC is not used): runs a Supabase `update` query before the insert.

### 9.6 `src/composables/useCierreCaja.ts` — New resumen + guard

**Changes:**
1. `resumen` computed: passes `ventaItems` to `calcularCierre()` (was: only `ventas`)
2. `registrarCierre()`: validates `evento.estado === 'en_curso'` before calling store (REQ-FIN-10)
3. Fase 1: `CierreCajaInput` now includes `total_cogs`, `total_utilidad_bruta`, `total_utilidad_neta`

```ts
const resumen = computed<CierreResultado | null>(() => {
  const id = toValue(eventoId)
  if (!id) return null
  const ventas = ventasStore.ventas.filter(v => v.evento_id === id)
  const ventaItems = ventas.flatMap(v => v.items)  // NEW — extract nested items
  const input: CierreInput = {
    ventas: ventas.map(({ items: _, ...rest }) => rest),
    ventaItems,                                    // NEW
    gastosFijos: ...,
    gastosImprevistos: ...,
    efectivoEsperado: ...,
    efectivoReal: ...,
  }
  return calcularCierre(input)
})
```

### 9.7 `src/stores/ventas.store.ts` — Sale-time COGS snapshot

**`registrarVenta` modification**: At sale time, write `costo_unitario`, `margen_aplicado`, `evento_producto_id` on each `venta_item` insert.

```ts
// Inside registrarVenta(), when building items for the service call:
items: snapshot.map((l) => {
  const ep = eventoProductosStore.productosDelEvento.find(
    ep => ep.producto_id === l.producto_id && ep.incluido
  )
  const producto = productosStore.productos.find(p => p.id === l.producto_id)
  return {
    producto_id: l.producto_id,
    cantidad: l.cantidad,
    precio_unitario: l.precio_unitario,
    subtotal: l.subtotal,
    costo_unitario: producto?.costo ?? null,           // NEW
    margen_aplicado: ep?.margen ?? null,                // NEW
    evento_producto_id: ep?.id ?? null,                 // NEW
  }
})
```

**Cross-store READ**: `ventasStore` reads `eventoProductosStore` (for `evento_producto_id` and `margen`) and `productosStore` (for `costo`). This is a READ inside the action — no cross-store WRITE.

### 9.8 `src/views/PosView.vue` — Event productos + cerrado guard

**Changes (Fase 2 — PR-2b):**
1. Product grid sources from `eventoProductosStore` instead of `productosStore` (REQ-FIN-28)
2. Price displayed = `evento_producto.precio_venta` (REQ-FIN-29)
3. Productos filtered `incluido=true` + `evento_id = eventoEnCurso.id` (REQ-FIN-30)
4. `manejarAgregar`: calls `agregarAlCarrito` with `evento_producto.precio_venta`
5. Cerrado guard: if `eventoEnCurso.estado === 'cerrado'`, show "Este evento está cerrado — reporte disponible" and hide grid + cart (REQ-FIN-32)

```ts
// NEW: filtered products for the current evento
const productosDelEvento = computed(() => {
  if (!eventoEnCurso.value) return []
  return eventoProductosStore.productosDelEvento.value
})

// MODIFIED: uses evento price
function manejarAgregar(eventoProductoId: string) {
  const ep = productosDelEvento.value.find(ep => ep.id === eventoProductoId)
  if (!ep) return
  agregarAlCarrito(ep.producto_id, buscarNombre(ep.producto_id), ep.precio_venta)
}
```

### 9.9 `src/views/HomeView.vue` — Post-evento card wiring

**Changes (Fase 2 — PR-2c):**
- Post-evento `v-card` switches from static `disabled` to computed:
  ```vue
  <v-card
    data-testid="home-card-post-evento"
    :disabled="!tieneEventosCerrados"
    :to="tieneEventosCerrados ? `/eventos/${ultimoCerradoId}/reporte` : undefined"
    variant="tonal"
    color="success"
  >
  ```
- `tieneEventosCerrados`: computed from `useResumen().contadores.eventosCerrados > 0`
- `ultimoCerradoId`: reads from `eventsStore.eventos.filter(e => e.estado === 'cerrado').sort((a,b) => b.fecha_fin.localeCompare(a.fecha_fin))[0]?.id`

### 9.10 `src/views/EventoDetalleView.vue` — Multi-day + new sections

**Changes (Fase 1):**
- Replace `fecha` with `fecha_inicio` + `fecha_fin` pickers
- `formatearFecha()` → `formatearFechaRango(fecha_inicio, fecha_fin)` showing "15 jul – 22 jul 2026" or "15 jul 2026" (single-day)

**Changes (Fase 2):**
- "PRODUCTOS DEL EVENTO" section — shows count + link to `/eventos/:id/productos` when `estadoEsEditable` (REQ-FIN-20)
- "REPORTE" section — shows link to `/eventos/:id/reporte` only when `estado === 'cerrado'` (REQ-FIN-27)

---

## 10. Route Design

```ts
// src/router/routes.ts — NEW routes added (Fase 2)

{
  path: '/eventos/:id/productos',
  name: 'evento-productos',
  component: () => import('@/views/EventoProductosView.vue'),
  meta: { breadcrumb: ['Inicio', 'eventos', 'Productos'] },
},
{
  path: '/eventos/:id/reporte',
  name: 'evento-reporte',
  component: () => import('@/views/ReporteEventoView.vue'),
  meta: { breadcrumb: ['Inicio', 'eventos', 'Reporte'] },
},
```

**Navigation flow:**
```
/eventos/:id  →  "PRODUCTOS DEL EVENTO"  →  /eventos/:id/productos
               →  "REPORTE" (cerrado only) →  /eventos/:id/reporte
/home          →  post-evento card          →  /eventos/:id/reporte
/pos           →  "Ver reporte" (cerrado)   →  /eventos/:id/reporte
```

---

## 11. Data Flow

### 11.1 Pre-evento Pricing Setup (Fase 2)

```
EventoDetalleView
  → clicks "PRODUCTOS DEL EVENTO"
  → router.push('/eventos/:id/productos')
  → EventoProductosView mounts
     → eventoProductosStore.cargarParaEvento(eventoId)
        → eventoProductosService.listarPorEvento(eventoId)
           → supabase.from('evento_productos').select('*').eq('evento_id', id)
     → User clicks "SELECCIONAR TODOS CON MARGEN 40%"
        → eventoProductosStore.inicializarDesdeCatalogo(eventoId, 0.40)
           → eventoProductosService.inicializarDesdeCatalogo(eventoId, 0.40)
              → supabase.from('productos').select('*')
              → for each producto: calcularPrecioPorMargen(costo, 0.40)
              → supabase.from('evento_productos').upsert([...], { onConflict: 'evento_id,producto_id' })
     → User adjusts margen on a row via MargenSlider
        → emits update:modelValue (0..1)
        → eventoProductosStore.actualizarMargen(id, newMargen)
           → recomputes precio_venta = calcularPrecioPorMargen(costo, newMargen)
           → eventoProductosService.actualizarMargen(id, newMargen, newPrecio)
              → supabase.from('evento_productos').update({ margen, precio_venta }).eq('id', id)
```

### 11.2 Durante-evento POS with Event Prices (Fase 2)

```
PosView mounts
  → useEvents().cargarTodas()
  → eventoProductosStore.cargarParaEvento(eventoEnCurso.id)
     → stores evento_productos in Map
  → usePreciosEvento(eventoEnCurso.id)
     → productosDelEvento = computed from store filtered incluido=true

User clicks product card
  → manejarAgregar(eventoProductoId)
     → finds EventoProducto (has precio_venta, producto_id)
     → agregarAlCarrito(producto_id, nombre, evento_producto.precio_venta)
        → cart updated with evento-specific price

User clicks "Registrar venta"
  → registrarVenta(metodoPago)
     → snapshots cart (with evento prices)
     → builds venta_items with:
        precio_unitario = cart snapshot (evento price)
        costo_unitario = producto.costo (from productosStore)
        margen_aplicado = evento_producto.margen
        evento_producto_id = evento_producto.id
     → ventasService.registrarVenta(input)
        → inserts venta header
        → inserts venta_items with COGS snapshot columns
```

### 11.3 Post-evento Cierre + Report (Fase 1 + Fase 2)

```
CierresCajaView / POS cierre action
  → useCierreCaja(eventoId).registrarCierre(input)
     → validates evento.estado === 'en_curso' (REQ-FIN-10)
     → cierresCajaStore.registrarCierre(input)
        → cierresCajaService.registrar(input)
           → backfills costo_unitario on venta_items where null + evento_producto_id set
           → inserts cierres_caja row with total_cogs, total_utilidad_bruta, total_utilidad_neta
        → eventsService.cambiarEstado(eventoId, 'cerrado')

ReporteEventoView
  → useReporteEvento(eventoId)
     → reads cierres_caja snapshot for Cierre tab
     → reads venta_items (from ventasStore — already loaded) for Por día / Por producto
     → aggregates by: GROUP date(venta.fecha) → ReportePorDia[]
     → aggregates by: GROUP producto_id → ReportePorProducto[]
     → arithmetic consistency: Σ(porDia.utilidadBruta) = cierre.total_utilidad_bruta
```

---

## 12. Fase 1 vs Fase 2 Delivery Map

### Fase 1 — Multi-day + Cierre Corregido (1 PR, ≤ 400 lines)

| File | Action | REQ-IDs | Dependency |
|------|--------|---------|------------|
| `supabase/migrations/20260620000000_finanzas_evento.sql` | CREATE (partial) | REQ-FIN-1, 5 | None |
| `src/types/events.types.ts` | MODIFY (fecha → fecha_inicio + fecha_fin) | REQ-FIN-1..4 | Migration |
| `src/types/pos.types.ts` | MODIFY (CierreCaja + CierreInput + CierreResultado) | REQ-FIN-5..8, 11 | Migration |
| `src/utils/cierre.ts` | MODIFY (new formula + COGS + utilidadNeta) | REQ-FIN-6..8 | Types |
| `src/services/cierresCaja.service.ts` | MODIFY (closure-time backfill) | REQ-FIN-9 | Migration + Types |
| `src/composables/useCierreCaja.ts` | MODIFY (guard + resumen + ventaItems) | REQ-FIN-10 | Service + Utils |
| `src/components/business/CierreResumenCard.vue` | MODIFY (utilidadBruta + utilidadNeta) | REQ-FIN-11 | Types |
| `src/views/EventoDetalleView.vue` | MODIFY (fecha → date range) | REQ-FIN-2 | Types |
| `src/views/PlanificarEventoView.vue` | MODIFY (fecha → date range) | REQ-FIN-3 | Types |

**Fase 1 boundary**: No `evento_productos` table created. No new composables or views. `venta_items` new columns NOT yet created (migration only adds `cierres_caja` columns). The cierre formula uses `costo_unitario ?? 0` (always 0 until Fase 2 creates the column).

### Fase 2 — Pricing + Reports + UI (3 chained PRs)

#### PR-2a — Pricing Model + Product Picker

| File | Action | REQ-IDs |
|------|--------|---------|
| `supabase/migrations/20260620000000_finanzas_evento.sql` | EXTEND (evento_productos table + venta_items columns) | REQ-FIN-12, 13 |
| `src/types/evento_productos.types.ts` | CREATE | REQ-FIN-13 |
| `src/types/index.ts` | MODIFY (re-export) | — |
| `src/utils/pricing.ts` | CREATE | REQ-FIN-14..16 |
| `src/services/eventoProductos.service.ts` | CREATE | REQ-FIN-17 |
| `src/stores/eventoProductos.store.ts` | CREATE | REQ-FIN-18 |
| `src/composables/usePreciosEvento.ts` | CREATE | — |
| `src/components/business/MargenSlider.vue` | CREATE | REQ-FIN-19 |
| `src/views/EventoProductosView.vue` | CREATE | REQ-FIN-18 |
| `src/views/EventoDetalleView.vue` | MODIFY (PRODUCTOS section) | REQ-FIN-20 |
| `src/router/routes.ts` | MODIFY (/eventos/:id/productos) | — |

#### PR-2b — POS Integration

| File | Action | REQ-IDs |
|------|--------|---------|
| `src/stores/ventas.store.ts` | MODIFY (COGS snapshot at sale) | REQ-FIN-31 |
| `src/services/ventas.service.ts` | MODIFY (VentaItemInput extended) | REQ-FIN-31 |
| `src/views/PosView.vue` | MODIFY (eventoProductos source + cerrado guard) | REQ-FIN-28..30, 32 |

#### PR-2c — Reports + Home

| File | Action | REQ-IDs |
|------|--------|---------|
| `src/composables/useReporteEvento.ts` | CREATE | REQ-FIN-21..22, 26 |
| `src/views/ReporteEventoView.vue` | CREATE | REQ-FIN-23..25 |
| `src/views/EventoDetalleView.vue` | MODIFY (REPORTE section) | REQ-FIN-27 |
| `src/components/business/CierreResumenCard.vue` | MODIFY ("Ver reporte" link) | REQ-FIN-11 (extended) |
| `src/views/HomeView.vue` | MODIFY (post-evento card) | REQ-FIN-33..34 |
| `src/router/routes.ts` | MODIFY (/eventos/:id/reporte) | — |
| `docs/flujo-financiero.md` | CREATE | SM-8 |

---

## 13. TDD Strategy

### Testing Order (per phase, strictly TDD)

| Order | Phase | Test File | REQ-IDs Covered | Mocks Needed |
|-------|-------|-----------|-----------------|-------------|
| T1 | F1 | `src/utils/cierre.spec.ts` (modify) | REQ-FIN-6..8 | None (pure utils) |
| T2 | F1 | `src/types/pos.types.spec.ts` (modify — structural) | REQ-FIN-5, 11 | None |
| T3 | F1 | `src/composables/useCierreCaja.spec.ts` (modify) | REQ-FIN-10 | Supabase mock, Pinia stores |
| T4 | F1 | `src/components/business/CierreResumenCard.spec.ts` (modify) | REQ-FIN-11 | Vuetify mount |
| T5 | F1 | `src/views/EventoDetalleView.spec.ts` (modify) | REQ-FIN-2 | Supabase mock, Vue Router mock |
| T6 | F1 | `src/views/PlanificarEventoView.spec.ts` (modify) | REQ-FIN-3 | Supabase mock |
| T7 | F2a | `src/utils/pricing.spec.ts` | REQ-FIN-14..16 | None |
| T8 | F2a | `src/services/eventoProductos.service.spec.ts` | REQ-FIN-17 | Supabase mock |
| T9 | F2a | `src/stores/eventoProductos.store.spec.ts` | REQ-FIN-18 | Supabase mock, Pinia |
| T10 | F2a | `src/composables/usePreciosEvento.spec.ts` (new) | REQ-FIN-14 | Pinia stores mock |
| T11 | F2a | `src/components/business/MargenSlider.spec.ts` | REQ-FIN-19 | Vuetify mount |
| T12 | F2a | `src/views/EventoProductosView.spec.ts` | REQ-FIN-18 | Supabase mock, Vue Router |
| T13 | F2b | `src/stores/ventas.store.spec.ts` (modify) | REQ-FIN-31 | Supabase mock, Pinia stores |
| T14 | F2b | `src/views/PosView.spec.ts` (modify) | REQ-FIN-28..30, 32 | Supabase mock, Vuetify mount |
| T15 | F2c | `src/composables/useReporteEvento.spec.ts` | REQ-FIN-21..22, 26 | Pinia stores mock |
| T16 | F2c | `src/views/ReporteEventoView.spec.ts` | REQ-FIN-23..25 | Supabase mock, Vuetify mount |
| T17 | F2c | `src/views/HomeView.spec.ts` (modify) | REQ-FIN-33..34 | Supabase mock, Vuetify mount |

**Mock strategy**:
- **Supabase mock**: Reuse `tests/setup.ts` chainable mock (`__pushSupabaseResponse`, `__getSupabaseMockCalls`, `__resetSupabaseMock`) — NO changes to `tests/setup.ts`.
- **Pinia stores**: Create with `setActivePinia(createPinia())` in `beforeEach`. Mock service layer for store tests; mock stores for composable/view tests.
- **Vue Router**: Use `createRouter(createWebHistory(), routes)` for view tests.
- **Vuetify**: Wrap mount with Vuetify plugin.

**Integration boundaries**: Component tests exercise the full component → composable → store → mock-service chain. No separate integration layer needed (project convention: unit + component, no formal integration layer).

---

## 14. Migration Strategy

### 14.1 Migration File

**File**: `supabase/migrations/20260620000000_finanzas_evento.sql`

**Fase 1 DDL:**
```sql
-- 1. Rename eventos.fecha → fecha_inicio
ALTER TABLE eventos RENAME COLUMN fecha TO fecha_inicio;

-- 2. Add fecha_fin (default = fecha_inicio for existing rows)
ALTER TABLE eventos ADD COLUMN fecha_fin DATE;
UPDATE eventos SET fecha_fin = fecha_inicio WHERE fecha_fin IS NULL;
ALTER TABLE eventos ALTER COLUMN fecha_fin SET NOT NULL;

-- 3. Add CHECK constraint
ALTER TABLE eventos ADD CONSTRAINT chk_fecha_fin CHECK (fecha_fin >= fecha_inicio);

-- 4. Add cierres_caja columns
ALTER TABLE cierres_caja ADD COLUMN total_cogs NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE cierres_caja ADD COLUMN total_utilidad_bruta NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE cierres_caja ADD COLUMN total_utilidad_neta NUMERIC NOT NULL DEFAULT 0;

-- 5. Update existing cierres_caja rows with correct formula
UPDATE cierres_caja SET
  total_utilidad_bruta = total_ventas - 0,  -- legacy: COGS was 0 (no data)
  total_utilidad_neta = total_ventas - total_gastos_fijos - total_gastos_imprevistos;
```

**Fase 2 DDL:**
```sql
-- 6. Create evento_productos table
CREATE TABLE IF NOT EXISTS evento_productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  precio_venta NUMERIC NOT NULL CHECK (precio_venta > 0),
  margen NUMERIC NOT NULL CHECK (margen >= 0 AND margen <= 1),
  incluido BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (evento_id, producto_id)
);

-- 7. Add venta_items columns (nullable — legacy rows stay NULL)
ALTER TABLE venta_items ADD COLUMN costo_unitario NUMERIC;
ALTER TABLE venta_items ADD COLUMN margen_aplicado NUMERIC;
ALTER TABLE venta_items ADD COLUMN evento_producto_id UUID REFERENCES evento_productos(id);

-- 8. RLS + triggers + dev_bypass_rls grants
```

### 14.2 How to Run

```bash
# Local Supabase (Docker):
supabase db reset          # full reset — applies all migrations in order
# OR
supabase migration up      # applies only unapplied migrations

# Verify:
supabase db test           # optional — if pgTAP tests exist
```

### 14.3 What Happens to Existing Data

| Table | Existing rows | After migration |
|-------|--------------|-----------------|
| `eventos` | `fecha` column exists | Renamed to `fecha_inicio`; `fecha_fin` = same value (single-day) |
| `cierres_caja` | `total_cogs`, `total_utilidad_bruta`, `total_utilidad_neta` absent | Added with DEFAULT 0; legacy rows get `total_utilidad_bruta = total_ventas` (COGS=0, no cost data backfill per PD-4) |
| `venta_items` | `costo_unitario`, `margen_aplicado`, `evento_producto_id` absent | Added as NULL (no backfill — PD-4). Legacy items contribute 0 to COGS. |
| `evento_productos` | Table doesn't exist | Created empty. No auto-population. |

**Rollback (Fase 1)**: 
```sql
ALTER TABLE eventos DROP CONSTRAINT chk_fecha_fin;
ALTER TABLE eventos DROP COLUMN fecha_fin;
ALTER TABLE eventos RENAME COLUMN fecha_inicio TO fecha;
ALTER TABLE cierres_caja DROP COLUMN total_utilidad_neta;
ALTER TABLE cierres_caja DROP COLUMN total_utilidad_bruta;
ALTER TABLE cierres_caja DROP COLUMN total_cogs;
```

**Rollback (Fase 2)**:
```sql
ALTER TABLE venta_items DROP COLUMN evento_producto_id;
ALTER TABLE venta_items DROP COLUMN margen_aplicado;
ALTER TABLE venta_items DROP COLUMN costo_unitario;
DROP TABLE IF EXISTS evento_productos;
```

---

## Design Summary

| Metric | Value |
|--------|-------|
| **Total REQ-FIN-IDs** | 34 (F1: 1–12, F2: 13–34) |
| **New files** | 12 (pricing.ts, evento_productos.types.ts, eventoProductos.service.ts, eventoProductos.store.ts, usePreciosEvento.ts, useReporteEvento.ts, MargenSlider.vue, EventoProductosView.vue, ReporteEventoView.vue, migration.sql, event_detalle sections) |
| **Modified files** | 10 (cierre.ts, pos.types.ts, events.types.ts, cierresCaja.service.ts, ventas.service.ts, useCierreCaja.ts, ventas.store.ts, PosView.vue, HomeView.vue, EventoDetalleView.vue, PlanificarEventoView.vue, CierreResumenCard.vue, routes.ts, useProyeccionCostos.ts) |
| **New components** | 2 (MargenSlider, partial: ReporteEventoView, EventoProductosView sections) |
| **New composables** | 2 (usePreciosEvento, useReporteEvento) |
| **New stores** | 1 (eventoProductos) |
| **New services** | 1 (eventoProductos) |
| **New utils** | 1 (pricing.ts — 2 functions) |
| **Routes** | 2 new (/eventos/:id/productos, /eventos/:id/reporte) |
| **Phases** | 2 (F1: 1 PR, F2: 3 chained PRs) |
| **Est. test count** | ~85 new + modified tests |

# Spec: `finanzas-evento` — Unified Change Specification

> **Change**: `finanzas-evento` | **34 REQ-IDs** | **2 phases** | **Source**: `proposal.md` §5, §11, §12

## Purpose

Fix broken `utilidadBruta` formula (COGS ignored), introduce per-evento configurable-margin pricing (`precio = costo/(1−margen)`), add post-evento reports (Por día/Por producto/Cierre), and wire the home post-evento card. Two new capabilities (`pricing-evento`, `reporte-evento`), three modified (`events`, `pos`, `home`).

## Fase 1 — Multi-Day + Cierre Corregido (REQ-FIN-1..12)

| REQ-ID | Requirement (SHALL) | Domain | AC |
|--------|---------------------|--------|----|
| REQ-FIN-1 | `eventos.fecha` → `fecha_inicio` + `fecha_fin` with CHECK `fecha_fin ≥ fecha_inicio`. | events | AC-1 |
| REQ-FIN-2 | `EventoDetalleView` shows two required date pickers for `fecha_inicio`/`fecha_fin`. | events | AC-14 |
| REQ-FIN-3 | `PlanificarEventoView` accepts date range; validation rejects `fecha_fin < fecha_inicio`. | events | AC-15 |
| REQ-FIN-4 | All views display date range `fecha_inicio − fecha_fin`, not single date. | events | AC-16 |
| REQ-FIN-5 | `cierres_caja` gains `total_cogs`, `total_utilidad_bruta`, `total_utilidad_neta` (NOT NULL). | pos | AC-4 |
| REQ-FIN-6 | `utilidadBruta = totalVentas − COGS` (NOT `ventas − gastos`). | pos | AC-9 |
| REQ-FIN-7 | `utilidadNeta = utilidadBruta − (gastosFijos + gastosImprevistos)`. | pos | AC-10 |
| REQ-FIN-8 | `venta_item.costo_unitario = NULL` → COGS contribution = 0. Legacy-safe. | pos | AC-11 |
| REQ-FIN-9 | At cierre, backfill NULL `costo_unitario`/`margen_aplicado` from linked `evento_producto`. One-shot. | pos | AC-12 |
| REQ-FIN-10 | `cerrar(eventoId)` rejects with `TRANSICION_INVALIDA` if `estado !== 'en_curso'`. | pos | AC-13 |
| REQ-FIN-11 | `CierreResumenCard` shows `utilidadBruta` (green/red) + `utilidadNeta` subtotal. | pos | — |
| REQ-FIN-12 | `venta_items` gains `costo_unitario`, `margen_aplicado` (nullable), `evento_producto_id` (FK nullable). | pos | AC-3 |

## Fase 2 — Pricing + Reports + UI (REQ-FIN-13..34)

| REQ-ID | Requirement (SHALL) | Domain | AC |
|--------|---------------------|--------|----|
| REQ-FIN-13 | `evento_productos` table: UNIQUE `(evento_id, producto_id)`, CASCADE on evento, RESTRICT on producto. | pricing | AC-2 |
| REQ-FIN-14 | `calcularPrecioPorMargen(costo, margen)` = `redondearCentavos(costo/(1−margen))`. 5 inputs verified. | pricing | AC-5 |
| REQ-FIN-15 | `calcularMargenReal(precio, costo)` = `(precio−costo)/precio`. Bidirectional with REQ-FIN-14. | pricing | AC-6 |
| REQ-FIN-16 | `redondearCentavos` ONLY at final result. Float-drift test with 100 items. | pricing | AC-7 |
| REQ-FIN-17 | `inicializarDesdeCatalogo(eventoId, margenDefault)` bulk-creates evento_productos. Idempotent (upsert). | pricing | AC-8 |
| REQ-FIN-18 | `EventoProductosView` table: producto, costo, margen slider, computed precio, incluido checkbox. Bulk action. | pricing | — |
| REQ-FIN-19 | `MargenSlider` 0–90% with live price preview using `calcularPrecioPorMargen`. | pricing | — |
| REQ-FIN-20 | `EventoDetalleView` "PRODUCTOS DEL EVENTO" section → `/eventos/:id/productos`. Gated by `estadoEsEditable`. | events | — |
| REQ-FIN-21 | `reportePorDia[]`: `{fecha, ventas, cantidad, cogs, utilidadBruta, utilidadNeta}`. Ordered `fecha ASC`. | reporte | AC-22 |
| REQ-FIN-22 | `reportePorProducto[]`: `{productoNombre, unidades, ingresoTotal, cogsTotal, margenReal, utilidadBruta}`. | reporte | AC-23 |
| REQ-FIN-23 | `ReporteEventoView` 3 tabs: "Por día", "Por producto", "Cierre" (reuses `CierreResumenCard`). | reporte | AC-24 |
| REQ-FIN-24 | Report data from `cierres_caja` snapshot + historical `venta_items`, NOT live stores. | reporte | AC-25 |
| REQ-FIN-25 | Non-cerrado evento → empty state: "El reporte estará disponible cuando cierres el evento". | reporte | AC-26 |
| REQ-FIN-26 | `Σ(porDia.utilidadBruta) = Σ(porProducto.utilidadBruta) = cierre.total_utilidad_bruta` (±0.01). Property test. | reporte | — |
| REQ-FIN-27 | `EventoDetalleView` "REPORTE" section → `/eventos/:id/reporte` ONLY when `estado === 'cerrado'`. | events | — |
| REQ-FIN-28 | `PosView` sources products from `eventoProductos.store` filtered `incluido=true`. | pos | AC-17 |
| REQ-FIN-29 | Product card price = `evento_producto.precio_venta`, NOT `producto.precio_venta`. | pos | AC-18 |
| REQ-FIN-30 | Product without `evento_producto.incluido=true` SHALL NOT appear in POS grid. | pos | AC-19 |
| REQ-FIN-31 | Sale-time snapshot: `venta_item` writes `costo_unitario`, `margen_aplicado`, `evento_producto_id`. | pos | AC-20 |
| REQ-FIN-32 | POS: "Este evento está cerrado — reporte disponible" when `eventoEnCurso.estado === 'cerrado'`. | pos | AC-21 |
| REQ-FIN-33 | Post-evento card ENABLED when ≥1 cerrado evento exists. Links to latest `fecha_fin DESC`. | home | AC-27 |
| REQ-FIN-34 | Post-evento card stays `disabled` when zero cerrado eventos. | home | AC-28 |

**Quality gates** (AC-29..32): `pnpm test`/`build`/`lint`/`typecheck` pass. Not spec requirements.

## Product Decisions (Locked — from §11)

| PD | Decision | REQ-FIN |
|----|----------|---------|
| PD-1 | Margen configurable per evento (default 0.40) | 13, 14 |
| PD-2 | POS only shows explicitly included productos with computable costo | 28, 30 |
| PD-3 | Cierre immediate — report available instantly | 24, 27 |
| PD-4 | No historical backfill beyond closure-time snapshot | 8, 9 |
| PD-5 | Both phases needed | F1+F2 |
| PD-6 | 1 SDD cycle, 2 apply phases, 4 PRs | — |

## Files

| File | Type | REQ-IDs |
|------|------|---------|
| `openspec/specs/pricing-evento/spec.md` | New full | REQ-PRICING-1..8 |
| `openspec/specs/reporte-evento/spec.md` | New full | REQ-REPORTE-1..6 |
| `openspec/changes/finanzas-evento/specs/events.md` | Delta | MODIFIED 4, ADDED 2 |
| `openspec/changes/finanzas-evento/specs/pos.md` | Delta | MODIFIED 2, ADDED 5 |
| `openspec/changes/finanzas-evento/specs/home.md` | Delta | ADDED 2 |

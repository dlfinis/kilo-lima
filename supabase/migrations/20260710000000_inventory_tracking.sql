-- inventory_tracking.sql
-- mobile-ux-redesign Phase 4: stock tracking migration.
-- Idempotent — adds cantidad_disponible column to materias_primas
-- and creates v_inventory_production view for stock→production calculation.
-- Run from Supabase Dashboard SQL Editor or via Supabase CLI.

-- 1. Add cantidad_disponible column (idempotent)
ALTER TABLE public.materias_primas
  ADD COLUMN IF NOT EXISTS cantidad_disponible numeric(10,2) NOT NULL DEFAULT 0;

-- 2. Production capacity view: joins materias_primas + receta_ingredientes + recetas.
-- For each recipe, calculates the minimum producible units based on
-- available stock of every ingredient (floor division).
CREATE OR REPLACE VIEW public.v_inventory_production AS
SELECT
  r.id AS receta_id,
  r.nombre AS receta_nombre,
  ri.materia_prima_id,
  mp.nombre AS materia_prima_nombre,
  mp.unidad AS materia_prima_unidad,
  mp.cantidad_disponible AS stock_disponible,
  ri.cantidad AS cantidad_necesaria,
  -- Units producible from this single ingredient
  CASE
    WHEN ri.cantidad > 0 AND mp.cantidad_disponible >= 0
    THEN FLOOR(mp.cantidad_disponible / ri.cantidad)
    ELSE 0
  END AS unidades_desde_ingrediente,
  r.rendimiento_unidades
FROM public.receta_ingredientes ri
JOIN public.recetas r ON r.id = ri.receta_id
JOIN public.materias_primas mp ON mp.id = ri.materia_prima_id;

-- 3. RLS policy for the view (authenticated users can read)
ALTER VIEW public.v_inventory_production OWNER TO authenticated;

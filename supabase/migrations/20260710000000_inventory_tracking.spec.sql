-- inventory_tracking.spec.sql
-- Companion spec: documents expected schema after running the migration.
-- Run assertions manually after applying 20260710000000_inventory_tracking.sql.

-- EXPECTED: materias_primas now has cantidad_disponible column
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'materias_primas' AND column_name = 'cantidad_disponible';
-- Expected row: cantidad_disponible | numeric | NO | 0

-- EXPECTED: v_inventory_production view exists and is queryable
-- SELECT * FROM v_inventory_production LIMIT 1;
-- Should return rows with: receta_id, receta_nombre, materia_prima_id,
-- materia_prima_nombre, materia_prima_unidad, stock_disponible,
-- cantidad_necesaria, unidades_desde_ingrediente, rendimiento_unidades

-- EXPECTED: existing queries on materias_primas still work
-- (backward compatible — the column has a DEFAULT, so INSERT without
-- cantidad_disponible still succeeds)
-- INSERT INTO materias_primas (nombre, unidad, costo_por_unidad)
--   VALUES ('test_migration', 'kg', 1.00);
-- DELETE FROM materias_primas WHERE nombre = 'test_migration';
-- Should succeed without errors

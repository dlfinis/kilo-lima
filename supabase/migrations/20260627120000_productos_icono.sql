-- productos-icono: icono MDI representativo del producto para el POS.
-- Nullable para backward compatibility (productos legacy sin icono).
-- DEFAULT 'mdi-food' para nuevos productos.
ALTER TABLE productos ADD COLUMN IF NOT EXISTS icono text DEFAULT 'mdi-food';

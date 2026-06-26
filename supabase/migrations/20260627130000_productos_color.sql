-- productos-color: color de la card en POS y catalogo.
-- Almacenado como nombre de color de Vuetify (primary, secondary, etc.)
-- o valor hex custom. Default 'primary'.
ALTER TABLE productos ADD COLUMN IF NOT EXISTS color text DEFAULT 'primary';

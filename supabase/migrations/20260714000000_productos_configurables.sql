-- Productos configurables: productos base con grupos de opciones incluidas gratis
-- y capacidad de agregar adicionales (configurados o no) con costo extra

-- Tabla principal: productos_configurables
CREATE TABLE IF NOT EXISTS productos_configurables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  costo_base_calculado DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(producto_id)
);

-- Grupos de opciones: categorías de personalizaciones (salsas, toppings, etc.)
CREATE TABLE IF NOT EXISTS grupos_opciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_configurable_id UUID NOT NULL REFERENCES productos_configurables(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  tipo_calculo VARCHAR(50) NOT NULL DEFAULT 'promedio_categoria',
  incluidas_gratis INTEGER NOT NULL DEFAULT 1,
  precio_venta_extra DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Opciones de cada grupo: materias primas que pueden elegirse
CREATE TABLE IF NOT EXISTS opciones_grupo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id UUID NOT NULL REFERENCES grupos_opciones(id) ON DELETE CASCADE,
  materia_prima_id UUID NOT NULL REFERENCES materias_primas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(grupo_id, materia_prima_id)
);

-- Materias primas disponibles como adicionales (vendibles por separado)
CREATE TABLE IF NOT EXISTS adicionales_disponibles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  materia_prima_id UUID NOT NULL REFERENCES materias_primas(id) ON DELETE CASCADE,
  precio_venta DECIMAL(10,2) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(materia_prima_id)
);

-- Personalizaciones de cada venta item: qué opciones se eligieron
CREATE TABLE IF NOT EXISTS venta_item_personalizaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_item_id UUID NOT NULL REFERENCES venta_items(id) ON DELETE CASCADE,
  grupo_id UUID REFERENCES grupos_opciones(id) ON DELETE SET NULL,
  materia_prima_id UUID NOT NULL REFERENCES materias_primas(id) ON DELETE CASCADE,
  es_incluido BOOLEAN NOT NULL DEFAULT false,
  costo_unitario DECIMAL(10,2) NOT NULL DEFAULT 0,
  precio_venta_extra DECIMAL(10,2) NOT NULL DEFAULT 0,
  cantidad INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_productos_configurables_producto ON productos_configurables(producto_id);
CREATE INDEX IF NOT EXISTS idx_grupos_opciones_configurable ON grupos_opciones(producto_configurable_id);
CREATE INDEX IF NOT EXISTS idx_opciones_grupo ON opciones_grupo(grupo_id);
CREATE INDEX IF NOT EXISTS idx_adicionales_disponibles_activo ON adicionales_disponibles(activo);
CREATE INDEX IF NOT EXISTS idx_venta_item_personalizaciones_item ON venta_item_personalizaciones(venta_item_id);

-- Función para calcular costo base automáticamente
CREATE OR REPLACE FUNCTION calcular_costo_base_configurable(p_producto_configurable_id UUID)
RETURNS DECIMAL(10,2) AS $$
DECLARE
  v_costo_base DECIMAL(10,2) := 0;
  v_costo_materiales DECIMAL(10,2) := 0;
  v_costo_promedios DECIMAL(10,2) := 0;
  v_grupo RECORD;
  v_promedio DECIMAL(10,2);
BEGIN
  -- 1. Calcular costo de materiales fijos (ingredientes de la receta base)
  SELECT COALESCE(SUM(mp.costo_por_unidad * ir.cantidad), 0)
  INTO v_costo_materiales
  FROM ingredientes_receta ir
  JOIN materias_primas mp ON mp.id = ir.materia_prima_id
  JOIN recetas r ON r.id = ir.receta_id
  JOIN productos p ON p.receta_id = r.id
  JOIN productos_configurables pc ON pc.producto_id = p.id
  WHERE pc.id = p_producto_configurable_id;
  
  -- 2. Calcular promedio de cada grupo incluido
  FOR v_grupo IN 
    SELECT g.* FROM grupos_opciones g
    WHERE g.producto_configurable_id = p_producto_configurable_id
  LOOP
    SELECT COALESCE(AVG(mp.costo_por_unidad), 0)
    INTO v_promedio
    FROM opciones_grupo og
    JOIN materias_primas mp ON mp.id = og.materia_prima_id
    WHERE og.grupo_id = v_grupo.id;
    
    -- Multiplicar por la cantidad incluida gratis
    v_costo_promedios := v_costo_promedios + (v_promedio * v_grupo.incluidas_gratis);
  END LOOP;
  
  v_costo_base := v_costo_materiales + v_costo_promedios;
  
  -- Actualizar el costo base calculado
  UPDATE productos_configurables
  SET costo_base_calculado = v_costo_base,
      updated_at = NOW()
  WHERE id = p_producto_configurable_id;
  
  RETURN v_costo_base;
END;
$$ LANGUAGE plpgsql;

-- Función para recalcular todos los costos base cuando cambia una materia prima
CREATE OR REPLACE FUNCTION recalcular_costos_configurables()
RETURNS void AS $$
DECLARE
  v_configurable RECORD;
BEGIN
  FOR v_configurable IN SELECT id FROM productos_configurables
  LOOP
    PERFORM calcular_costo_base_configurable(v_configurable.id);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Trigger para recalcular costos cuando cambia costo de materia prima
CREATE OR REPLACE FUNCTION trigger_recalcular_costos_mp()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.costo_por_unidad IS DISTINCT FROM NEW.costo_por_unidad THEN
    PERFORM recalcular_costos_configurables();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_materias_primas_update_costo ON materias_primas;
CREATE TRIGGER trigger_materias_primas_update_costo
AFTER UPDATE ON materias_primas
FOR EACH ROW
EXECUTE FUNCTION trigger_recalcular_costos_mp();

-- Trigger para recalcular cuando cambia opciones de un grupo
CREATE OR REPLACE FUNCTION trigger_recalcular_grupo()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM calcular_costo_base_configurable(
    (SELECT producto_configurable_id FROM grupos_opciones WHERE id = NEW.grupo_id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_opciones_grupo_change ON opciones_grupo;
CREATE TRIGGER trigger_opciones_grupo_change
AFTER INSERT OR UPDATE OR DELETE ON opciones_grupo
FOR EACH ROW
EXECUTE FUNCTION trigger_recalcalar_grupo();

-- Actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_productos_configurables_updated_at ON productos_configurables;
CREATE TRIGGER trigger_productos_configurables_updated_at
BEFORE UPDATE ON productos_configurables
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_grupos_opciones_updated_at ON grupos_opciones;
CREATE TRIGGER trigger_grupos_opciones_updated_at
BEFORE UPDATE ON grupos_opciones
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_adicionales_disponibles_updated_at ON adicionales_disponibles;
CREATE TRIGGER trigger_adicionales_disponibles_updated_at
BEFORE UPDATE ON adicionales_disponibles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

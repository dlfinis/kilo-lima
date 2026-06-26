-- Limpiar todas las tablas en orden correcto (respetando FKs)
TRUNCATE TABLE 
  public.cierres_caja,
  public.gastos_imprevistos,
  public.venta_items,
  public.ventas,
  public.gastos_fijos,
  public.plan_produccion,
  public.evento_productos,
  public.productos,
  public.eventos,
  public.receta_ingredientes,
  public.recetas,
  public.materias_primas
CASCADE;
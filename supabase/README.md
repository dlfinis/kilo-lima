# Datos de desarrollo

El proyecto trae dos piezas pensadas para que la app siempre tenga algo
útil que mostrar, y para que puedas volver a ese estado limpio cuando
ensucies la base.

## `supabase/seed.sql`

Deja un dataset completo que cubre cada pantalla:

| Pantalla | Lo que vas a ver |
|----------|------------------|
| Home | 1 evento **en curso** ("Festival Primavera 2026") + 1 **cerrado** ("Mercado Navideño 2025") para que los contadores tengan datos vivos. |
| Materias primas | 6 filas (5 ingredientes + 1 empaque) con costos en USD. |
| Recetas | 2 recetas (Galleta de chocolate, Pan básico). El pan incluye la caja de empaque, así el costo unitario refleja el costo real. |
| Productos | 1 por receta con margen, icono y color. |
| Eventos | 3 eventos, uno por estado. Fechas en pasado y futuro. |
| POS | 3 ventas en el evento en curso + 2 ventas en el cerrado. Una venta (FPR-003) está corregida — la auditoría aparece en Reporte. |
| Cierre de caja | "Mercado Navideño 2025" cierra cuadrado (diferencia 0). |
| Contabilidad | 2 socios (Diego, Lucía) con aportes en Festival Primavera y gastos fijos/imprevistos asignados. |

El script es **idempotente** (`ON CONFLICT DO NOTHING` sobre las unique
constraints que aplican), así que se puede re-correr sin romper nada.

Al final imprime un resumen con el conteo por tabla.

## `scripts/db-reset.mjs`

Reset interactivo: trunca todas las tablas y vuelve a aplicar el seed.

```bash
pnpm db:reset        # pide confirmación antes de borrar
pnpm db:reset:yes    # saltarse la confirmación
pnpm db:summary      # solo imprime el conteo actual, no toca nada
```

Lee `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` desde `.env.local`.
Si tenés `SUPABASE_SERVICE_ROLE_KEY`, la prefiere para bypassear RLS.

### Requisito en la base

Para que el script pueda correr el seed vía REST, la base necesita una
función RPC `exec_sql(sql_text)` ejecutando SQL arbitrario. Creala una
vez desde el SQL editor del Dashboard:

```sql
create or replace function public.exec_sql(sql_text text)
returns void
language plpgsql
security definer
as $$
begin
  execute sql_text;
end;
$$;

-- Opcional: restringí a usuarios autenticados (recomendado en prod)
-- revoke execute on function public.exec_sql(text) from public;
-- grant execute on function public.exec_sql(text) to authenticated;
```

Si no querés crear la función, podés correr manualmente
`supabase/clean_db.sql` y después `supabase/seed.sql` desde el Dashboard.
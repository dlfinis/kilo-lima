# Datos de desarrollo

El proyecto trae dos piezas pensadas para que la app siempre tenga algo
útil que mostrar, y para que puedas volver a ese estado limpio cuando
ensucies la base.

## `supabase/seed.sql`

Deja un dataset completo que cubre cada pantalla:

| Pantalla | Lo que vas a ver |
|----------|------------------|
| Home | 1 evento **en curso** ("Festival Primavera 2026") + 1 **cerrado** ("Mercado Navideño 2025") para que los contadores tengan datos vivos. |
| Materias primas | Catálogo ampliado de pastelería ecuatoriana (~28 filas): harina de maíz, panela, almidón de yuca, queso fresco, mortadela, banano maduro, etc. |
| Recetas | 12 recetas base. Las 10 nuevas son pastelería típica de Ecuador (empanada de viento, humita, pan de yuca, rosquilla quiteña, helado de paila…) con rendimiento realista. |
| Productos | 12 productos, 1 por receta, con icono + color + descripción. |
| Eventos | 3 eventos, uno por estado. Fechas en pasado y futuro. |
| POS | 3 ventas en el evento en curso + 2 ventas en el cerrado. Una venta (FPR-003) está corregida — la auditoría aparece en Reporte. |
| Cierre de caja | "Mercado Navideño 2025" cierra cuadrado (diferencia 0). |
| Contabilidad | 2 socios (Diego, Lucía) con aportes en Festival Primavera y gastos fijos/imprevistos asignados. |

El script es **idempotente** (`ON CONFLICT DO NOTHING` sobre las unique
constraints que aplican), así que se puede re-correr sin romper nada.

Al final imprime un resumen con el conteo por tabla.

## `scripts/db-reset.mjs`

Reset completo contra Postgres usando el cliente nativo `psql`.

```bash
pnpm db:reset            # interactivo (pide confirmación)
pnpm db:reset:yes        # saltarse la confirmación
pnpm db:summary          # solo imprime el conteo actual
pnpm db:reset --sql ./ruta/al/script.sql   # corre ese SQL sin truncar
```

### Por qué `psql` y no `exec_sql`

Antes el script corría contra la RPC `public.exec_sql(jsonb, text)` que
ya tenés en la base. Problemas que descubrimos:

- No ejecuta multi-statement (devuelve `syntax error at or near "12."`).
- Reporta éxito (`204`) pero **no persiste los cambios** (verificado con
  `service_role` y `count=exact` sobre tablas de RLS).

Por eso el script ahora usa `psql` directo a la base: ejecuta el SQL
completo, soporta multi-statement y persiste todo. La REST API sólo se
queda para el resumen de conteos (rápido y barato).

### Requisitos

1. **Cliente `psql` en PATH** (Postgres 14+).
   - macOS: `brew install postgresql@16` y agregar al PATH
   - Linux: `sudo apt install postgresql-client`
   - Windows: instalador de Postgres

2. **Variable de entorno** `SUPABASE_PSQL_CONNECTION` en `.env.local`.
   El formato es una connection string directa a la base:

   ```
   postgres://postgres:PASSWORD@db.XXXXXXXXXXXX.supabase.co:5432/postgres
   ```

   La sacás de **Supabase Dashboard → Settings → Database → Connection string
   → Transaction** (copiá la "uri", que ya viene con credenciales).

3. **Variables para el resumen** (las mismas que ya usa la app):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

### Uso manual sin el script

Si preferís correr el seed manualmente:

```bash
psql "$SUPABASE_PSQL_CONNECTION" -f supabase/seed.sql
```

O desde el SQL Editor del Dashboard: pegá el archivo entero.

### Si tu `exec_sql` mejora

Si en algún momento reemplazás la función `public.exec_sql` por una que
sí persista, podés volver al flujo vía REST. Mientras tanto, `psql` es
la opción más directa.
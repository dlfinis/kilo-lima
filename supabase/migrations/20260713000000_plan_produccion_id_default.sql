-- plan_produccion_id_default.sql
-- Fix: Restore DEFAULT gen_random_uuid() on plan_produccion.id
-- Issue: Saving plan_produccion fails with "null value in column id violates not-null constraint"
-- Root cause: The DB likely drifted and lost the column default that the original migration defined.
-- This migration is idempotent: it only adds the default if it's missing.

do $$
declare
  _has_default boolean;
begin
  -- Check if the column already has a default
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'plan_produccion'
      and column_name = 'id'
      and column_default is not null
  ) into _has_default;

  -- Only set the default if it's missing
  if not _has_default then
    alter table public.plan_produccion
      alter column id set default gen_random_uuid();
  end if;
end $$;

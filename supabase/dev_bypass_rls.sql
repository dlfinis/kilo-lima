-- dev_bypass_rls.sql
-- ⚠️ DEV-ONLY — SOLO PARA DESARROLLO ⚠️
-- REMOVE IN: auth-flow slice — grants anon role full access for dev only.
-- Este archivo será ELIMINADO en el slice auth-flow.
-- Otorga acceso total al rol anon sobre las tablas del catálogo y de
-- eventos para que el PWA funcione sin autenticación durante el
-- desarrollo. Per REQ-CATALOG-24 + REQ-EVENTS-29.

grant select, insert, update, delete on public.materias_primas to anon;
grant select, insert, update, delete on public.recetas to anon;
grant select, insert, update, delete on public.receta_ingredientes to anon;
grant select, insert, update, delete on public.eventos to anon;
grant select, insert, update, delete on public.gastos_fijos to anon;
grant select, insert, update, delete on public.plan_produccion to anon;

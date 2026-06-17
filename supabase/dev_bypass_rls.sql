-- dev_bypass_rls.sql
-- ⚠️ DEV-ONLY — SOLO PARA DESARROLLO ⚠️
-- Este archivo será ELIMINADO en el slice auth-flow.
-- Otorga acceso total al rol anon sobre las 3 tablas del catálogo
-- para que el PWA funcione sin autenticación durante el desarrollo.
-- Per REQ-CATALOG-24.

grant select, insert, update, delete on public.materias_primas to anon;
grant select, insert, update, delete on public.recetas to anon;
grant select, insert, update, delete on public.receta_ingredientes to anon;

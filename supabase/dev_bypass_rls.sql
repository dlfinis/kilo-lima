-- dev_bypass_rls.sql
-- ⚠️ DEV-ONLY — SOLO PARA DESARROLLO ⚠️
-- REMOVE IN: auth-flow slice — grants anon role full access for dev only.
-- Este archivo será ELIMINADO en el slice auth-flow.
-- Otorga acceso total al rol anon sobre las tablas del catálogo, de
-- eventos y de POS para que el PWA funcione sin autenticación durante
-- el desarrollo. Per REQ-CATALOG-24 + REQ-EVENTS-29 + REQ-POS-43.

grant select, insert, update, delete on public.materias_primas to anon;
grant select, insert, update, delete on public.recetas to anon;
grant select, insert, update, delete on public.receta_ingredientes to anon;
grant select, insert, update, delete on public.eventos to anon;
grant select, insert, update, delete on public.gastos_fijos to anon;
grant select, insert, update, delete on public.plan_produccion to anon;
grant select, insert, update, delete on public.productos to anon;
grant select, insert, update, delete on public.ventas to anon;
grant select, insert, update, delete on public.venta_items to anon;
grant select, insert, update, delete on public.gastos_imprevistos to anon;
grant select, insert, update, delete on public.cierres_caja to anon;

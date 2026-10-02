-- ============================================================================
--  HOTEL CONCIERGE · Migración: liquidación de la habitación
--  Requiere haber ejecutado antes migracion_wifi_correo.sql.
--  Ejecutar UNA vez en Supabase → SQL Editor → New query → pegar → Run.
--  Es seguro volver a ejecutarla.
-- ============================================================================

-- Tarifa por noche del huésped (se usa para calcular el alojamiento)
alter table public.profiles add column if not exists rate_per_night numeric(10,2);

-- Porcentaje de impuesto que se aplica en la liquidación (0 = sin impuesto)
alter table public.hotel_settings add column if not exists tax_percent numeric(5,2) not null default 0;

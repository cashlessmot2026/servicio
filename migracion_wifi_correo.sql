-- ============================================================================
--  HOTEL CONCIERGE · Migración: correo del huésped + ajustes del hotel (Wi-Fi)
--  Ejecutar UNA vez en Supabase → SQL Editor → New query → pegar → Run.
--  Es seguro volver a ejecutarla.
-- ============================================================================

-- Correo (opcional) del huésped, para enviarle la tarjeta de bienvenida
alter table public.profiles add column if not exists email text;

-- Ajustes del hotel: una sola fila (id = 1)
create table if not exists public.hotel_settings (
  id            int primary key default 1 check (id = 1),
  hotel_name    text not null default 'Hotel Concierge',
  wifi_name     text,
  wifi_password text,
  welcome_note  text,
  updated_at    timestamptz not null default now()
);
insert into public.hotel_settings (id) values (1) on conflict (id) do nothing;

alter table public.hotel_settings enable row level security;

-- Todos los usuarios con sesión pueden leerlos (el huésped ve el Wi-Fi en su inicio)
drop policy if exists settings_select on public.hotel_settings;
create policy settings_select on public.hotel_settings for select to authenticated using (true);

-- Solo recepción los modifica
drop policy if exists settings_write on public.hotel_settings;
create policy settings_write on public.hotel_settings for all to authenticated
  using (public.is_reception()) with check (public.is_reception());

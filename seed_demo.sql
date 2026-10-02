-- ============================================================================
--  HOTEL CONCIERGE · Datos de prueba
--  Ejecutar en Supabase → SQL Editor (después de schema.sql).
--
--  Administrador  → https://TU-DOMINIO/#admin   usuario: recepcion   clave: 1234
--  Huésped prueba → https://TU-DOMINIO/         usuario: huesped     clave: 1234
--
--  OJO: "1234" es solo para pruebas. Antes de usar la app con huéspedes reales,
--  cambia la clave de recepción (vuelve a ejecutar la primera parte con otra clave).
-- ============================================================================
do $$
declare v uuid;
begin
  -- Recepción: se crea si no existe y siempre se deja con clave 1234
  if not exists (select 1 from public.profiles where username = 'recepcion') then
    perform public._create_user('recepcion', 'temporal-1234', 'Recepción', 'reception');
  end if;
  update auth.users
     set encrypted_password = extensions.crypt('1234', extensions.gen_salt('bf')), updated_at = now()
   where email = 'recepcion@hotel.local';

  -- Huésped de prueba (habitación 101, sale en 3 días)
  if not exists (select 1 from public.profiles where username = 'huesped') then
    perform public._create_user('huesped', 'temporal-1234', 'Huésped de Prueba', 'guest', '101', current_date, current_date + 3);
  end if;
  update auth.users
     set encrypted_password = extensions.crypt('1234', extensions.gen_salt('bf')), updated_at = now()
   where email = 'huesped@hotel.local';
end $$;

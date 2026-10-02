-- ============================================================================
--  HOTEL CONCIERGE · Esquema para Supabase
--  Ejecutar UNA vez en: Supabase → SQL Editor → New query → pegar → Run
--  Es re-ejecutable (usa IF NOT EXISTS / OR REPLACE donde es posible).
-- ============================================================================

create extension if not exists pgcrypto  with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------------

-- Perfil de cada usuario (huésped o personal). Se borra en cascada con auth.users.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique,
  full_name   text not null,
  role        text not null check (role in ('guest','reception','roomservice','restaurant')),
  room        text,
  check_in    date,
  check_out   date,
  created_at  timestamptz not null default now()
);

-- Lugares reservables (cancha, sauna, salones…). Recepción agrega los que quiera.
create table if not exists public.spaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null default 'otro',
  description text,
  capacity    int,
  open_time   time not null default '07:00',
  close_time  time not null default '22:00',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.reservations (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  guest_id    uuid not null references public.profiles(id) on delete cascade,
  during      tstzrange not null,
  status      text not null default 'confirmada' check (status in ('confirmada','cancelada')),
  notes       text,
  created_at  timestamptz not null default now(),
  -- La base impide dos reservas activas solapadas en el mismo espacio.
  constraint no_overlap exclude using gist (space_id with =, during with &&) where (status = 'confirmada')
);

create table if not exists public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  department  text not null check (department in ('restaurant','roomservice')),
  category    text not null default 'General',
  name        text not null,
  description text,
  price       numeric(10,2) not null check (price >= 0),
  active      boolean not null default true
);

create table if not exists public.orders (
  id          uuid primary key default gen_random_uuid(),
  guest_id    uuid not null references public.profiles(id) on delete cascade,
  department  text not null check (department in ('restaurant','roomservice')),
  status      text not null default 'pendiente' check (status in ('pendiente','en_curso','listo','cancelado')),
  total       numeric(10,2) not null default 0,
  notes       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.order_items (
  id        uuid primary key default gen_random_uuid(),
  order_id  uuid not null references public.orders(id) on delete cascade,
  name      text not null,
  price     numeric(10,2) not null,
  qty       int not null check (qty > 0)
);

-- Solicitudes rápidas con estado (toallas, limpieza, mantenimiento…)
create table if not exists public.requests (
  id          uuid primary key default gen_random_uuid(),
  guest_id    uuid not null references public.profiles(id) on delete cascade,
  department  text not null check (department in ('reception','roomservice','restaurant')),
  title       text not null,
  details     text,
  status      text not null default 'pendiente' check (status in ('pendiente','en_curso','listo','cancelado')),
  created_at  timestamptz not null default now()
);

-- Chat: un hilo por (huésped, departamento)
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  guest_id    uuid not null references public.profiles(id) on delete cascade,
  department  text not null check (department in ('reception','roomservice','restaurant')),
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists messages_thread_idx on public.messages (guest_id, department, created_at);
create index if not exists reservations_space_idx on public.reservations using gist (space_id, during);

-- ---------------------------------------------------------------------------
-- 2. FUNCIONES AUXILIARES DE PERMISOS
-- ---------------------------------------------------------------------------

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ¿Puede el usuario actual atender este departamento?
create or replace function public.can_access_dept(d text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('reception', d), false)
$$;

create or replace function public.is_reception() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'reception', false)
$$;

-- ---------------------------------------------------------------------------
-- 3. SEGURIDAD A NIVEL DE FILA (RLS)
-- ---------------------------------------------------------------------------

alter table public.profiles     enable row level security;
alter table public.spaces       enable row level security;
alter table public.reservations enable row level security;
alter table public.menu_items   enable row level security;
alter table public.orders       enable row level security;
alter table public.order_items  enable row level security;
alter table public.requests     enable row level security;
alter table public.messages     enable row level security;

-- profiles: cada quien ve el suyo; el personal ve a los huéspedes; recepción gestiona
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.my_role() <> 'guest');
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_reception()) with check (public.is_reception());

-- spaces: todos leen los activos; recepción administra
drop policy if exists spaces_select on public.spaces;
create policy spaces_select on public.spaces for select to authenticated
  using (active or public.is_reception());
drop policy if exists spaces_write on public.spaces;
create policy spaces_write on public.spaces for all to authenticated
  using (public.is_reception()) with check (public.is_reception());

-- menu_items
drop policy if exists menu_select on public.menu_items;
create policy menu_select on public.menu_items for select to authenticated
  using (active or public.can_access_dept(department));
drop policy if exists menu_write on public.menu_items;
create policy menu_write on public.menu_items for all to authenticated
  using (public.can_access_dept(department)) with check (public.can_access_dept(department));

-- reservations: el huésped ve y crea las suyas; recepción gestiona todas
drop policy if exists res_select on public.reservations;
create policy res_select on public.reservations for select to authenticated
  using (guest_id = auth.uid() or public.is_reception());
drop policy if exists res_insert on public.reservations;
create policy res_insert on public.reservations for insert to authenticated
  with check (
    (guest_id = auth.uid() and status = 'confirmada' and lower(during) > now()
       and exists (select 1 from public.spaces s where s.id = space_id and s.active))
    or public.is_reception()
  );
drop policy if exists res_update on public.reservations;
create policy res_update on public.reservations for update to authenticated
  using (public.is_reception()) with check (public.is_reception());
drop policy if exists res_delete on public.reservations;
create policy res_delete on public.reservations for delete to authenticated
  using (public.is_reception());

-- orders / order_items: el huésped solo lee; crea con place_order(); personal actualiza estado
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select to authenticated
  using (guest_id = auth.uid() or public.can_access_dept(department));
drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders for update to authenticated
  using (public.can_access_dept(department)) with check (public.can_access_dept(department));

drop policy if exists oitems_select on public.order_items;
create policy oitems_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o
                 where o.id = order_id and (o.guest_id = auth.uid() or public.can_access_dept(o.department))));

-- requests
drop policy if exists req_select on public.requests;
create policy req_select on public.requests for select to authenticated
  using (guest_id = auth.uid() or public.can_access_dept(department));
drop policy if exists req_insert on public.requests;
create policy req_insert on public.requests for insert to authenticated
  with check (guest_id = auth.uid() and status = 'pendiente' and public.my_role() = 'guest');
drop policy if exists req_update on public.requests;
create policy req_update on public.requests for update to authenticated
  using (public.can_access_dept(department)) with check (public.can_access_dept(department));

-- messages
drop policy if exists msg_select on public.messages;
create policy msg_select on public.messages for select to authenticated
  using (guest_id = auth.uid() or public.can_access_dept(department));
drop policy if exists msg_insert on public.messages;
create policy msg_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (guest_id = auth.uid() or public.can_access_dept(department))
  );

-- ---------------------------------------------------------------------------
-- 4. FUNCIONES DE NEGOCIO (RPC) que llama la aplicación
-- ---------------------------------------------------------------------------

-- Creación interna de usuario (auth + perfil). NO expuesta a la app.
create or replace function public._create_user(
  p_username text, p_password text, p_full_name text, p_role text,
  p_room text default null, p_check_in date default null, p_check_out date default null
) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_id    uuid := gen_random_uuid();
  v_email text := lower(trim(p_username)) || '@hotel.local';
begin
  if length(p_password) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres'; end if;
  if exists (select 1 from public.profiles where username = lower(trim(p_username))) then
    raise exception 'El usuario "%" ya existe', p_username;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', v_id::text, now(), now(), now());

  insert into public.profiles (id, username, full_name, role, room, check_in, check_out)
  values (v_id, lower(trim(p_username)), p_full_name, p_role, p_room, p_check_in, p_check_out);

  return v_id;
end $$;
revoke all on function public._create_user(text,text,text,text,text,date,date) from public, anon, authenticated;

-- Recepción registra a un huésped (usuario y contraseña asignados aquí)
create or replace function public.create_guest(
  p_username text, p_password text, p_full_name text, p_room text,
  p_check_in date default current_date, p_check_out date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_reception() then raise exception 'Solo recepción puede registrar huéspedes'; end if;
  return public._create_user(p_username, p_password, p_full_name, 'guest', p_room, p_check_in, p_check_out);
end $$;

-- Recepción crea personal de departamento (restaurant / roomservice / reception)
create or replace function public.create_staff(
  p_username text, p_password text, p_full_name text, p_role text
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_reception() then raise exception 'Solo recepción puede crear personal'; end if;
  if p_role not in ('reception','roomservice','restaurant') then raise exception 'Rol inválido'; end if;
  return public._create_user(p_username, p_password, p_full_name, p_role);
end $$;

-- Checkout: elimina al huésped. Pierde acceso de inmediato; sus pedidos,
-- reservas, solicitudes y mensajes se borran en cascada.
create or replace function public.checkout_guest(p_guest uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_reception() then raise exception 'Solo recepción puede hacer checkout'; end if;
  if not exists (select 1 from public.profiles where id = p_guest and role = 'guest') then
    raise exception 'Huésped no encontrado';
  end if;
  delete from auth.users where id = p_guest;   -- cascada a profiles y a todo lo demás
end $$;

-- Cambio de contraseña por recepción (por si el huésped la olvida)
create or replace function public.reset_guest_password(p_guest uuid, p_password text) returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not public.is_reception() then raise exception 'Solo recepción'; end if;
  if length(p_password) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
  where id = p_guest;
end $$;

-- Pedido: los precios se leen del menú en el servidor (el cliente no puede alterarlos)
-- p_items = [{"id":"<uuid del menu_item>","qty":2}, ...]
create or replace function public.place_order(p_department text, p_items jsonb, p_notes text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_order uuid; v_total numeric(10,2); v_count int;
begin
  if public.my_role() <> 'guest' then raise exception 'Solo huéspedes pueden hacer pedidos'; end if;
  if p_department not in ('restaurant','roomservice') then raise exception 'Departamento inválido'; end if;

  select count(*) into v_count
  from jsonb_to_recordset(p_items) as x(id uuid, qty int)
  join public.menu_items m on m.id = x.id and m.active and m.department = p_department
  where x.qty > 0;
  if v_count = 0 or v_count <> jsonb_array_length(p_items) then
    raise exception 'Pedido vacío o con artículos no disponibles';
  end if;

  insert into public.orders (guest_id, department, notes) values (auth.uid(), p_department, p_notes)
  returning id into v_order;

  insert into public.order_items (order_id, name, price, qty)
  select v_order, m.name, m.price, x.qty
  from jsonb_to_recordset(p_items) as x(id uuid, qty int)
  join public.menu_items m on m.id = x.id;

  select coalesce(sum(price * qty), 0) into v_total from public.order_items where order_id = v_order;
  update public.orders set total = v_total where id = v_order;
  return v_order;
end $$;

-- Cancelar reserva propia (o cualquiera si es recepción)
create or replace function public.cancel_reservation(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.reservations set status = 'cancelada'
  where id = p_id and (guest_id = auth.uid() or public.is_reception());
  if not found then raise exception 'Reserva no encontrada'; end if;
end $$;

-- Horarios ocupados de un espacio en un día, sin revelar quién reservó
create or replace function public.busy_slots(p_space uuid, p_day date)
returns table (starts timestamptz, ends timestamptz)
language sql stable security definer set search_path = public as $$
  select lower(during), upper(during) from public.reservations
  where space_id = p_space and status = 'confirmada'
    and during && tstzrange(p_day::timestamptz, (p_day + 1)::timestamptz)
$$;

-- Solo usuarios autenticados pueden llamar a las funciones públicas
revoke all on function public.create_guest(text,text,text,text,date,date) from public, anon;
revoke all on function public.create_staff(text,text,text,text)           from public, anon;
revoke all on function public.checkout_guest(uuid)                        from public, anon;
revoke all on function public.reset_guest_password(uuid,text)             from public, anon;
revoke all on function public.place_order(text,jsonb,text)                from public, anon;
revoke all on function public.cancel_reservation(uuid)                    from public, anon;
revoke all on function public.busy_slots(uuid,date)                       from public, anon;
grant execute on function public.create_guest(text,text,text,text,date,date) to authenticated;
grant execute on function public.create_staff(text,text,text,text)           to authenticated;
grant execute on function public.checkout_guest(uuid)                        to authenticated;
grant execute on function public.reset_guest_password(uuid,text)             to authenticated;
grant execute on function public.place_order(text,jsonb,text)                to authenticated;
grant execute on function public.cancel_reservation(uuid)                    to authenticated;
grant execute on function public.busy_slots(uuid,date)                       to authenticated;

-- ---------------------------------------------------------------------------
-- 5. TIEMPO REAL
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['messages','orders','requests','reservations'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. DATOS INICIALES
-- ---------------------------------------------------------------------------
insert into public.spaces (name, kind, description, capacity, open_time, close_time)
select * from (values
  ('Cancha de tenis',  'deporte', 'Cancha de arcilla iluminada',          4,  '07:00'::time, '21:00'::time),
  ('Sauna',            'bienestar','Sauna finlandesa para hasta 6 personas', 6,  '10:00'::time, '21:00'::time),
  ('Salón Imperial',   'salon',   'Salón para eventos y reuniones',       80, '08:00'::time, '23:00'::time),
  ('Sala de reuniones','salon',   'Sala ejecutiva con proyector',         12, '08:00'::time, '20:00'::time)
) v(name, kind, description, capacity, open_time, close_time)
where not exists (select 1 from public.spaces);

insert into public.menu_items (department, category, name, description, price)
select * from (values
  ('restaurant','Entradas',  'Ceviche de la casa',     'Pescado del día, limón y ají',   14.00),
  ('restaurant','Principales','Filete de res',         'Con puré rústico y vegetales',   28.00),
  ('restaurant','Postres',   'Crème brûlée',           'Vainilla de Madagascar',          9.00),
  ('roomservice','Desayuno', 'Desayuno continental',   'Pan, fruta, café y jugo',        16.00),
  ('roomservice','Bebidas',  'Botella de agua',        '750 ml',                          4.00),
  ('roomservice','Snacks',   'Tabla de quesos',        'Selección con frutos secos',     18.00)
) v(department, category, name, description, price)
where not exists (select 1 from public.menu_items);

-- ---------------------------------------------------------------------------
-- 6b. CORREO DEL HUÉSPED Y AJUSTES DEL HOTEL (Wi-Fi)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 7. PRIMER USUARIO DE RECEPCIÓN  (ejecutar desde el SQL Editor)
--    Cambia usuario y contraseña ANTES de ejecutar esta línea:
-- ---------------------------------------------------------------------------
select public._create_user('recepcion', 'CAMBIA_ESTA_CLAVE', 'Recepción', 'reception')
where not exists (select 1 from public.profiles where role = 'reception');

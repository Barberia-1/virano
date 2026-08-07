-- Peluquería — tabla de solicitudes y confirmaciones de turnos.
-- Usá este archivo en Supabase para crear la tabla y las políticas necesarias.

create table if not exists public.peluqueria_turnos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 1 and 80),
  estado text not null check (estado in ('pendiente', 'confirmado')) default 'pendiente',
  dia text not null default '' check (char_length(dia) <= 20),
  hora text not null default '' check (char_length(hora) <= 10),
  creado timestamptz not null default now()
);

create index if not exists ix_peluqueria_turnos_estado on public.peluqueria_turnos (estado);

alter table public.peluqueria_turnos enable row level security;

do $$
declare
  p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'peluqueria_turnos' loop
    execute format('drop policy %I on public.peluqueria_turnos', p.policyname);
  end loop;

  execute 'create policy leer_peluqueria_turnos on public.peluqueria_turnos for select using (true)';
  execute 'create policy crear_peluqueria_turnos on public.peluqueria_turnos for insert with check (true)';
  execute 'create policy editar_peluqueria_turnos on public.peluqueria_turnos for update using (true) with check (true)';
  execute 'create policy borrar_peluqueria_turnos on public.peluqueria_turnos for delete using (true)';
end $$;

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'peluqueria_turnos'
  ) then
    null;
  else
    alter publication supabase_realtime add table public.peluqueria_turnos;
  end if;
end $$;

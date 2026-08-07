-- ============================================================================
-- Juntada — esquema de base de datos
--
-- Cómo usarlo: entrá a tu proyecto en supabase.com → SQL Editor → New query,
-- pegá TODO este archivo y dale a Run. Se puede correr más de una vez sin
-- romper nada.
--
-- Sobre la seguridad: el modelo de acceso es "el código del grupo es la
-- contraseña". La clave anon viaja en el HTML (es pública por diseño), así que
-- alguien decidido podría leer datos de otros grupos. Para un álbum entre
-- amigos alcanza; si vas a subir algo verdaderamente sensible, hay que pasar a
-- Supabase Auth con políticas por usuario. Está explicado en el README.
-- ============================================================================

create extension if not exists pgcrypto;

-- ─────────────────────────────── Tablas ────────────────────────────────────

create table if not exists public.grupos (
  id      uuid primary key default gen_random_uuid(),
  codigo  text not null unique check (char_length(codigo) = 6),
  nombre  text not null check (char_length(nombre) between 1 and 60),
  creado  timestamptz not null default now()
);

-- Integrantes: hace falta para saber quién todavía no subió su vestimenta.
create table if not exists public.miembros (
  id        uuid primary key default gen_random_uuid(),
  grupo_id  uuid not null references public.grupos(id) on delete cascade,
  autor_id  text not null,
  nombre    text not null check (char_length(nombre) between 1 and 40),
  visto     timestamptz not null default now(),
  creado    timestamptz not null default now(),
  unique (grupo_id, autor_id)
);

-- Una juntada agendada: fecha, lugar y la consigna de vestimenta.
create table if not exists public.juntadas (
  id           uuid primary key default gen_random_uuid(),
  grupo_id     uuid not null references public.grupos(id) on delete cascade,
  titulo       text not null check (char_length(titulo) between 1 and 60),
  fecha        timestamptz not null,
  lugar        text not null default '' check (char_length(lugar) <= 80),
  consigna     text not null default '' check (char_length(consigna) <= 140),
  autor_id     text not null,
  autor_nombre text not null,
  creado       timestamptz not null default now()
);

-- La foto de vestimenta completa de cada persona para cada juntada.
-- Una sola por persona y juntada: si sube otra, reemplaza la anterior.
create table if not exists public.atuendos (
  id           uuid primary key default gen_random_uuid(),
  grupo_id     uuid not null references public.grupos(id) on delete cascade,
  juntada_id   uuid not null references public.juntadas(id) on delete cascade,
  autor_id     text not null,
  autor_nombre text not null,
  nota         text not null default '' check (char_length(nota) <= 140),
  w            integer,
  h            integer,
  media_path   text not null,
  thumb_path   text,
  creado       timestamptz not null default now(),
  unique (juntada_id, autor_id)
);

create table if not exists public.publicaciones (
  id           uuid primary key default gen_random_uuid(),
  grupo_id     uuid not null references public.grupos(id) on delete cascade,
  autor_id     text not null,
  autor_nombre text not null check (char_length(autor_nombre) between 1 and 40),
  kind         text not null check (kind in ('image', 'video')),
  epigrafe     text not null default '' check (char_length(epigrafe) <= 280),
  w            integer,
  h            integer,
  dur          real,
  peso         bigint,
  media_path   text not null,
  thumb_path   text,
  creado       timestamptz not null default now()
);

create table if not exists public.reacciones (
  id           uuid primary key default gen_random_uuid(),
  grupo_id     uuid not null references public.grupos(id) on delete cascade,
  pub_id       uuid not null references public.publicaciones(id) on delete cascade,
  autor_id     text not null,
  autor_nombre text not null,
  emoji        text not null check (char_length(emoji) <= 8),
  creado       timestamptz not null default now(),
  unique (pub_id, autor_id, emoji)
);

create table if not exists public.comentarios (
  id           uuid primary key default gen_random_uuid(),
  grupo_id     uuid not null references public.grupos(id) on delete cascade,
  pub_id       uuid not null references public.publicaciones(id) on delete cascade,
  autor_id     text not null,
  autor_nombre text not null,
  cuerpo       text not null check (char_length(cuerpo) between 1 and 500),
  creado       timestamptz not null default now()
);

-- ────────────────────────────── Índices ────────────────────────────────────
-- El feed siempre pide "las publicaciones de este grupo, más nuevas primero".

create index if not exists ix_pub_grupo    on public.publicaciones (grupo_id, creado desc);
create index if not exists ix_reac_grupo   on public.reacciones (grupo_id);
create index if not exists ix_reac_pub     on public.reacciones (pub_id);
create index if not exists ix_com_grupo    on public.comentarios (grupo_id);
create index if not exists ix_com_pub      on public.comentarios (pub_id, creado);
create index if not exists ix_miem_grupo   on public.miembros (grupo_id);
create index if not exists ix_junt_grupo   on public.juntadas (grupo_id, fecha);
create index if not exists ix_atu_grupo    on public.atuendos (grupo_id);
create index if not exists ix_atu_junt     on public.atuendos (juntada_id);

-- ──────────────────────── Row Level Security ───────────────────────────────

alter table public.grupos        enable row level security;
alter table public.miembros      enable row level security;
alter table public.juntadas      enable row level security;
alter table public.atuendos      enable row level security;
alter table public.publicaciones enable row level security;
alter table public.reacciones    enable row level security;
alter table public.comentarios   enable row level security;

do $$
declare
  t text;
  p record;
begin
  foreach t in array array['grupos', 'miembros', 'juntadas', 'atuendos',
                           'publicaciones', 'reacciones', 'comentarios'] loop
    -- Limpiamos políticas previas para que el script sea reejecutable.
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;

    execute format('create policy leer_%1$s   on public.%1$I for select using (true)', t);
    execute format('create policy crear_%1$s  on public.%1$I for insert with check (true)', t);
  end loop;

  -- Borrar: hace falta para sacar una reacción y para que el autor elimine su
  -- publicación. Sin login no se puede verificar quién es, así que la app lo
  -- controla del lado del cliente.
  foreach t in array array['miembros', 'juntadas', 'atuendos',
                           'publicaciones', 'reacciones', 'comentarios'] loop
    execute format('create policy borrar_%1$s on public.%1$I for delete using (true)', t);
  end loop;

  -- Actualizar: el miembro refresca su "visto" y puede cambiar su atuendo;
  -- el organizador puede editar la fecha o el lugar de una juntada.
  foreach t in array array['miembros', 'juntadas', 'atuendos'] loop
    execute format('create policy editar_%1$s on public.%1$I for update using (true) with check (true)', t);
  end loop;
end $$;

-- ─────────────────────────── Tiempo real ───────────────────────────────────
-- Sin esto, la foto que sube tu amigo no aparece hasta que recargues.

do $$
declare t text;
begin
  foreach t in array array['publicaciones', 'reacciones', 'comentarios',
                           'miembros', 'juntadas', 'atuendos'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ──────────────────────────── Storage ──────────────────────────────────────
-- Bucket público: las URLs de las fotos son largas e impredecibles, pero
-- quien tenga el link puede verlas. Es el mismo trato que hace WhatsApp Web.

insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 104857600)   -- 100 MB por archivo
on conflict (id) do update
  set public = true, file_size_limit = 104857600;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'juntada_%'
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

create policy juntada_leer   on storage.objects for select
  using (bucket_id = 'media');
create policy juntada_subir  on storage.objects for insert
  with check (bucket_id = 'media');
create policy juntada_borrar on storage.objects for delete
  using (bucket_id = 'media');

-- ============================================================================
-- Listo. Copiá Project URL y la clave anon (Project Settings → Data API)
-- y pegalas en js/config.js.
-- ============================================================================

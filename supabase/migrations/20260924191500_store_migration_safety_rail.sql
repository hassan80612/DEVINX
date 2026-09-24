-- DevinX Loja migration safety rail.
-- This does not switch traffic. Vetorize remains the active backend until an explicit cutover.

create table if not exists public.devinx_store_runtime_settings (
  singleton boolean primary key default true check (singleton = true),
  backend_mode text not null default 'vetorize' check (backend_mode in ('vetorize','devinx')),
  fallback_enabled boolean not null default true,
  cutover_at timestamptz null,
  updated_at timestamptz not null default now()
);

insert into public.devinx_store_runtime_settings(singleton,backend_mode,fallback_enabled)
values(true,'vetorize',true)
on conflict(singleton) do nothing;

alter table public.devinx_store_runtime_settings enable row level security;
revoke all on table public.devinx_store_runtime_settings from anon, authenticated;

create table if not exists public.devinx_store_identity_map (
  legacy_user_id uuid primary key,
  legacy_email text not null,
  legacy_store_id uuid not null unique,
  legacy_store_slug text not null unique,
  devinx_user_id uuid null references auth.users(id) on delete set null,
  link_status text not null default 'pending' check (link_status in ('pending','linked','disabled')),
  linked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists devinx_store_identity_email_idx
  on public.devinx_store_identity_map(lower(legacy_email));

alter table public.devinx_store_identity_map enable row level security;
revoke all on table public.devinx_store_identity_map from anon, authenticated;

create table if not exists public.devinx_store_migration_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'vetorize-ai',
  source_project_ref text not null,
  state text not null default 'captured' check (state in ('captured','validated','cutover','rolled_back','archived')),
  notes text not null default '',
  captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.devinx_store_migration_batches enable row level security;
revoke all on table public.devinx_store_migration_batches from anon, authenticated;

create table if not exists public.devinx_store_migration_snapshots (
  batch_id uuid not null references public.devinx_store_migration_batches(id) on delete cascade,
  table_name text not null,
  row_key text not null,
  payload jsonb not null,
  captured_at timestamptz not null default now(),
  primary key(batch_id,table_name,row_key)
);

create index if not exists devinx_store_migration_snapshots_table_idx
  on public.devinx_store_migration_snapshots(table_name,captured_at desc);

alter table public.devinx_store_migration_snapshots enable row level security;
revoke all on table public.devinx_store_migration_snapshots from anon, authenticated;

create or replace function public.get_devinx_store_backend_mode()
returns table(backend_mode text,fallback_enabled boolean,cutover_at timestamptz)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select s.backend_mode,s.fallback_enabled,s.cutover_at
  from public.devinx_store_runtime_settings s
  where s.singleton=true;
$$;

revoke all on function public.get_devinx_store_backend_mode() from public;
grant execute on function public.get_devinx_store_backend_mode() to anon, authenticated;

comment on table public.devinx_store_runtime_settings is
  'Runtime cutover switch for DevinX Loja. Defaults to Vetorize so migration preparation is non-disruptive.';
comment on table public.devinx_store_identity_map is
  'Maps legacy Vetorize store owners to DevinX Auth users without changing legacy store IDs.';
comment on table public.devinx_store_migration_snapshots is
  'Read-only migration snapshots. Sensitive provider tokens are intentionally excluded from generic snapshots.';

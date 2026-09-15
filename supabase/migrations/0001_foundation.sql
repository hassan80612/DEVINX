-- DEVINX foundation. All money values use integer minor units.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  locale text not null default 'pt-BR',
  currency_code text not null default 'BRL',
  timezone text not null default 'America/Sao_Paulo',
  retention_months integer not null default 12 check (retention_months >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('driver','delivery','salary','self_employed','other')),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  energy_type text not null check (energy_type in ('gasoline','ethanol','diesel','hybrid','electric','human')),
  efficiency numeric,
  unit_price_minor bigint,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  income_source_id uuid references public.income_sources(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  worked_on date not null,
  gross_income_minor bigint not null check (gross_income_minor >= 0),
  energy_cost_minor bigint not null default 0 check (energy_cost_minor >= 0),
  distance_km numeric not null default 0 check (distance_km >= 0),
  minutes_worked integer not null default 0 check (minutes_worked >= 0),
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  income_source_id uuid references public.income_sources(id) on delete set null,
  type text not null check (type in ('income','expense')),
  category_id text not null,
  description text,
  amount_minor bigint not null check (amount_minor > 0),
  occurred_on date not null,
  payment_method text,
  is_avoidable boolean not null default false,
  is_recurring boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  period text not null check (period in ('daily','weekly','monthly')),
  basis text not null check (basis in ('gross','operational_net','savings','payoff')),
  target_minor bigint not null check (target_minor > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.income_sources enable row level security;
alter table public.vehicles enable row level security;
alter table public.work_sessions enable row level security;
alter table public.transactions enable row level security;
alter table public.goals enable row level security;

create policy profiles_own on public.profiles for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy income_sources_own on public.income_sources for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy vehicles_own on public.vehicles for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy work_sessions_own on public.work_sessions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy transactions_own on public.transactions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy goals_own on public.goals for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index income_sources_user_idx on public.income_sources(user_id);
create index vehicles_user_idx on public.vehicles(user_id);
create index work_sessions_user_date_idx on public.work_sessions(user_id, worked_on desc);
create index transactions_user_date_idx on public.transactions(user_id, occurred_on desc);
create index goals_user_idx on public.goals(user_id);

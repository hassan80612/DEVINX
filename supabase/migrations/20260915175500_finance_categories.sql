create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('income','expense')),
  name text not null check (char_length(trim(name)) between 1 and 40),
  icon text not null default '•',
  show_in_quick boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists finance_categories_user_kind_idx on public.finance_categories(user_id,kind,is_active);
create unique index if not exists finance_categories_user_kind_name_uq on public.finance_categories(user_id,kind,lower(trim(name))) where is_active;

alter table public.finance_categories enable row level security;

drop policy if exists finance_categories_select_own on public.finance_categories;
create policy finance_categories_select_own on public.finance_categories for select using ((select auth.uid()) = user_id);
drop policy if exists finance_categories_insert_own on public.finance_categories;
create policy finance_categories_insert_own on public.finance_categories for insert with check ((select auth.uid()) = user_id);
drop policy if exists finance_categories_update_own on public.finance_categories;
create policy finance_categories_update_own on public.finance_categories for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists finance_categories_delete_own on public.finance_categories;
create policy finance_categories_delete_own on public.finance_categories for delete using ((select auth.uid()) = user_id);

grant select,insert,update,delete on public.finance_categories to authenticated;

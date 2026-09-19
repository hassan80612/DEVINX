-- Prepared only. Apply to production together with the matching frontend release.
-- Monthly installments, partial recurring payments, per-month overrides,
-- daily-goal horizon and isolated financial reserves.

alter table public.recurring_bills
  add column if not exists start_month date,
  add column if not exists installment_count integer;

update public.recurring_bills
set start_month=date_trunc('month',created_at)::date
where start_month is null;

alter table public.recurring_bills
  alter column start_month set not null;

alter table public.recurring_bills
  drop constraint if exists recurring_bills_installment_count_check;
alter table public.recurring_bills
  add constraint recurring_bills_installment_count_check
  check (installment_count is null or installment_count between 1 and 600);

alter table public.recurring_bill_payments
  drop constraint if exists recurring_bill_payments_recurring_bill_id_due_month_key;

create index if not exists recurring_bill_payments_bill_month_idx
  on public.recurring_bill_payments(recurring_bill_id,due_month);

create table if not exists public.recurring_bill_month_overrides(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recurring_bill_id uuid not null references public.recurring_bills(id) on delete cascade,
  due_month date not null,
  amount_minor bigint check(amount_minor is null or amount_minor>0),
  due_day integer check(due_day is null or due_day between 1 and 31),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(recurring_bill_id,due_month)
);
alter table public.recurring_bill_month_overrides enable row level security;
drop policy if exists recurring_bill_month_overrides_own on public.recurring_bill_month_overrides;
create policy recurring_bill_month_overrides_own
  on public.recurring_bill_month_overrides
  for all to authenticated
  using((select auth.uid())=user_id)
  with check((select auth.uid())=user_id);
create index if not exists recurring_bill_month_overrides_user_month_idx
  on public.recurring_bill_month_overrides(user_id,due_month);

alter table public.profiles
  add column if not exists daily_goal_target_date date;

create table if not exists public.reserve_entries(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('deposit','use')),
  amount_minor bigint not null check(amount_minor>0),
  occurred_on date not null default current_date,
  target_date date,
  note text,
  created_at timestamptz not null default now(),
  check(kind='deposit' or target_date is not null)
);
alter table public.reserve_entries enable row level security;
drop policy if exists reserve_entries_own on public.reserve_entries;
create policy reserve_entries_own
  on public.reserve_entries
  for all to authenticated
  using((select auth.uid())=user_id)
  with check((select auth.uid())=user_id);
create index if not exists reserve_entries_user_date_idx
  on public.reserve_entries(user_id,occurred_on desc);

create or replace function public.record_reserve_entry(
  p_kind text,
  p_amount_minor bigint,
  p_occurred_on date default current_date,
  p_target_date date default null,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  current_balance bigint;
  new_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('deposit','use') then raise exception 'invalid reserve kind'; end if;
  if p_amount_minor is null or p_amount_minor<=0 then raise exception 'invalid amount'; end if;
  if p_kind='use' and p_target_date is null then raise exception 'target date required'; end if;

  select coalesce(sum(case when kind='deposit' then amount_minor else -amount_minor end),0)
  into current_balance
  from public.reserve_entries
  where user_id=uid;

  if p_kind='use' and p_amount_minor>current_balance then
    raise exception 'insufficient reserve';
  end if;

  insert into public.reserve_entries(user_id,kind,amount_minor,occurred_on,target_date,note)
  values(uid,p_kind,p_amount_minor,coalesce(p_occurred_on,current_date),p_target_date,nullif(trim(p_note),''))
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.record_reserve_entry(text,bigint,date,date,text) from public,anon;
grant execute on function public.record_reserve_entry(text,bigint,date,date,text) to authenticated;

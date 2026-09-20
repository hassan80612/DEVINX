create table if not exists public.future_plans(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('income','expense')),
  name text not null check(length(trim(name)) between 1 and 120),
  amount_minor bigint not null check(amount_minor>0),
  category_id text not null,
  due_date date not null,
  recurrence text not null default 'once' check(recurrence in ('once','monthly','annual')),
  reserve_enabled boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(kind='expense' or reserve_enabled=false)
);

create table if not exists public.future_plan_settlements(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.future_plans(id) on delete cascade,
  due_date date not null,
  amount_minor bigint not null check(amount_minor>0),
  settled_on date not null,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  reserve_entry_id uuid null references public.reserve_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(plan_id,due_date)
);

alter table public.reserve_entries add column if not exists future_plan_id uuid null;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='reserve_entries_future_plan_id_fkey') then
    alter table public.reserve_entries add constraint reserve_entries_future_plan_id_fkey foreign key(future_plan_id) references public.future_plans(id) on delete set null;
  end if;
end $$;

create index if not exists future_plans_user_active_due_idx on public.future_plans(user_id,is_active,due_date);
create index if not exists future_plan_settlements_user_date_idx on public.future_plan_settlements(user_id,settled_on desc);
create index if not exists future_plan_settlements_plan_due_idx on public.future_plan_settlements(plan_id,due_date);
create index if not exists reserve_entries_future_plan_idx on public.reserve_entries(user_id,future_plan_id) where future_plan_id is not null;

alter table public.future_plans enable row level security;
alter table public.future_plan_settlements enable row level security;

drop policy if exists future_plans_own on public.future_plans;
drop policy if exists future_plans_subscription_gate on public.future_plans;
create policy future_plans_own on public.future_plans for all
  using((select auth.uid())=user_id and (select public.has_devinx_access()))
  with check((select auth.uid())=user_id and (select public.has_devinx_access()));

drop policy if exists future_plan_settlements_own on public.future_plan_settlements;
drop policy if exists future_plan_settlements_subscription_gate on public.future_plan_settlements;
create policy future_plan_settlements_own on public.future_plan_settlements for all
  using((select auth.uid())=user_id and (select public.has_devinx_access()))
  with check((select auth.uid())=user_id and (select public.has_devinx_access()));

create or replace function public.record_future_plan_reserve(
  p_plan_id uuid,
  p_amount_minor bigint,
  p_occurred_on date default current_date
) returns uuid
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  uid uuid:=auth.uid();
  p public.future_plans%rowtype;
  new_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.has_devinx_access() then raise exception 'access blocked'; end if;
  if p_amount_minor is null or p_amount_minor<=0 then raise exception 'invalid amount'; end if;
  select * into p from public.future_plans where id=p_plan_id and user_id=uid and is_active=true for update;
  if not found or p.kind<>'expense' or not p.reserve_enabled then raise exception 'invalid future plan'; end if;

  insert into public.reserve_entries(user_id,kind,amount_minor,occurred_on,note,future_plan_id)
  values(uid,'deposit',p_amount_minor,coalesce(p_occurred_on,current_date),p.name,p.id)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.settle_future_plan(
  p_plan_id uuid,
  p_due_date date,
  p_amount_minor bigint,
  p_settled_on date default current_date
) returns uuid
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  uid uuid:=auth.uid();
  p public.future_plans%rowtype;
  tx_id uuid;
  st_id uuid;
  reserve_id uuid;
  committed bigint:=0;
  reserve_use bigint:=0;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.has_devinx_access() then raise exception 'access blocked'; end if;
  if p_amount_minor is null or p_amount_minor<=0 then raise exception 'invalid amount'; end if;

  select * into p from public.future_plans where id=p_plan_id and user_id=uid for update;
  if not found then raise exception 'future plan not found'; end if;

  if exists(select 1 from public.future_plan_settlements where plan_id=p.id and due_date=p_due_date) then
    raise exception 'future occurrence already settled';
  end if;

  if p.recurrence='once' and p_due_date<>p.due_date then raise exception 'invalid occurrence'; end if;
  if p_due_date<p.due_date then raise exception 'invalid occurrence'; end if;

  insert into public.transactions(
    user_id,type,category_id,description,amount_minor,occurred_on,payment_method,is_avoidable,is_recurring,source_type,source_id
  ) values(
    uid,p.kind,p.category_id,p.name,p_amount_minor,coalesce(p_settled_on,current_date),null,false,p.recurrence<>'once','future_plan',p.id
  ) returning id into tx_id;

  if p.kind='expense' and p.reserve_enabled then
    select coalesce(sum(case when kind='deposit' then amount_minor else -amount_minor end),0)
      into committed
    from public.reserve_entries
    where user_id=uid and future_plan_id=p.id;

    reserve_use:=least(greatest(committed,0),p_amount_minor);
    if reserve_use>0 then
      insert into public.reserve_entries(user_id,kind,amount_minor,occurred_on,note,future_plan_id)
      values(uid,'withdraw',reserve_use,coalesce(p_settled_on,current_date),p.name,p.id)
      returning id into reserve_id;
    end if;
  end if;

  insert into public.future_plan_settlements(
    user_id,plan_id,due_date,amount_minor,settled_on,transaction_id,reserve_entry_id
  ) values(uid,p.id,p_due_date,p_amount_minor,coalesce(p_settled_on,current_date),tx_id,reserve_id)
  returning id into st_id;

  if p.recurrence='once' then
    update public.future_plans set is_active=false,updated_at=now() where id=p.id;
  end if;

  return st_id;
end;
$$;

create or replace function public.reopen_future_plan_settlement(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  uid uuid:=auth.uid();
  st public.future_plan_settlements%rowtype;
  recurrence_value text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.has_devinx_access() then raise exception 'access blocked'; end if;
  select * into st from public.future_plan_settlements where id=p_settlement_id and user_id=uid for update;
  if not found then raise exception 'settlement not found'; end if;
  select recurrence into recurrence_value from public.future_plans where id=st.plan_id;

  if st.reserve_entry_id is not null then delete from public.reserve_entries where id=st.reserve_entry_id and user_id=uid; end if;
  delete from public.transactions where id=st.transaction_id and user_id=uid;
  delete from public.future_plan_settlements where id=st.id;
  if recurrence_value='once' then update public.future_plans set is_active=true,updated_at=now() where id=st.plan_id; end if;
end;
$$;

create or replace function public.record_reserve_entry(
  p_kind text,
  p_amount_minor bigint,
  p_occurred_on date default current_date,
  p_note text default null
) returns uuid
language plpgsql
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  current_balance bigint;
  committed_balance bigint;
  free_balance bigint;
  new_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('deposit','withdraw') then raise exception 'invalid reserve kind'; end if;
  if p_amount_minor is null or p_amount_minor<=0 then raise exception 'invalid amount'; end if;

  select coalesce(sum(case when kind='deposit' then amount_minor else -amount_minor end),0)
    into current_balance
  from public.reserve_entries
  where user_id=uid;

  select coalesce(sum(case when re.kind='deposit' then re.amount_minor else -re.amount_minor end),0)
    into committed_balance
  from public.reserve_entries re
  join public.future_plans fp on fp.id=re.future_plan_id
  where re.user_id=uid and fp.user_id=uid and fp.is_active=true and fp.reserve_enabled=true;

  free_balance:=greatest(0,current_balance-greatest(0,committed_balance));

  if p_kind='withdraw' and p_amount_minor>free_balance then
    raise exception 'insufficient free reserve';
  end if;

  insert into public.reserve_entries(user_id,kind,amount_minor,occurred_on,note)
  values(uid,p_kind,p_amount_minor,coalesce(p_occurred_on,current_date),nullif(trim(p_note),''))
  returning id into new_id;
  return new_id;
end;
$$;

grant select,insert,update,delete on public.future_plans to authenticated;
grant select on public.future_plan_settlements to authenticated;
grant execute on function public.record_future_plan_reserve(uuid,bigint,date) to authenticated;
grant execute on function public.settle_future_plan(uuid,date,bigint,date) to authenticated;
grant execute on function public.reopen_future_plan_settlement(uuid) to authenticated;

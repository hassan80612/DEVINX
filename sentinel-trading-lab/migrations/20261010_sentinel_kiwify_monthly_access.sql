-- Sentinel paid membership: 1 confirmed, one-time Kiwify payment = 30-day access.
-- Apply only with the coordinated product release. No existing accounts altered on migration.
-- Private ledger; only a service-role-authenticated, signature-verified webhook may mutate it.
create table if not exists sentinel_app.kiwify_monthly_orders (
  order_id text primary key,
  product_id text not null,
  customer_email text not null,
  status text not null check (status in ('paid','refunded','chargeback')),
  approved_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  changed_at timestamptz not null default now()
);
create index if not exists sentinel_kiwify_monthly_orders_email_idx
  on sentinel_app.kiwify_monthly_orders (customer_email, approved_at, order_id);
alter table sentinel_app.kiwify_monthly_orders enable row level security;
revoke all on sentinel_app.kiwify_monthly_orders from public, anon, authenticated;

create or replace function sentinel_app.sync_kiwify_monthly_access(p_email text)
returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
  v_email text := lower(trim(coalesce(p_email,'')));
  v_expires timestamptz;
  v_started timestamptz;
  v_row record;
  v_account sentinel_app.accounts%rowtype;
  v_count integer := 0;
begin
  -- Serialize payment and signup reconciliation for the same customer email.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sentinel-monthly:' || v_email, 0));
  select * into v_account from sentinel_app.accounts
   where lower(email)=v_email and status='active' limit 1 for update;
  if not found then
    return jsonb_build_object('ok',true,'matched',false);
  end if;
  if v_account.role='master' or exists (
      select 1 from sentinel_app.master_owner where account_id=v_account.id
    ) then
    return jsonb_build_object('ok',true,'matched',true,'master',true);
  end if;
  for v_row in
    select approved_at from sentinel_app.kiwify_monthly_orders
    where customer_email=v_email and status='paid'
    order by approved_at asc,order_id asc
  loop
    v_started:=case when v_expires is null or v_expires<v_row.approved_at
                    then v_row.approved_at else v_expires end;
    v_expires:=v_started + interval '30 days';
    v_count:=v_count+1;
  end loop;
  if v_count>0 then
    update sentinel_app.accounts set
      agent_enabled=(v_expires>now()),
      access_expires_at=v_expires,
      plan='sentinel_monthly',
      updated_at=now()
    where id=v_account.id;
  elsif v_account.plan='sentinel_monthly' then
    -- A refund/chargeback without another paid order immediately removes access.
    update sentinel_app.accounts
    set agent_enabled=false,access_expires_at=now(),updated_at=now()
    where id=v_account.id;
  end if;
  return jsonb_build_object('ok',true,'matched',true,'paidOrders',v_count,
     'accessActive',coalesce(v_expires>now(),false),
     'expiresAt',v_expires);
end
$fn$;
revoke all on function sentinel_app.sync_kiwify_monthly_access(text) from public, anon, authenticated;

create or replace function sentinel_app.kiwify_reconcile_signup()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
  if new.role<>'master' then
    perform sentinel_app.sync_kiwify_monthly_access(new.email);
  end if;
  return new;
end
$fn$;
drop trigger if exists sentinel_kiwify_reconcile_signup on sentinel_app.accounts;
create trigger sentinel_kiwify_reconcile_signup
after insert on sentinel_app.accounts
for each row execute function sentinel_app.kiwify_reconcile_signup();
revoke all on function sentinel_app.kiwify_reconcile_signup() from public, anon, authenticated;

create or replace function public.sentinel_kiwify_monthly_payment(
  p_order_id text,p_product_id text,p_customer_email text,p_event text
) returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
  v_email text := lower(trim(coalesce(p_customer_email,'')));
  v_order text := trim(coalesce(p_order_id,''));
  v_event text := lower(trim(coalesce(p_event,'')));
  v_existing sentinel_app.kiwify_monthly_orders%rowtype;
  v_current_email text;
  v_result jsonb;
begin
  if p_product_id is distinct from 'c05e1f00-c469-11f1-8fdf-3f2670dd515f'
      or length(v_order)<8 or length(v_order)>128 or
      v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
      or length(v_email)>254 or
      v_event not in ('paid','refunded','chargeback') then
    return jsonb_build_object('ok',false,'error','invalid_purchase');
  end if;
  -- The order ID is authoritative; a retry cannot grant another 30 days.
  insert into sentinel_app.kiwify_monthly_orders(order_id,product_id,customer_email,status)
  values(v_order,p_product_id,v_email,v_event)
  on conflict (order_id) do nothing;
  select * into v_existing from sentinel_app.kiwify_monthly_orders
    where order_id=v_order for update;
  if v_existing.product_id<>p_product_id or v_existing.customer_email<>v_email then
    return jsonb_build_object('ok',false,'error','conflicting_order');
  end if;
  -- Reversals are terminal: stale approval replays never restore refunded access.
  if v_event in ('refunded','chargeback') and v_existing.status='paid' then
    update sentinel_app.kiwify_monthly_orders
       set status=v_event, changed_at=now()
       where order_id=v_order;
  elsif v_event='chargeback' and v_existing.status='refunded' then
    update sentinel_app.kiwify_monthly_orders
       set status='chargeback',changed_at=now()
       where order_id=v_order;
  end if;
  v_result:=sentinel_app.sync_kiwify_monthly_access(v_email);
  return v_result || jsonb_build_object('orderId',v_order,'accepted',true);
end
$fn$;

-- This security-definer RPC is never accessible with the public anon key.
revoke all on function public.sentinel_kiwify_monthly_payment(text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.sentinel_kiwify_monthly_payment(text,text,text,text)
  to service_role;

-- International one-time Kiwify access passes.
-- Brazil keeps its recurring subscription flow unchanged.

alter table public.devinx_integration_settings
  add column if not exists kiwify_international_product_id text;

alter table public.devinx_integration_settings
  add column if not exists kiwify_international_token_hash text;

update public.devinx_integration_settings
set kiwify_international_product_id='abf1b7b0-b75e-11f1-b984-a1fb5dadf988',
    kiwify_checkout_url='https://pay.kiwify.com.br/S2uuSUA',
    updated_at=now()
where singleton=true;

update public.devinx_settings
set checkout_url='https://pay.kiwify.com.br/S2uuSUA',
    updated_at=now()
where singleton=true;

create table if not exists public.devinx_kiwify_pass_orders (
  order_id text primary key,
  email text not null,
  full_name text,
  product_id text not null,
  event_type text,
  order_status text,
  status text not null check (status in ('approved','refunded','chargeback','pending')),
  amount_minor bigint,
  currency_code text not null default 'USD',
  duration_days integer check (duration_days between 1 and 3660),
  plan_name text,
  approved_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists devinx_kiwify_pass_orders_email_idx
  on public.devinx_kiwify_pass_orders(email);

create index if not exists devinx_kiwify_pass_orders_approved_idx
  on public.devinx_kiwify_pass_orders(email,approved_at)
  where status='approved';

alter table public.devinx_kiwify_pass_orders enable row level security;
revoke all on table public.devinx_kiwify_pass_orders from anon,authenticated;

create table if not exists public.devinx_kiwify_pass_access (
  email text primary key,
  full_name text,
  has_access boolean not null default false,
  access_until timestamptz,
  plan_name text,
  amount_minor bigint,
  currency_code text not null default 'USD',
  last_order_id text,
  last_event_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists devinx_kiwify_pass_access_until_idx
  on public.devinx_kiwify_pass_access(access_until);

alter table public.devinx_kiwify_pass_access enable row level security;
revoke all on table public.devinx_kiwify_pass_access from anon,authenticated;

create or replace function public.recompute_devinx_kiwify_pass_access(p_email text)
returns timestamptz
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_until timestamptz;
  v_row record;
  v_latest public.devinx_kiwify_pass_orders%rowtype;
begin
  if v_email='' then return null; end if;

  v_until:=null;
  for v_row in
    select approved_at,duration_days
    from public.devinx_kiwify_pass_orders
    where email=v_email
      and status='approved'
      and approved_at is not null
      and duration_days is not null
    order by approved_at,order_id
  loop
    if v_until is null then
      v_until:=v_row.approved_at+make_interval(days=>v_row.duration_days);
    else
      v_until:=greatest(v_until,v_row.approved_at)+make_interval(days=>v_row.duration_days);
    end if;
  end loop;

  select * into v_latest
  from public.devinx_kiwify_pass_orders
  where email=v_email
  order by updated_at desc,created_at desc,order_id desc
  limit 1;

  if v_latest.order_id is null then
    delete from public.devinx_kiwify_pass_access where email=v_email;
    return null;
  end if;

  insert into public.devinx_kiwify_pass_access(
    email,full_name,has_access,access_until,plan_name,amount_minor,currency_code,
    last_order_id,last_event_at,created_at,updated_at
  ) values(
    v_email,v_latest.full_name,coalesce(v_until>now(),false),v_until,
    v_latest.plan_name,v_latest.amount_minor,coalesce(v_latest.currency_code,'USD'),
    v_latest.order_id,now(),now(),now()
  )
  on conflict(email) do update set
    full_name=coalesce(excluded.full_name,devinx_kiwify_pass_access.full_name),
    has_access=excluded.has_access,
    access_until=excluded.access_until,
    plan_name=coalesce(excluded.plan_name,devinx_kiwify_pass_access.plan_name),
    amount_minor=coalesce(excluded.amount_minor,devinx_kiwify_pass_access.amount_minor),
    currency_code=coalesce(excluded.currency_code,devinx_kiwify_pass_access.currency_code,'USD'),
    last_order_id=excluded.last_order_id,
    last_event_at=now(),
    updated_at=now();

  return v_until;
end;
$$;

revoke all on function public.recompute_devinx_kiwify_pass_access(text) from public,anon,authenticated;

create or replace function public.process_kiwify_international_purchase(p_payload jsonb,p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  v_expected_hash text;
  v_expected_product text;
  v_product_id text;
  v_email text;
  v_name text;
  v_event text;
  v_order_status text;
  v_order_id text;
  v_amount_text text;
  v_amount bigint;
  v_currency text;
  v_duration_days integer;
  v_plan_name text;
  v_is_approved boolean:=false;
  v_is_revoked boolean:=false;
  v_revoke_status text;
  v_access_until timestamptz;
  v_existing public.devinx_kiwify_pass_orders%rowtype;
begin
  select kiwify_international_token_hash,kiwify_international_product_id
    into v_expected_hash,v_expected_product
  from public.devinx_integration_settings
  where singleton=true;

  if v_expected_hash is null or p_token_hash is distinct from v_expected_hash then
    raise exception 'webhook unauthorized';
  end if;

  v_product_id:=coalesce(
    p_payload#>>'{Product,product_id}',
    p_payload->>'product_id',
    p_payload#>>'{product,product_id}',
    p_payload#>>'{product,id}',
    p_payload#>>'{order,product_id}'
  );

  if v_product_id is null or v_product_id is distinct from v_expected_product then
    return jsonb_build_object('ok',true,'ignored','product');
  end if;

  v_email:=lower(trim(coalesce(
    p_payload#>>'{Customer,email}',
    p_payload#>>'{customer,email}',
    p_payload->>'email',
    ''
  )));
  if v_email='' then raise exception 'customer email missing'; end if;

  v_name:=nullif(trim(coalesce(
    p_payload#>>'{Customer,full_name}',
    p_payload#>>'{Customer,first_name}',
    p_payload#>>'{customer,full_name}',
    p_payload#>>'{customer,first_name}',
    ''
  )),'');
  v_event:=lower(coalesce(
    p_payload->>'webhook_event_type',
    p_payload->>'event_type',
    p_payload->>'event',
    ''
  ));
  v_order_status:=lower(coalesce(
    p_payload->>'order_status',
    p_payload#>>'{order,status}',
    p_payload#>>'{Order,status}',
    ''
  ));
  v_order_id:=nullif(coalesce(
    p_payload->>'order_id',
    p_payload->>'order_ref',
    p_payload#>>'{order,id}',
    p_payload#>>'{order,order_id}',
    p_payload#>>'{Order,order_id}',
    ''
  ),'');

  if v_order_id is null then raise exception 'order id missing'; end if;

  v_currency:=upper(nullif(coalesce(
    p_payload#>>'{Commissions,currency}',
    p_payload#>>'{Commissions,product_base_price_currency}',
    p_payload#>>'{commissions,currency}',
    p_payload#>>'{commissions,product_base_price_currency}',
    'USD'
  ),''));

  v_amount_text:=nullif(trim(coalesce(
    p_payload#>>'{Commissions,charge_amount}',
    p_payload#>>'{Commissions,product_base_price}',
    p_payload#>>'{commissions,charge_amount}',
    p_payload#>>'{commissions,product_base_price}',
    ''
  )),'');
  v_amount:=null;

  if v_amount_text is not null and v_amount_text~'^[0-9]+$' then
    v_amount:=v_amount_text::bigint;
  elsif v_amount_text is not null and replace(v_amount_text,',','.')~'^[0-9]+[.][0-9]{1,2}$' then
    v_amount:=round((replace(v_amount_text,',','.')::numeric)*100)::bigint;
  end if;

  case v_amount
    when 500 then v_duration_days:=30; v_plan_name:='Monthly';
    when 1290 then v_duration_days:=90; v_plan_name:='Quarterly';
    when 2290 then v_duration_days:=180; v_plan_name:='Semiannual';
    when 3790 then v_duration_days:=365; v_plan_name:='Annual';
    else v_duration_days:=null; v_plan_name:=null;
  end case;

  v_is_approved:=
    v_event in ('order_approved','compra_aprovada','order_paid','purchase_approved')
    or v_order_status in ('paid','approved');

  v_is_revoked:=
    v_event in ('order_refunded','compra_reembolsada','chargeback','order_chargeback')
    or v_order_status in ('refunded','chargedback','chargeback');

  select * into v_existing
  from public.devinx_kiwify_pass_orders
  where order_id=v_order_id;

  if v_is_revoked then
    v_revoke_status:=case
      when v_event in ('chargeback','order_chargeback') or v_order_status in ('chargedback','chargeback')
        then 'chargeback'
      else 'refunded'
    end;

    if v_existing.order_id is null and v_duration_days is null then
      return jsonb_build_object('ok',true,'ignored','unknown_order');
    end if;

    insert into public.devinx_kiwify_pass_orders(
      order_id,email,full_name,product_id,event_type,order_status,status,
      amount_minor,currency_code,duration_days,plan_name,approved_at,revoked_at,created_at,updated_at
    ) values(
      v_order_id,v_email,v_name,v_product_id,v_event,v_order_status,v_revoke_status,
      v_amount,coalesce(v_currency,'USD'),v_duration_days,v_plan_name,null,now(),now(),now()
    )
    on conflict(order_id) do update set
      email=excluded.email,
      full_name=coalesce(excluded.full_name,devinx_kiwify_pass_orders.full_name),
      product_id=excluded.product_id,
      event_type=excluded.event_type,
      order_status=excluded.order_status,
      status=excluded.status,
      amount_minor=coalesce(excluded.amount_minor,devinx_kiwify_pass_orders.amount_minor),
      currency_code=coalesce(excluded.currency_code,devinx_kiwify_pass_orders.currency_code,'USD'),
      duration_days=coalesce(excluded.duration_days,devinx_kiwify_pass_orders.duration_days),
      plan_name=coalesce(excluded.plan_name,devinx_kiwify_pass_orders.plan_name),
      revoked_at=now(),
      updated_at=now();

    v_access_until:=public.recompute_devinx_kiwify_pass_access(v_email);
    return jsonb_build_object(
      'ok',true,'email',v_email,'event',v_event,'access',coalesce(v_access_until>now(),false),
      'access_until',v_access_until,'plan',coalesce(v_plan_name,v_existing.plan_name)
    );
  end if;

  if not v_is_approved then
    return jsonb_build_object('ok',true,'ignored','event','event',v_event);
  end if;

  if v_duration_days is null then
    return jsonb_build_object('ok',true,'ignored','price','amount_minor',v_amount,'currency',v_currency);
  end if;

  insert into public.devinx_kiwify_pass_orders(
    order_id,email,full_name,product_id,event_type,order_status,status,
    amount_minor,currency_code,duration_days,plan_name,approved_at,revoked_at,created_at,updated_at
  ) values(
    v_order_id,v_email,v_name,v_product_id,v_event,v_order_status,'approved',
    v_amount,coalesce(v_currency,'USD'),v_duration_days,v_plan_name,now(),null,now(),now()
  )
  on conflict(order_id) do update set
    email=excluded.email,
    full_name=coalesce(excluded.full_name,devinx_kiwify_pass_orders.full_name),
    product_id=excluded.product_id,
    event_type=excluded.event_type,
    order_status=excluded.order_status,
    status=case
      when devinx_kiwify_pass_orders.status in ('refunded','chargeback')
        then devinx_kiwify_pass_orders.status
      else 'approved'
    end,
    amount_minor=excluded.amount_minor,
    currency_code=coalesce(excluded.currency_code,'USD'),
    duration_days=excluded.duration_days,
    plan_name=excluded.plan_name,
    approved_at=coalesce(devinx_kiwify_pass_orders.approved_at,now()),
    revoked_at=case
      when devinx_kiwify_pass_orders.status in ('refunded','chargeback')
        then devinx_kiwify_pass_orders.revoked_at
      else null
    end,
    updated_at=now();

  v_access_until:=public.recompute_devinx_kiwify_pass_access(v_email);

  return jsonb_build_object(
    'ok',true,'email',v_email,'event',v_event,'access',coalesce(v_access_until>now(),false),
    'access_until',v_access_until,'plan',v_plan_name,'duration_days',v_duration_days
  );
end;
$$;

revoke all on function public.process_kiwify_international_purchase(jsonb,text) from public;
grant execute on function public.process_kiwify_international_purchase(jsonb,text) to anon,authenticated;

create or replace function public.has_devinx_access()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public','auth'
as $$
declare
  v_uid uuid:=auth.uid();
  v_email text;
  v_ent public.devinx_access_entitlements%rowtype;
  v_grant public.devinx_email_access_grants%rowtype;
begin
  if v_uid is null then return false; end if;
  if exists(select 1 from public.devinx_admin_users where user_id=v_uid) then return true; end if;
  if not coalesce((select subscription_required from public.devinx_settings where singleton=true),false) then return true; end if;

  select * into v_ent from public.devinx_access_entitlements where user_id=v_uid;
  if found and v_ent.source='manual' then
    return v_ent.status='active' and (v_ent.expires_at is null or v_ent.expires_at>now());
  end if;

  select lower(email) into v_email from auth.users where id=v_uid;
  select * into v_grant from public.devinx_email_access_grants where email=v_email;
  if found then
    return v_grant.status='active' and (v_grant.expires_at is null or v_grant.expires_at>now());
  end if;

  if v_ent.user_id is not null
     and v_ent.status='active'
     and v_ent.expires_at is not null
     and v_ent.expires_at>now() then
    return true;
  end if;

  if exists(
    select 1
    from public.devinx_kiwify_subscriptions
    where email=v_email
      and has_access=true
      and access_until is not null
      and access_until>now()
  ) then
    return true;
  end if;

  if exists(
    select 1
    from public.devinx_kiwify_pass_access
    where email=v_email
      and has_access=true
      and access_until is not null
      and access_until>now()
  ) then
    return true;
  end if;

  return exists(
    select 1
    from public.devinx_trial_claims
    where user_id=v_uid
      and expires_at>now()
  );
end;
$$;

create or replace function public.get_devinx_access_status()
returns table(
  is_admin boolean,
  allowed boolean,
  status text,
  source text,
  expires_at timestamptz,
  subscription_required boolean,
  checkout_url text
)
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  v_uid uuid:=auth.uid();
  v_admin boolean;
  v_required boolean;
  v_checkout text;
  v_email text;
  v_ent public.devinx_access_entitlements%rowtype;
  v_grant public.devinx_email_access_grants%rowtype;
  v_k public.devinx_kiwify_subscriptions%rowtype;
  v_pass public.devinx_kiwify_pass_access%rowtype;
  v_trial public.devinx_trial_claims%rowtype;
  v_status text:='none';
  v_source text:='none';
  v_expires timestamptz;
  v_allowed boolean:=false;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  v_admin:=exists(select 1 from public.devinx_admin_users where user_id=v_uid);
  select lower(email) into v_email from auth.users where id=v_uid;

  select coalesce(ds.subscription_required,false),coalesce(ds.checkout_url,di.kiwify_checkout_url)
    into v_required,v_checkout
  from public.devinx_settings ds
  left join public.devinx_integration_settings di on di.singleton=true
  where ds.singleton=true;

  select * into v_ent from public.devinx_access_entitlements where user_id=v_uid;

  if v_ent.user_id is not null and v_ent.source='manual' then
    v_status:=v_ent.status;
    v_source:='manual';
    v_expires:=v_ent.expires_at;
  else
    select * into v_grant from public.devinx_email_access_grants where email=v_email;
    if found then
      v_status:=v_grant.status;
      v_source:='manual';
      v_expires:=v_grant.expires_at;
    else
      select * into v_k from public.devinx_kiwify_subscriptions where email=v_email limit 1;
      select * into v_pass from public.devinx_kiwify_pass_access where email=v_email limit 1;
      select * into v_trial from public.devinx_trial_claims where user_id=v_uid;

      if v_ent.user_id is not null
         and v_ent.status='active'
         and v_ent.expires_at is not null
         and v_ent.expires_at>now() then
        v_status:='active';
        v_source:=coalesce(v_ent.source,'account');
        v_expires:=v_ent.expires_at;
      elsif v_k.email is not null
         and v_k.has_access
         and v_k.access_until is not null
         and v_k.access_until>now() then
        v_status:='active';
        v_source:='kiwify';
        v_expires:=v_k.access_until;
      elsif v_pass.email is not null
         and v_pass.has_access
         and v_pass.access_until is not null
         and v_pass.access_until>now() then
        v_status:='active';
        v_source:='kiwify_pass';
        v_expires:=v_pass.access_until;
      elsif v_trial.id is not null and v_trial.expires_at>now() then
        v_status:='active';
        v_source:='trial';
        v_expires:=v_trial.expires_at;
      elsif v_trial.id is not null then
        v_status:='blocked';
        v_source:='trial';
        v_expires:=v_trial.expires_at;
      elsif v_ent.user_id is not null then
        v_status:='blocked';
        v_source:=coalesce(v_ent.source,'account');
        v_expires:=v_ent.expires_at;
      elsif v_k.email is not null then
        v_status:='blocked';
        v_source:='kiwify';
        v_expires:=v_k.access_until;
      elsif v_pass.email is not null then
        v_status:='blocked';
        v_source:='kiwify_pass';
        v_expires:=v_pass.access_until;
      end if;
    end if;
  end if;

  v_allowed:=v_admin or not v_required or (
    v_status='active' and (
      (v_source='manual' and (v_expires is null or v_expires>now()))
      or (v_source<>'manual' and v_expires is not null and v_expires>now())
    )
  );

  return query select v_admin,v_allowed,v_status,v_source,v_expires,v_required,v_checkout;
end;
$$;

create or replace function public.get_devinx_subscription_details()
returns table(
  status text,
  source text,
  plan_name text,
  amount_minor bigint,
  currency_code text,
  expires_at timestamptz,
  subscription_status text,
  canceled_at timestamptz,
  last_event_at timestamptz,
  checkout_url text
)
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  v_uid uuid:=auth.uid();
  v_email text;
  v_checkout text;
  v_ent public.devinx_access_entitlements%rowtype;
  v_grant public.devinx_email_access_grants%rowtype;
  v_k public.devinx_kiwify_subscriptions%rowtype;
  v_pass public.devinx_kiwify_pass_access%rowtype;
  v_trial public.devinx_trial_claims%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select lower(email) into v_email from auth.users where id=v_uid;
  select coalesce(ds.checkout_url,di.kiwify_checkout_url)
    into v_checkout
  from public.devinx_settings ds
  left join public.devinx_integration_settings di on di.singleton=true
  where ds.singleton=true;

  select * into v_ent from public.devinx_access_entitlements where user_id=v_uid;
  select * into v_grant from public.devinx_email_access_grants where email=v_email;
  select * into v_k from public.devinx_kiwify_subscriptions where email=v_email limit 1;
  select * into v_pass from public.devinx_kiwify_pass_access where email=v_email limit 1;
  select * into v_trial from public.devinx_trial_claims where user_id=v_uid;

  if v_ent.user_id is not null and v_ent.source='manual' then
    return query select v_ent.status,'manual'::text,v_ent.plan_name,v_ent.amount_minor,
      coalesce(v_ent.currency_code,'BRL'),v_ent.expires_at,null::text,v_ent.canceled_at,v_ent.updated_at,v_checkout;
  elsif v_grant.email is not null then
    return query select v_grant.status,'manual'::text,null::text,null::bigint,
      'BRL'::text,v_grant.expires_at,null::text,null::timestamptz,v_grant.updated_at,v_checkout;
  elsif v_k.email is not null and v_k.has_access and v_k.access_until is not null and v_k.access_until>now() then
    return query select 'active'::text,'kiwify'::text,v_k.plan_name,v_k.amount_minor,
      coalesce(v_k.currency_code,'BRL'),v_k.access_until,v_k.subscription_status,v_k.canceled_at,v_k.last_event_at,v_checkout;
  elsif v_pass.email is not null and v_pass.has_access and v_pass.access_until is not null and v_pass.access_until>now() then
    return query select 'active'::text,'kiwify_pass'::text,v_pass.plan_name,v_pass.amount_minor,
      coalesce(v_pass.currency_code,'USD'),v_pass.access_until,null::text,null::timestamptz,v_pass.last_event_at,v_checkout;
  elsif v_ent.user_id is not null and v_ent.status='active' and v_ent.expires_at is not null and v_ent.expires_at>now() then
    return query select 'active'::text,v_ent.source,v_ent.plan_name,v_ent.amount_minor,
      coalesce(v_ent.currency_code,'BRL'),v_ent.expires_at,null::text,v_ent.canceled_at,v_ent.updated_at,v_checkout;
  elsif v_trial.id is not null and v_trial.expires_at>now() then
    return query select 'active'::text,'trial'::text,'Teste grátis'::text,null::bigint,
      'BRL'::text,v_trial.expires_at,null::text,null::timestamptz,v_trial.started_at,v_checkout;
  elsif v_k.email is not null then
    return query select 'blocked'::text,'kiwify'::text,v_k.plan_name,v_k.amount_minor,
      coalesce(v_k.currency_code,'BRL'),v_k.access_until,v_k.subscription_status,v_k.canceled_at,v_k.last_event_at,v_checkout;
  elsif v_pass.email is not null then
    return query select 'blocked'::text,'kiwify_pass'::text,v_pass.plan_name,v_pass.amount_minor,
      coalesce(v_pass.currency_code,'USD'),v_pass.access_until,null::text,null::timestamptz,v_pass.last_event_at,v_checkout;
  elsif v_ent.user_id is not null then
    return query select 'blocked'::text,v_ent.source,v_ent.plan_name,v_ent.amount_minor,
      coalesce(v_ent.currency_code,'BRL'),v_ent.expires_at,null::text,v_ent.canceled_at,v_ent.updated_at,v_checkout;
  elsif v_trial.id is not null then
    return query select 'blocked'::text,'trial'::text,'Teste grátis'::text,null::bigint,
      'BRL'::text,v_trial.expires_at,null::text,null::timestamptz,v_trial.started_at,v_checkout;
  else
    return query select 'none'::text,'none'::text,null::text,null::bigint,
      'BRL'::text,null::timestamptz,null::text,null::timestamptz,null::timestamptz,v_checkout;
  end if;
end;
$$;

create or replace function public.admin_list_devinx_customers()
returns table(
  email text,
  user_id uuid,
  account_exists boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  onboarded_at timestamptz,
  access_status text,
  access_source text,
  expires_at timestamptz,
  is_admin boolean,
  manual_grant boolean,
  kiwify_customer boolean,
  kiwify_status text,
  plan_name text,
  amount_minor bigint,
  currency_code text,
  last_event_at timestamptz
)
language sql
security definer
set search_path to 'public','auth'
as $$
with emails as (
  select lower(email) email from auth.users where email is not null
  union
  select email from public.devinx_email_access_grants
  union
  select email from public.devinx_kiwify_subscriptions
  union
  select email from public.devinx_kiwify_pass_access
),
base as (
  select
    e.email,
    u.id as user_id,
    (u.id is not null) as account_exists,
    u.created_at,
    u.last_sign_in_at,
    p.onboarded_at,
    ent.status as ent_status,
    ent.source as ent_source,
    ent.expires_at as ent_expires,
    g.status as grant_status,
    g.expires_at as grant_expires,
    (g.email is not null) as manual_grant,
    (k.email is not null or pa.email is not null) as kiwify_customer,
    k.subscription_status as recurring_status,
    k.has_access as kiwify_has_access,
    k.access_until as kiwify_access_until,
    pa.has_access as pass_has_access,
    pa.access_until as pass_access_until,
    k.plan_name as recurring_plan_name,
    k.amount_minor as recurring_amount_minor,
    k.currency_code as recurring_currency_code,
    k.last_event_at as recurring_last_event_at,
    pa.plan_name as pass_plan_name,
    pa.amount_minor as pass_amount_minor,
    pa.currency_code as pass_currency_code,
    pa.last_event_at as pass_last_event_at,
    tr.id as trial_id,
    tr.expires_at as trial_expires,
    exists(select 1 from public.devinx_admin_users a where a.user_id=u.id) as is_admin
  from emails e
  left join auth.users u on lower(u.email)=e.email
  left join public.profiles p on p.id=u.id
  left join public.devinx_access_entitlements ent on ent.user_id=u.id
  left join public.devinx_email_access_grants g on g.email=e.email
  left join public.devinx_kiwify_subscriptions k on k.email=e.email
  left join public.devinx_kiwify_pass_access pa on pa.email=e.email
  left join public.devinx_trial_claims tr on tr.user_id=u.id
)
select
  b.email,b.user_id,b.account_exists,b.created_at,b.last_sign_in_at,b.onboarded_at,
  case
    when b.ent_source='manual' then b.ent_status
    when b.manual_grant then b.grant_status
    when b.ent_status='active' and b.ent_expires is not null and b.ent_expires>now() then 'active'
    when b.kiwify_has_access and b.kiwify_access_until is not null and b.kiwify_access_until>now() then 'active'
    when b.pass_has_access and b.pass_access_until is not null and b.pass_access_until>now() then 'active'
    when b.trial_id is not null and b.trial_expires>now() then 'active'
    when b.trial_id is not null then 'blocked'
    when b.ent_status is not null then 'blocked'
    when b.kiwify_customer then 'blocked'
    else 'none'
  end::text as access_status,
  case
    when b.ent_source='manual' then 'manual'
    when b.manual_grant then 'manual'
    when b.ent_status='active' and b.ent_expires is not null and b.ent_expires>now() then coalesce(b.ent_source,'account')
    when b.kiwify_has_access and b.kiwify_access_until is not null and b.kiwify_access_until>now() then 'kiwify'
    when b.pass_has_access and b.pass_access_until is not null and b.pass_access_until>now() then 'kiwify_pass'
    when b.trial_id is not null then 'trial'
    when b.ent_status is not null then coalesce(b.ent_source,'account')
    when b.recurring_status is not null then 'kiwify'
    when b.kiwify_customer then 'kiwify_pass'
    else 'none'
  end::text as access_source,
  case
    when b.ent_source='manual' then b.ent_expires
    when b.manual_grant then b.grant_expires
    when b.ent_status='active' and b.ent_expires is not null and b.ent_expires>now() then b.ent_expires
    when b.kiwify_has_access and b.kiwify_access_until is not null and b.kiwify_access_until>now() then b.kiwify_access_until
    when b.pass_has_access and b.pass_access_until is not null and b.pass_access_until>now() then b.pass_access_until
    when b.trial_id is not null then b.trial_expires
    when b.ent_status is not null then b.ent_expires
    when b.kiwify_access_until is not null then b.kiwify_access_until
    else b.pass_access_until
  end as expires_at,
  b.is_admin,
  b.manual_grant,
  b.kiwify_customer,
  case
    when b.kiwify_has_access and b.kiwify_access_until is not null and b.kiwify_access_until>now()
      then b.recurring_status
    when b.pass_has_access and b.pass_access_until is not null and b.pass_access_until>now()
      then 'prepaid'
    else coalesce(b.recurring_status,case when b.pass_plan_name is not null then 'prepaid' end)
  end::text as kiwify_status,
  case
    when b.kiwify_has_access and b.kiwify_access_until is not null and b.kiwify_access_until>now()
      then b.recurring_plan_name
    when b.pass_has_access and b.pass_access_until is not null and b.pass_access_until>now()
      then b.pass_plan_name
    else coalesce(b.recurring_plan_name,b.pass_plan_name)
  end::text as plan_name,
  case
    when b.kiwify_has_access and b.kiwify_access_until is not null and b.kiwify_access_until>now()
      then b.recurring_amount_minor
    when b.pass_has_access and b.pass_access_until is not null and b.pass_access_until>now()
      then b.pass_amount_minor
    else coalesce(b.recurring_amount_minor,b.pass_amount_minor)
  end::bigint as amount_minor,
  case
    when b.kiwify_has_access and b.kiwify_access_until is not null and b.kiwify_access_until>now()
      then b.recurring_currency_code
    when b.pass_has_access and b.pass_access_until is not null and b.pass_access_until>now()
      then b.pass_currency_code
    else coalesce(b.recurring_currency_code,b.pass_currency_code)
  end::text as currency_code,
  greatest(
    coalesce(b.recurring_last_event_at,'epoch'::timestamptz),
    coalesce(b.pass_last_event_at,'epoch'::timestamptz)
  ) as last_event_at
from base b
where public.is_devinx_admin()
order by greatest(
  coalesce(b.recurring_last_event_at,'epoch'::timestamptz),
  coalesce(b.pass_last_event_at,'epoch'::timestamptz),
  coalesce(b.last_sign_in_at,'epoch'::timestamptz),
  coalesce(b.created_at,'epoch'::timestamptz)
) desc,b.email;
$$;


create or replace function public.admin_sync_kiwify_international_integration(
  p_token_hash text,
  p_product_id text
)
returns void
language plpgsql
security definer
set search_path to 'public','auth'
as $$
begin
  if not public.is_devinx_admin() then
    raise exception 'not authorized';
  end if;
  if coalesce(length(trim(p_token_hash)),0) < 32 then
    raise exception 'invalid token hash';
  end if;
  if coalesce(length(trim(p_product_id)),0) < 10 then
    raise exception 'invalid product id';
  end if;

  update public.devinx_integration_settings
  set kiwify_international_token_hash=p_token_hash,
      kiwify_international_product_id=p_product_id,
      updated_at=now()
  where singleton=true;
end;
$$;

revoke all on function public.admin_sync_kiwify_international_integration(text,text) from public,anon;
grant execute on function public.admin_sync_kiwify_international_integration(text,text) to authenticated;

create or replace function public.record_kiwify_webhook_attempt(
  p_token_hash text,
  p_outcome text,
  p_event_type text default null,
  p_product_id text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_expected_brazil text;
  v_expected_international text;
begin
  select kiwify_token_hash,kiwify_international_token_hash
    into v_expected_brazil,v_expected_international
  from public.devinx_integration_settings
  where singleton=true;

  if p_token_hash is distinct from v_expected_brazil
     and p_token_hash is distinct from v_expected_international then
    raise exception 'unauthorized';
  end if;

  if p_outcome not in ('received','accepted','ignored','error') then
    raise exception 'invalid outcome';
  end if;

  insert into public.devinx_kiwify_webhook_attempts(outcome,event_type,product_id,note)
  values(p_outcome,nullif(p_event_type,''),nullif(p_product_id,''),left(nullif(p_note,''),300));
end;
$$;

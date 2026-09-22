-- Three-day free trial with one claim per account and browser/device token.
-- Trial authorization stays in the same central access layer used by subscriptions.

alter table public.devinx_settings
  add column if not exists trial_enabled boolean not null default true,
  add column if not exists trial_days integer not null default 3,
  add column if not exists trial_eligible_from timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='devinx_settings_trial_days_check'
      and conrelid='public.devinx_settings'::regclass
  ) then
    alter table public.devinx_settings
      add constraint devinx_settings_trial_days_check
      check (trial_days between 1 and 30);
  end if;
end
$$;

update public.devinx_settings
set trial_enabled=true,
    trial_days=3,
    updated_at=now()
where singleton=true;

create table if not exists public.devinx_trial_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  device_hash text not null unique,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint devinx_trial_claims_device_hash_check check (device_hash ~ '^[0-9a-f]{64}$'),
  constraint devinx_trial_claims_expiry_check check (expires_at > started_at)
);

alter table public.devinx_trial_claims enable row level security;

revoke all on table public.devinx_trial_claims from anon;
revoke insert,update,delete on table public.devinx_trial_claims from authenticated;
grant select on table public.devinx_trial_claims to authenticated;

drop policy if exists devinx_trial_claims_select_own on public.devinx_trial_claims;
create policy devinx_trial_claims_select_own
on public.devinx_trial_claims
for select
to authenticated
using ((select auth.uid())=user_id);

create or replace function public.claim_devinx_trial(p_device_hash text)
returns table(
  claimed boolean,
  allowed boolean,
  reason text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  v_uid uuid:=auth.uid();
  v_email text;
  v_created_at timestamptz;
  v_enabled boolean;
  v_days integer;
  v_eligible_from timestamptz;
  v_existing public.devinx_trial_claims%rowtype;
  v_expires timestamptz;
  v_manual public.devinx_access_entitlements%rowtype;
  v_grant public.devinx_email_access_grants%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$' then
    return query select false,false,'invalid_device'::text,null::timestamptz;
    return;
  end if;

  select lower(email),created_at
    into v_email,v_created_at
  from auth.users
  where id=v_uid;

  if v_created_at is null then
    return query select false,false,'user_not_found'::text,null::timestamptz;
    return;
  end if;

  select trial_enabled,trial_days,trial_eligible_from
    into v_enabled,v_days,v_eligible_from
  from public.devinx_settings
  where singleton=true;

  if not coalesce(v_enabled,false) then
    return query select false,false,'trial_disabled'::text,null::timestamptz;
    return;
  end if;

  if v_created_at < coalesce(v_eligible_from,'infinity'::timestamptz) then
    return query select false,false,'not_new_user'::text,null::timestamptz;
    return;
  end if;

  select * into v_manual
  from public.devinx_access_entitlements
  where user_id=v_uid and source='manual';

  if found then
    return query
      select false,
             (v_manual.status='active' and (v_manual.expires_at is null or v_manual.expires_at>now())),
             case when v_manual.status='active' then 'manual_access' else 'manual_blocked' end::text,
             v_manual.expires_at;
    return;
  end if;

  select * into v_grant
  from public.devinx_email_access_grants
  where email=v_email;

  if found then
    return query
      select false,
             (v_grant.status='active' and (v_grant.expires_at is null or v_grant.expires_at>now())),
             case when v_grant.status='active' then 'manual_access' else 'manual_blocked' end::text,
             v_grant.expires_at;
    return;
  end if;

  select * into v_existing
  from public.devinx_trial_claims
  where user_id=v_uid;

  if found then
    return query
      select false,
             v_existing.expires_at>now(),
             case when v_existing.expires_at>now() then 'already_claimed' else 'trial_expired' end::text,
             v_existing.expires_at;
    return;
  end if;

  if public.has_devinx_access() then
    return query select false,true,'already_has_access'::text,null::timestamptz;
    return;
  end if;

  v_expires:=now()+make_interval(days=>greatest(1,least(coalesce(v_days,3),30)));

  begin
    insert into public.devinx_trial_claims(user_id,device_hash,started_at,expires_at)
    values(v_uid,p_device_hash,now(),v_expires);
  exception
    when unique_violation then
      return query select false,false,'device_already_used'::text,null::timestamptz;
      return;
  end;

  return query select true,true,'claimed'::text,v_expires;
end;
$$;

revoke all on function public.claim_devinx_trial(text) from public;
revoke all on function public.claim_devinx_trial(text) from anon;
grant execute on function public.claim_devinx_trial(text) to authenticated;

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
  elsif v_ent.user_id is not null and v_ent.status='active' and v_ent.expires_at is not null and v_ent.expires_at>now() then
    return query select 'active'::text,v_ent.source,v_ent.plan_name,v_ent.amount_minor,
      coalesce(v_ent.currency_code,'BRL'),v_ent.expires_at,null::text,v_ent.canceled_at,v_ent.updated_at,v_checkout;
  elsif v_trial.id is not null and v_trial.expires_at>now() then
    return query select 'active'::text,'trial'::text,'Teste grátis'::text,null::bigint,
      'BRL'::text,v_trial.expires_at,null::text,null::timestamptz,v_trial.started_at,v_checkout;
  elsif v_k.email is not null then
    return query select 'blocked'::text,'kiwify'::text,v_k.plan_name,v_k.amount_minor,
      coalesce(v_k.currency_code,'BRL'),v_k.access_until,v_k.subscription_status,v_k.canceled_at,v_k.last_event_at,v_checkout;
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
    (k.email is not null) as kiwify_customer,
    k.subscription_status as kiwify_status,
    k.has_access as kiwify_has_access,
    k.access_until as kiwify_access_until,
    k.plan_name,
    k.amount_minor,
    k.currency_code,
    k.last_event_at,
    tr.id as trial_id,
    tr.expires_at as trial_expires,
    exists(select 1 from public.devinx_admin_users a where a.user_id=u.id) as is_admin
  from emails e
  left join auth.users u on lower(u.email)=e.email
  left join public.profiles p on p.id=u.id
  left join public.devinx_access_entitlements ent on ent.user_id=u.id
  left join public.devinx_email_access_grants g on g.email=e.email
  left join public.devinx_kiwify_subscriptions k on k.email=e.email
  left join public.devinx_trial_claims tr on tr.user_id=u.id
)
select
  b.email,b.user_id,b.account_exists,b.created_at,b.last_sign_in_at,b.onboarded_at,
  case
    when b.ent_source='manual' then b.ent_status
    when b.manual_grant then b.grant_status
    when b.ent_status='active' and b.ent_expires is not null and b.ent_expires>now() then 'active'
    when b.kiwify_customer and b.kiwify_has_access and b.kiwify_access_until is not null and b.kiwify_access_until>now() then 'active'
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
    when b.kiwify_customer and b.kiwify_has_access and b.kiwify_access_until is not null and b.kiwify_access_until>now() then 'kiwify'
    when b.trial_id is not null then 'trial'
    when b.ent_status is not null then coalesce(b.ent_source,'account')
    when b.kiwify_customer then 'kiwify'
    else 'none'
  end::text as access_source,
  case
    when b.ent_source='manual' then b.ent_expires
    when b.manual_grant then b.grant_expires
    when b.ent_status='active' and b.ent_expires is not null and b.ent_expires>now() then b.ent_expires
    when b.kiwify_customer and b.kiwify_has_access and b.kiwify_access_until is not null and b.kiwify_access_until>now() then b.kiwify_access_until
    when b.trial_id is not null then b.trial_expires
    when b.ent_status is not null then b.ent_expires
    when b.kiwify_customer then b.kiwify_access_until
    else null
  end as expires_at,
  b.is_admin,b.manual_grant,b.kiwify_customer,b.kiwify_status,b.plan_name,b.amount_minor,b.currency_code,b.last_event_at
from base b
where public.is_devinx_admin()
order by greatest(coalesce(b.last_event_at,'epoch'::timestamptz),coalesce(b.last_sign_in_at,'epoch'::timestamptz),coalesce(b.created_at,'epoch'::timestamptz)) desc, b.email;
$$;

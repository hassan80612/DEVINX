-- Kiwify access is valid only with an explicit future expiry.
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

  return exists(
    select 1
    from public.devinx_kiwify_subscriptions
    where email=v_email
      and has_access=true
      and access_until is not null
      and access_until>now()
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
    elsif v_ent.user_id is not null then
      v_source:=v_ent.source;
      v_expires:=v_ent.expires_at;
      v_status:=case
        when v_ent.status='active' and v_ent.expires_at is not null and v_ent.expires_at>now() then 'active'
        else 'blocked'
      end;
    else
      select * into v_k from public.devinx_kiwify_subscriptions where email=v_email limit 1;
      if found then
        v_status:=case
          when v_k.has_access and v_k.access_until is not null and v_k.access_until>now() then 'active'
          else 'blocked'
        end;
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

  if v_ent.user_id is not null and v_ent.source='manual' then
    return query select v_ent.status,'manual'::text,v_ent.plan_name,v_ent.amount_minor,
      coalesce(v_ent.currency_code,'BRL'),v_ent.expires_at,null::text,v_ent.canceled_at,v_ent.updated_at,v_checkout;
  elsif v_grant.email is not null then
    return query select v_grant.status,'manual'::text,null::text,null::bigint,
      'BRL'::text,v_grant.expires_at,null::text,null::timestamptz,v_grant.updated_at,v_checkout;
  elsif v_k.email is not null then
    return query select
      case when v_k.has_access and v_k.access_until is not null and v_k.access_until>now() then 'active' else 'blocked' end,
      'kiwify'::text,
      v_k.plan_name,
      v_k.amount_minor,
      coalesce(v_k.currency_code,'BRL'),
      v_k.access_until,
      v_k.subscription_status,
      v_k.canceled_at,
      v_k.last_event_at,
      v_checkout;
  elsif v_ent.user_id is not null then
    return query select
      case
        when v_ent.status='active' and v_ent.expires_at is not null and v_ent.expires_at>now() then 'active'
        else 'blocked'
      end,
      v_ent.source,
      v_ent.plan_name,
      v_ent.amount_minor,
      coalesce(v_ent.currency_code,'BRL'),
      v_ent.expires_at,
      null::text,
      v_ent.canceled_at,
      v_ent.updated_at,
      v_checkout;
  else
    return query select 'none'::text,'none'::text,null::text,null::bigint,
      'BRL'::text,null::timestamptz,null::text,null::timestamptz,null::timestamptz,v_checkout;
  end if;
end;
$$;

update public.devinx_kiwify_subscriptions
set has_access=false,updated_at=now()
where has_access=true and access_until is null;

update public.devinx_access_entitlements
set status='blocked',canceled_at=coalesce(canceled_at,now()),updated_at=now()
where source='kiwify' and status='active' and expires_at is null;

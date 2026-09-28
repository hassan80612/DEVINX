
create or replace function public.laser_internal_current_pass_cycle(p_email text)
returns table(
  order_id text,
  plan_id text,
  cycle_started_at timestamptz,
  cycle_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'devinx_laser','public'
as $function$
declare
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_row record;
  v_cursor timestamptz;
  v_start timestamptz;
  v_end timestamptz;
begin
  if v_email='' then return; end if;

  for v_row in
    select o.order_id,o.approved_at,o.duration_days,o.plan_id
    from devinx_laser.kiwify_pass_orders o
    where o.email=v_email
      and o.status='approved'
      and o.approved_at is not null
      and o.duration_days is not null
      and o.plan_id in ('control','mentor')
    order by o.approved_at,o.order_id
  loop
    v_start:=case
      when v_cursor is null then v_row.approved_at
      else greatest(v_cursor,v_row.approved_at)
    end;
    v_end:=v_start+make_interval(days=>v_row.duration_days);

    if v_start<=now() and v_end>now() then
      return query select v_row.order_id::text,v_row.plan_id::text,v_start,v_end;
      return;
    end if;

    v_cursor:=v_end;
  end loop;
end;
$function$;

revoke all on function public.laser_internal_current_pass_cycle(text) from public,anon,authenticated;
grant execute on function public.laser_internal_current_pass_cycle(text) to service_role;

create or replace function public.laser_internal_apply_pending_intl_mentor_credits(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'devinx_laser','public','auth'
as $function$
declare
  v_email text;
  v_cycle record;
  v_ent devinx_laser.entitlements%rowtype;
  v_reset integer:=0;
begin
  select lower(email) into v_email from auth.users where id=p_user_id;
  if v_email is null then return 0; end if;

  select * into v_cycle
  from public.laser_internal_current_pass_cycle(v_email)
  limit 1;

  if not found or v_cycle.plan_id<>'mentor' then
    return 0;
  end if;

  select * into v_ent
  from devinx_laser.entitlements e
  where e.user_id=p_user_id
    and e.status='active'
    and e.plan_id='mentor'
    and e.mentor_access=true
    and e.expires_at>now()
  for update;

  if not found then return 0; end if;

  if v_ent.mentor_credits_cycle_started_at is distinct from v_cycle.cycle_started_at then
    update devinx_laser.entitlements
    set mentor_credits_balance=10,
        mentor_credits_cycle_started_at=v_cycle.cycle_started_at,
        updated_at=now()
    where user_id=p_user_id;
    v_reset:=10;
  end if;

  update devinx_laser.kiwify_pass_orders o
  set mentor_credits_applied_at=coalesce(o.mentor_credits_applied_at,now()),
      updated_at=now()
  where o.order_id=v_cycle.order_id
    and o.plan_id='mentor'
    and o.status='approved';

  return v_reset;
end;
$function$;

revoke all on function public.laser_internal_apply_pending_intl_mentor_credits(uuid) from public,anon,authenticated;
grant execute on function public.laser_internal_apply_pending_intl_mentor_credits(uuid) to service_role;

create or replace function public.laser_internal_sync_entitlement_from_purchase(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'devinx_laser','public','auth'
as $function$
declare
  v_email text;
  v_sub devinx_laser.kiwify_subscriptions%rowtype;
  v_pass devinx_laser.kiwify_pass_access%rowtype;
  v_cycle record;
  v_source_plan text;
  v_source_until timestamptz;
  v_source_started timestamptz;
  v_is_br boolean:=false;
  v_existing devinx_laser.entitlements%rowtype;
  v_existing_expired boolean:=false;
begin
  select lower(email) into v_email from auth.users where id=p_user_id;
  if v_email is null then return; end if;

  select * into v_sub
  from devinx_laser.kiwify_subscriptions s
  where s.email=v_email
    and s.has_access=true
    and (s.access_until is null or s.access_until>now());

  if found then
    v_is_br:=true;
    v_source_plan:=v_sub.plan_id;
    v_source_until:=v_sub.access_until;
    v_source_started:=coalesce(v_sub.started_at,v_sub.last_event_at,now());
  else
    perform public.recompute_laser_kiwify_pass_access(v_email);

    select * into v_pass
    from devinx_laser.kiwify_pass_access p
    where p.email=v_email
      and p.has_access=true
      and p.access_until>now();

    if not found then return; end if;

    select * into v_cycle
    from public.laser_internal_current_pass_cycle(v_email)
    limit 1;

    if not found then return; end if;

    v_source_plan:=v_cycle.plan_id;
    v_source_started:=v_cycle.cycle_started_at;
    v_source_until:=v_pass.access_until;
  end if;

  select * into v_existing
  from devinx_laser.entitlements
  where user_id=p_user_id;

  v_existing_expired:=found
    and v_existing.expires_at is not null
    and v_existing.expires_at<=now();

  if v_existing_expired then
    update devinx_laser.entitlements
    set mentor_credits_balance=0,updated_at=now()
    where user_id=p_user_id;
  end if;

  insert into devinx_laser.entitlements(
    user_id,plan_id,status,source,max_pcs,max_machines,max_mobile_devices,max_active_operators,
    starts_at,expires_at,owner_access,mentor_access,mentor_billing_mode,mentor_max_concurrent,
    provider_subscription_id,plan_name,amount_minor,currency_code,
    mentor_credits_balance,mentor_credits_cycle_started_at,updated_at
  ) values(
    p_user_id,v_source_plan,'active','kiwify',
    1,1,
    case when v_source_plan='mentor' then 5 else 3 end,
    case when v_source_plan='mentor' then 2 else 1 end,
    coalesce(v_source_started,now()),v_source_until,
    true,v_source_plan='mentor',
    case when v_source_plan='mentor' then 'included' else 'disabled' end,
    1,
    case when v_is_br then v_sub.subscription_id else null end,
    case when v_is_br then v_sub.plan_name else 'International 30 days' end,
    case when v_is_br then v_sub.amount_minor else null end,
    case when v_is_br then coalesce(v_sub.currency_code,'BRL') else 'USD' end,
    case
      when v_source_plan<>'mentor' then 0
      when v_is_br then 10
      else 0
    end,
    case
      when v_source_plan<>'mentor' then null
      when v_is_br then coalesce(v_existing.mentor_credits_cycle_started_at,v_source_started,now())
      else null
    end,
    now()
  )
  on conflict(user_id) do update set
    plan_id=excluded.plan_id,
    status='active',
    source='kiwify',
    max_pcs=greatest(devinx_laser.entitlements.max_pcs,1),
    max_machines=excluded.max_machines,
    max_mobile_devices=excluded.max_mobile_devices,
    max_active_operators=excluded.max_active_operators,
    starts_at=excluded.starts_at,
    expires_at=excluded.expires_at,
    owner_access=true,
    mentor_access=excluded.mentor_access,
    mentor_billing_mode=excluded.mentor_billing_mode,
    mentor_max_concurrent=excluded.mentor_max_concurrent,
    provider_subscription_id=coalesce(excluded.provider_subscription_id,devinx_laser.entitlements.provider_subscription_id),
    plan_name=excluded.plan_name,
    amount_minor=coalesce(excluded.amount_minor,devinx_laser.entitlements.amount_minor),
    currency_code=excluded.currency_code,
    mentor_credits_balance=case
      when excluded.plan_id<>'mentor' then 0
      when v_existing_expired then case when v_is_br then 10 else 0 end
      when v_is_br and devinx_laser.entitlements.plan_id<>'mentor' then 10
      else devinx_laser.entitlements.mentor_credits_balance
    end,
    mentor_credits_cycle_started_at=case
      when excluded.plan_id<>'mentor' then null
      when v_is_br and (v_existing_expired or devinx_laser.entitlements.plan_id<>'mentor')
        then coalesce(v_source_started,now())
      else devinx_laser.entitlements.mentor_credits_cycle_started_at
    end,
    updated_at=now();

  if not v_is_br and v_source_plan='mentor' then
    perform public.laser_internal_apply_pending_intl_mentor_credits(p_user_id);
  end if;

  perform public.laser_internal_apply_pending_mentor_credits(p_user_id);
  perform public.laser_internal_apply_pending_pc_addons(p_user_id);
end;
$function$;

create or replace function public.get_laser_mentor_sessions_remaining()
returns integer
language plpgsql
security definer
set search_path to 'devinx_laser','public'
as $function$
declare
  v_user uuid:=auth.uid();
  v_balance integer:=0;
begin
  if v_user is null then return 0; end if;

  if exists(select 1 from public.devinx_admin_users a where a.user_id=v_user) then
    return -1;
  end if;

  perform public.laser_internal_sync_entitlement_from_purchase(v_user);
  perform public.laser_internal_apply_pending_intl_mentor_credits(v_user);
  perform public.laser_internal_apply_pending_mentor_credits(v_user);

  select greatest(coalesce(e.mentor_credits_balance,0),0)
    into v_balance
  from devinx_laser.entitlements e
  where e.user_id=v_user
    and e.status='active'
    and e.plan_id='mentor'
    and e.mentor_access=true
    and e.expires_at>now();

  return coalesce(v_balance,0);
end;
$function$;

revoke execute on function public.get_laser_mentor_sessions_remaining() from public,anon;
grant execute on function public.get_laser_mentor_sessions_remaining() to authenticated,service_role;

create or replace function public.get_laser_checkout_region()
returns text
language plpgsql
security definer
set search_path to 'devinx_laser','public'
as $function$
declare
  v_user uuid:=auth.uid();
  v_currency text;
begin
  if v_user is null then return null; end if;

  if exists(select 1 from public.devinx_admin_users a where a.user_id=v_user) then
    return 'br';
  end if;

  perform public.laser_internal_sync_entitlement_from_purchase(v_user);

  select upper(coalesce(e.currency_code,'BRL'))
    into v_currency
  from devinx_laser.entitlements e
  where e.user_id=v_user
    and e.status='active'
    and e.owner_access=true
    and (e.expires_at is null or e.expires_at>now());

  if not found then return null; end if;
  return case when v_currency='BRL' then 'br' else 'intl' end;
end;
$function$;

revoke all on function public.get_laser_checkout_region() from public,anon;
grant execute on function public.get_laser_checkout_region() to authenticated,service_role;

create or replace function public.laser_internal_user_can_control_device(p_user_id uuid,p_device_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'devinx_laser','public','auth'
as $function$
declare
  v_device devinx_laser.devices%rowtype;
  v_ent devinx_laser.entitlements%rowtype;
  v_admin boolean:=false;
  v_limit integer:=1;
  v_rank integer:=0;
  v_email text;
  v_cycle record;
begin
  if p_user_id is null or p_device_id is null then return false; end if;

  select exists(
    select 1 from public.devinx_admin_users a where a.user_id=p_user_id
  ) into v_admin;

  select * into v_device
  from devinx_laser.devices d
  where d.id=p_device_id and d.status='active';

  if not found then return false; end if;
  if v_device.owner_user_id<>p_user_id and not v_admin then return false; end if;

  if v_device.connection_mode='mentor' then
    if v_device.access_expires_at is null or v_device.access_expires_at<=now() then return false; end if;
    if not exists(
      select 1 from devinx_laser.mentor_sessions ms
      where ms.device_id=v_device.id
        and ms.mentor_user_id=p_user_id
        and ms.status='active'
        and ms.expires_at>now()
    ) then return false; end if;

    if v_admin then return true; end if;

    select * into v_ent
    from devinx_laser.entitlements e
    where e.user_id=p_user_id
      and e.status='active'
      and e.mentor_access=true
      and e.mentor_billing_mode<>'disabled'
      and (e.expires_at is null or e.expires_at>now());

    if not found then return false; end if;

    if upper(coalesce(v_ent.currency_code,'BRL'))<>'BRL' then
      select lower(email) into v_email from auth.users where id=p_user_id;
      select * into v_cycle
      from public.laser_internal_current_pass_cycle(v_email)
      limit 1;
      if not found or v_cycle.plan_id<>'mentor' then return false; end if;
    end if;

    return true;
  end if;

  if v_admin then return true; end if;

  select * into v_ent
  from devinx_laser.entitlements e
  where e.user_id=p_user_id
    and e.status='active'
    and e.owner_access=true
    and (e.expires_at is null or e.expires_at>now());

  if not found then return false; end if;

  if v_ent.source='kiwify' then
    select 1+coalesce(sum(o.slots),0)::integer into v_limit
    from devinx_laser.pc_addon_orders o
    where o.user_id=p_user_id
      and o.status='approved'
      and o.applied_at is not null
      and o.expires_at is not null
      and o.expires_at>now();
  else
    v_limit:=greatest(coalesce(v_ent.max_pcs,1),1);
  end if;

  select ranked.rn into v_rank
  from(
    select d.id,row_number() over(
      order by coalesce(d.paired_at,d.created_at),d.created_at,d.id
    )::integer as rn
    from devinx_laser.devices d
    where d.owner_user_id=p_user_id
      and d.connection_mode<>'mentor'
      and d.status='active'
  ) ranked
  where ranked.id=p_device_id;

  return coalesce(v_rank,0)>0 and v_rank<=v_limit;
end;
$function$;

create or replace function public.laser_internal_device_access_deadline(
  p_user_id uuid,
  p_device_id uuid
)
returns timestamptz
language plpgsql
stable
security definer
set search_path to 'devinx_laser','public','auth'
as $function$
declare
  v_device devinx_laser.devices%rowtype;
  v_ent devinx_laser.entitlements%rowtype;
  v_admin boolean:=false;
  v_rank integer:=0;
  v_extra_until timestamptz;
  v_email text;
  v_cycle record;
begin
  if not public.laser_internal_user_can_control_device(p_user_id,p_device_id) then
    return now();
  end if;

  select exists(
    select 1 from public.devinx_admin_users a where a.user_id=p_user_id
  ) into v_admin;

  select * into v_device
  from devinx_laser.devices d
  where d.id=p_device_id and d.status='active';

  if v_admin then return null; end if;

  select * into v_ent
  from devinx_laser.entitlements e
  where e.user_id=p_user_id
    and e.status='active'
    and e.owner_access=true
    and (e.expires_at is null or e.expires_at>now());

  if not found then return now(); end if;

  if v_device.connection_mode='mentor' then
    if upper(coalesce(v_ent.currency_code,'BRL'))<>'BRL' then
      select lower(email) into v_email from auth.users where id=p_user_id;
      select * into v_cycle
      from public.laser_internal_current_pass_cycle(v_email)
      limit 1;
      if not found then return now(); end if;
      return least(v_device.access_expires_at,v_cycle.cycle_expires_at);
    end if;
    return least(v_device.access_expires_at,coalesce(v_ent.expires_at,v_device.access_expires_at));
  end if;

  select ranked.rn into v_rank
  from(
    select d.id,row_number() over(
      order by coalesce(d.paired_at,d.created_at),d.created_at,d.id
    )::integer as rn
    from devinx_laser.devices d
    where d.owner_user_id=p_user_id
      and d.connection_mode<>'mentor'
      and d.status='active'
  ) ranked
  where ranked.id=p_device_id;

  if coalesce(v_rank,0)>1 and v_ent.source='kiwify' then
    select max(o.expires_at) into v_extra_until
    from devinx_laser.pc_addon_orders o
    where o.user_id=p_user_id
      and o.status='approved'
      and o.applied_at is not null
      and o.expires_at>now();

    if v_extra_until is null then return now(); end if;
    if v_ent.expires_at is null then return v_extra_until; end if;
    return least(v_ent.expires_at,v_extra_until);
  end if;

  return v_ent.expires_at;
end;
$function$;

create or replace function public.laser_internal_claim_mentor(
  p_user_id uuid,
  p_pairing_code_hash text
)
returns table(device_id uuid,mentor_session_id uuid,display_name text,expires_at timestamptz,billing_mode text)
language plpgsql
security definer
set search_path to 'devinx_laser','public','auth'
as $function$
declare
  v_offer devinx_laser.mentor_pairing_offers%rowtype;
  v_ent devinx_laser.entitlements%rowtype;
  v_admin boolean:=false;
  v_limit integer:=1;
  v_active integer:=0;
  v_device_id uuid;
  v_session_id uuid;
  v_expires timestamptz:=now()+interval '6 hours';
  v_billing_mode text;
  v_billing_state text;
  v_credits_charged integer:=0;
  v_email text;
  v_cycle record;
begin
  if p_user_id is null or p_pairing_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_mentor_claim';
  end if;

  select o.* into v_offer
  from devinx_laser.mentor_pairing_offers o
  where o.pairing_code_hash=p_pairing_code_hash
    and o.consumed_at is null
    and o.expires_at>now()
  for update;
  if not found then raise exception 'mentor_offer_not_found'; end if;

  select exists(
    select 1 from public.devinx_admin_users a where a.user_id=p_user_id
  ) into v_admin;

  if v_admin then
    v_limit:=25;
    v_billing_mode:='master';
    v_billing_state:='waived';
  else
    perform public.laser_internal_sync_entitlement_from_purchase(p_user_id);
    perform public.laser_internal_apply_pending_intl_mentor_credits(p_user_id);
    perform public.laser_internal_apply_pending_mentor_credits(p_user_id);

    select e.* into v_ent
    from devinx_laser.entitlements e
    where e.user_id=p_user_id
      and e.status='active'
      and e.plan_id='mentor'
      and e.mentor_access=true
      and e.mentor_billing_mode in ('included','metered')
      and (e.expires_at is null or e.expires_at>now())
    for update;

    if not found then raise exception 'mentor_entitlement_required'; end if;
    if v_ent.mentor_credits_balance<=0 then raise exception 'mentor_credits_exhausted'; end if;

    v_limit:=v_ent.mentor_max_concurrent;
    v_billing_mode:=v_ent.mentor_billing_mode;
    v_billing_state:=case when v_ent.mentor_billing_mode='included' then 'included' else 'settled' end;
    v_credits_charged:=1;
    v_expires:=least(v_expires,coalesce(v_ent.expires_at,v_expires));

    if upper(coalesce(v_ent.currency_code,'BRL'))<>'BRL' then
      select lower(email) into v_email from auth.users where id=p_user_id;
      select * into v_cycle
      from public.laser_internal_current_pass_cycle(v_email)
      limit 1;
      if not found or v_cycle.plan_id<>'mentor' then
        raise exception 'mentor_entitlement_required';
      end if;
      v_expires:=least(v_expires,v_cycle.cycle_expires_at);
    end if;
  end if;

  if v_expires<=now() then raise exception 'mentor_entitlement_required'; end if;

  select count(*) into v_active
  from devinx_laser.mentor_sessions ms
  where ms.mentor_user_id=p_user_id
    and ms.status='active'
    and ms.expires_at>now();

  if v_active>=v_limit then raise exception 'mentor_concurrent_limit'; end if;

  if exists(
    select 1 from devinx_laser.devices d
    where d.public_key_fingerprint=v_offer.public_key_fingerprint
      and d.status='active'
  ) then
    raise exception 'mentor_device_already_active';
  end if;

  v_device_id:=v_offer.device_id;

  insert into devinx_laser.devices(
    id,owner_user_id,display_name,public_key_pem,public_key_fingerprint,status,
    agent_version,paired_at,remote_control_enabled,last_sequence,connection_mode,access_expires_at
  ) values(
    v_device_id,p_user_id,v_offer.display_name,v_offer.public_key_pem,v_offer.public_key_fingerprint,
    'active',v_offer.agent_version,now(),false,0,'mentor',v_expires
  );

  insert into devinx_laser.mentor_sessions(
    mentor_user_id,device_id,status,billing_mode,billing_state,expires_at
  ) values(
    p_user_id,v_device_id,'active',v_billing_mode,v_billing_state,v_expires
  ) returning id into v_session_id;

  if v_credits_charged=1 then
    update devinx_laser.entitlements
    set mentor_credits_balance=mentor_credits_balance-1,updated_at=now()
    where user_id=p_user_id and mentor_credits_balance>0;
    if not found then raise exception 'mentor_credits_exhausted'; end if;
  end if;

  insert into devinx_laser.mentor_usage_ledger(
    mentor_user_id,mentor_session_id,device_fingerprint,billing_mode,billing_state,credits_charged
  ) values(
    p_user_id,v_session_id,v_offer.public_key_fingerprint,v_billing_mode,v_billing_state,v_credits_charged
  );

  update devinx_laser.mentor_pairing_offers
  set consumed_at=now(),claimed_by_user_id=p_user_id
  where id=v_offer.id;

  return query
  select v_device_id,v_session_id,v_offer.display_name,v_expires,v_billing_mode;
end;
$function$;

create or replace function public.process_kiwify_laser_pc_addon_webhook(p_payload jsonb,p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'devinx_laser','public','auth'
as $function$
declare
  v_expected_hash text;
  v_extra_product text;
  v_intl_product text;
  v_expected_product text;
  v_expected_currency text;
  v_expected_amount bigint;
  v_product_id text;
  v_checkout_link text;
  v_email text;
  v_event text;
  v_order_status text;
  v_order_id text;
  v_amount_text text;
  v_amount bigint;
  v_currency text;
  v_approved boolean:=false;
  v_reversed boolean:=false;
  v_existing devinx_laser.pc_addon_orders%rowtype;
begin
  select kiwify_laser_token_hash,kiwify_laser_extra_product_id,kiwify_laser_international_product_id
    into v_expected_hash,v_extra_product,v_intl_product
  from public.devinx_integration_settings
  where singleton=true;

  if v_expected_hash is null or p_token_hash is distinct from v_expected_hash then
    raise exception 'webhook unauthorized';
  end if;

  v_order_id:=nullif(coalesce(
    p_payload->>'order_id',p_payload->>'order_ref',
    p_payload#>>'{order,order_id}',p_payload#>>'{Order,order_id}',
    p_payload#>>'{order,id}',p_payload#>>'{Order,id}',''
  ),'');
  if v_order_id is null then raise exception 'pc_addon_order_id_missing'; end if;

  v_event:=lower(coalesce(
    p_payload->>'webhook_event_type',
    p_payload->>'event_type',
    p_payload->>'event',''
  ));
  v_order_status:=lower(coalesce(
    p_payload->>'order_status',
    p_payload#>>'{order,status}',
    p_payload#>>'{Order,status}',''
  ));

  v_reversed:=v_event in ('order_refunded','compra_reembolsada','chargeback','order_chargeback')
    or v_order_status in ('refunded','chargedback','chargeback');
  v_approved:=not v_reversed and (
    v_event in ('order_approved','compra_aprovada','order_paid','purchase_approved')
    or v_order_status in ('paid','approved')
  );

  select * into v_existing
  from devinx_laser.pc_addon_orders o
  where o.order_id=v_order_id;

  if v_reversed and found then
    return public.laser_internal_record_pc_addon(
      v_order_id,v_existing.email,v_existing.product_id,v_existing.checkout_link,true
    );
  end if;

  if not v_approved and not v_reversed then
    return jsonb_build_object('ok',true,'ignored','event','event',v_event);
  end if;

  v_checkout_link:=split_part(
    regexp_replace(trim(coalesce(
      p_payload->>'checkout_link',
      p_payload#>>'{Checkout,checkout_link}',
      p_payload#>>'{checkout,checkout_link}',
      ''
    )),'^.*/',''),
    '?',1
  );

  if v_checkout_link='IdNEzcp' then
    v_expected_product:=v_extra_product;
    v_expected_currency:='BRL';
    v_expected_amount:=1290;
  elsif v_checkout_link='PR4BNpa' then
    v_expected_product:=v_intl_product;
    v_expected_currency:='USD';
    v_expected_amount:=500;
  else
    return jsonb_build_object('ok',true,'ignored','offer');
  end if;

  v_product_id:=coalesce(
    p_payload#>>'{Product,product_id}',p_payload->>'product_id',
    p_payload#>>'{product,product_id}',p_payload#>>'{product,id}',p_payload#>>'{order,product_id}'
  );
  if v_product_id is null or v_product_id is distinct from v_expected_product then
    return jsonb_build_object('ok',true,'ignored','product');
  end if;

  v_currency:=upper(nullif(coalesce(
    p_payload#>>'{Commissions,product_base_price_currency}',
    p_payload#>>'{Commissions,currency}',
    p_payload#>>'{commissions,product_base_price_currency}',
    p_payload#>>'{commissions,currency}',''
  ),''));

  v_amount_text:=nullif(trim(coalesce(
    p_payload#>>'{Commissions,product_base_price}',
    p_payload#>>'{Commissions,charge_amount}',
    p_payload#>>'{commissions,product_base_price}',
    p_payload#>>'{commissions,charge_amount}',''
  )),'');
  v_amount:=null;

  if v_amount_text is not null and v_amount_text~'^[0-9]+$' then
    v_amount:=v_amount_text::bigint;
  elsif v_amount_text is not null and replace(v_amount_text,',','.')~'^[0-9]+[.][0-9]{1,2}$' then
    v_amount:=round((replace(v_amount_text,',','.')::numeric)*100)::bigint;
  end if;

  if v_currency is distinct from v_expected_currency or v_amount is distinct from v_expected_amount then
    return jsonb_build_object(
      'ok',true,'ignored','price',
      'amount_minor',v_amount,'currency',v_currency
    );
  end if;

  v_email:=lower(trim(coalesce(
    p_payload#>>'{Customer,email}',
    p_payload#>>'{customer,email}',
    p_payload->>'email',''
  )));
  if v_email='' then
    if v_reversed then
      return jsonb_build_object('ok',true,'ignored','unknown_refund');
    end if;
    raise exception 'customer email missing';
  end if;

  return public.laser_internal_record_pc_addon(
    v_order_id,v_email,v_product_id,v_checkout_link,v_reversed
  );
end;
$function$;

create or replace function public.process_kiwify_laser_offer_dispatch(p_payload jsonb,p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'devinx_laser','public'
as $function$
declare
  v_main_product text;
  v_extra_product text;
  v_intl_product text;
  v_product_id text;
  v_checkout_link text;
  v_order_id text;
begin
  select kiwify_laser_product_id,kiwify_laser_extra_product_id,kiwify_laser_international_product_id
    into v_main_product,v_extra_product,v_intl_product
  from public.devinx_integration_settings
  where singleton=true;

  v_order_id:=nullif(coalesce(
    p_payload->>'order_id',p_payload->>'order_ref',
    p_payload#>>'{order,order_id}',p_payload#>>'{Order,order_id}',
    p_payload#>>'{order,id}',p_payload#>>'{Order,id}',''
  ),'');

  if v_order_id is not null and exists(
    select 1 from devinx_laser.pc_addon_orders o where o.order_id=v_order_id
  ) then
    return public.process_kiwify_laser_pc_addon_webhook(p_payload,p_token_hash);
  end if;

  v_checkout_link:=split_part(
    regexp_replace(trim(coalesce(
      p_payload->>'checkout_link',
      p_payload#>>'{Checkout,checkout_link}',
      p_payload#>>'{checkout,checkout_link}',
      ''
    )),'^.*/',''),
    '?',1
  );

  if v_checkout_link in ('IdNEzcp','PR4BNpa') then
    return public.process_kiwify_laser_pc_addon_webhook(p_payload,p_token_hash);
  end if;

  v_product_id:=coalesce(
    p_payload#>>'{Product,product_id}',
    p_payload->>'product_id',
    p_payload#>>'{product,product_id}',
    p_payload#>>'{product,id}',
    p_payload#>>'{order,product_id}'
  );

  if v_product_id=v_extra_product then
    return public.process_kiwify_laser_extra_webhook(p_payload,p_token_hash);
  elsif v_product_id=v_intl_product then
    return public.process_kiwify_laser_international_webhook(p_payload,p_token_hash);
  elsif v_product_id=v_main_product then
    return public.process_kiwify_laser_webhook(p_payload,p_token_hash);
  end if;

  return jsonb_build_object('ok',true,'ignored','product');
end;
$function$;

revoke all on function public.process_kiwify_laser_offer_dispatch(jsonb,text) from public;
grant execute on function public.process_kiwify_laser_offer_dispatch(jsonb,text) to anon,authenticated,service_role;

revoke all on function public.process_kiwify_laser_pc_addon_webhook(jsonb,text) from public;
grant execute on function public.process_kiwify_laser_pc_addon_webhook(jsonb,text) to anon,authenticated,service_role;

do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name,p.proname,pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'laser_internal_%'
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated',
      r.schema_name,r.proname,r.args
    );
    execute format(
      'grant execute on function %I.%I(%s) to service_role',
      r.schema_name,r.proname,r.args
    );
  end loop;
end
$$;

-- Laser Control commercial rules:
-- Control: 2 owned PCs + optional +1-student mentoring credits.
-- Mentor: 5 owned PCs + unlimited students, one active mentoring session at a time.
-- Existing +1 PC orders continue to stack on top of the included PC capacity.

create or replace function public.laser_internal_base_pc_capacity(
  p_plan_id text,
  p_source text,
  p_current_max integer
)
returns integer
language sql
immutable
set search_path=''
as $function$
  select case
    when p_source='kiwify' and p_plan_id='mentor' then 5
    when p_source='kiwify' and p_plan_id='control' then 2
    when p_source='manual' and p_plan_id='mentor' then greatest(coalesce(p_current_max,5),5)
    when p_source='manual' and p_plan_id='control' then greatest(coalesce(p_current_max,2),2)
    else greatest(coalesce(p_current_max,1),1)
  end;
$function$;

revoke all on function public.laser_internal_base_pc_capacity(text,text,integer) from public,anon,authenticated;
grant execute on function public.laser_internal_base_pc_capacity(text,text,integer) to service_role;

create or replace function public.laser_internal_recompute_pc_capacity(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'devinx_laser','public'
as $function$
declare
  v_ent devinx_laser.entitlements%rowtype;
  v_extra integer:=0;
  v_base integer:=1;
  v_limit integer:=1;
  v_revoked uuid[];
begin
  if p_user_id is null then return 0; end if;

  select * into v_ent
  from devinx_laser.entitlements e
  where e.user_id=p_user_id
  for update;

  if not found then return 0; end if;

  v_base:=public.laser_internal_base_pc_capacity(v_ent.plan_id,v_ent.source,v_ent.max_pcs);

  if v_ent.source='kiwify'
     and v_ent.status='active'
     and v_ent.owner_access=true
     and (v_ent.expires_at is null or v_ent.expires_at>now()) then
    select coalesce(sum(o.slots),0)::integer into v_extra
    from devinx_laser.pc_addon_orders o
    where o.user_id=p_user_id
      and o.status='approved'
      and o.applied_at is not null
      and o.expires_at is not null
      and o.expires_at>now();
  end if;

  v_limit:=least(100,greatest(1,v_base+coalesce(v_extra,0)));

  update devinx_laser.entitlements e
  set max_pcs=v_limit,updated_at=now()
  where e.user_id=p_user_id
    and e.max_pcs is distinct from v_limit;

  if v_ent.status='active'
     and v_ent.owner_access=true
     and (v_ent.expires_at is null or v_ent.expires_at>now()) then
    with ranked as(
      select d.id,
        row_number() over(order by coalesce(d.paired_at,d.created_at),d.created_at,d.id) as rn
      from devinx_laser.devices d
      where d.owner_user_id=p_user_id
        and d.connection_mode<>'mentor'
        and d.status='active'
    ), revoked as(
      update devinx_laser.devices d
      set status='revoked',
          revoked_at=coalesce(d.revoked_at,now()),
          remote_control_enabled=false,
          updated_at=now()
      from ranked r
      where d.id=r.id and r.rn>v_limit
      returning d.id
    )
    select array_agg(id) into v_revoked from revoked;

    if coalesce(array_length(v_revoked,1),0)>0 then
      update devinx_laser.remote_sessions rs
      set status='closed',
          remote_input_enabled=false,
          input_token=null,
          closed_at=coalesce(rs.closed_at,now()),
          updated_at=now(),
          revision=rs.revision+1
      where rs.device_id=any(v_revoked)
        and rs.status='active';
    end if;
  end if;

  return v_limit;
end;
$function$;

revoke all on function public.laser_internal_recompute_pc_capacity(uuid) from public,anon,authenticated;
grant execute on function public.laser_internal_recompute_pc_capacity(uuid) to service_role;

create or replace function public.laser_internal_apply_pending_intl_mentor_credits(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'devinx_laser','public','auth'
as $function$
declare
  v_email text;
  v_cycle record;
begin
  select lower(email) into v_email from auth.users where id=p_user_id;
  if v_email is null then return 0; end if;

  select * into v_cycle
  from public.laser_internal_current_pass_cycle(v_email)
  limit 1;

  if not found or v_cycle.plan_id<>'mentor' then return 0; end if;

  update devinx_laser.entitlements
  set mentor_credits_balance=0,
      mentor_access=true,
      mentor_billing_mode='included',
      mentor_max_concurrent=1,
      updated_at=now()
  where user_id=p_user_id
    and status='active'
    and plan_id='mentor'
    and expires_at>now();

  update devinx_laser.kiwify_pass_orders o
  set mentor_credits_applied_at=coalesce(o.mentor_credits_applied_at,now()),
      updated_at=now()
  where o.order_id=v_cycle.order_id
    and o.plan_id='mentor'
    and o.status='approved';

  return 0;
end;
$function$;

revoke all on function public.laser_internal_apply_pending_intl_mentor_credits(uuid) from public,anon,authenticated;
grant execute on function public.laser_internal_apply_pending_intl_mentor_credits(uuid) to service_role;

create or replace function public.laser_internal_apply_pending_mentor_credits(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'devinx_laser','public','auth'
as $function$
declare
  v_email text;
  v_cycle_expires timestamptz;
  v_count integer:=0;
begin
  select lower(email) into v_email from auth.users where id=p_user_id;
  if v_email is null then return 0; end if;

  select c.expires_at into v_cycle_expires
  from public.laser_internal_current_paid_cycle(v_email) c
  where c.plan_id='control'
  limit 1;

  if not found then return 0; end if;

  if not exists(
    select 1 from devinx_laser.entitlements e
    where e.user_id=p_user_id
      and e.status='active'
      and e.plan_id='control'
      and e.owner_access=true
      and (e.expires_at is null or e.expires_at>now())
  ) then return 0; end if;

  update devinx_laser.mentor_credit_orders o
  set user_id=coalesce(o.user_id,p_user_id),
      expires_at=coalesce(o.expires_at,v_cycle_expires),
      updated_at=now()
  where o.email=v_email
    and o.status='approved'
    and o.credited_at is null
    and (o.user_id is null or o.user_id=p_user_id);

  with pending as(
    select o.order_id,o.credits
    from devinx_laser.mentor_credit_orders o
    where o.email=v_email
      and o.status='approved'
      and o.credited_at is null
      and o.expires_at is not null
      and o.expires_at>now()
      and (o.user_id is null or o.user_id=p_user_id)
    for update
  ), marked as(
    update devinx_laser.mentor_credit_orders o
    set user_id=p_user_id,credited_at=now(),updated_at=now()
    where o.order_id in(select order_id from pending)
    returning o.credits
  )
  select coalesce(sum(credits),0)::integer into v_count from marked;

  if v_count>0 then
    update devinx_laser.entitlements
    set mentor_credits_balance=greatest(mentor_credits_balance,0)+v_count,
        mentor_access=true,
        mentor_billing_mode='metered',
        mentor_max_concurrent=1,
        updated_at=now()
    where user_id=p_user_id
      and status='active'
      and plan_id='control';
  elsif exists(
    select 1 from devinx_laser.entitlements e
    where e.user_id=p_user_id
      and e.status='active'
      and e.plan_id='control'
      and e.mentor_credits_balance>0
  ) then
    update devinx_laser.entitlements
    set mentor_access=true,mentor_billing_mode='metered',mentor_max_concurrent=1,updated_at=now()
    where user_id=p_user_id;
  end if;

  return v_count;
end;
$function$;

revoke all on function public.laser_internal_apply_pending_mentor_credits(uuid) from public,anon,authenticated;
grant execute on function public.laser_internal_apply_pending_mentor_credits(uuid) to service_role;

create or replace function public.laser_internal_record_extra_mentor_credit(
  p_order_id text,
  p_email text,
  p_product_id text,
  p_reversed boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'devinx_laser','public','auth'
as $function$
declare
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_user_id uuid;
  v_plan_id text;
  v_expires_at timestamptz;
  v_order devinx_laser.mentor_credit_orders%rowtype;
  v_students integer:=1;
begin
  if p_order_id is null or trim(p_order_id)='' then raise exception 'extra_order_id_missing'; end if;
  if v_email='' then raise exception 'customer email missing'; end if;

  select id into v_user_id from auth.users where lower(email)=v_email limit 1;

  select c.plan_id,c.expires_at into v_plan_id,v_expires_at
  from public.laser_internal_current_paid_cycle(v_email) c
  where c.plan_id='control'
  limit 1;

  select * into v_order
  from devinx_laser.mentor_credit_orders
  where order_id=p_order_id
  for update;

  if p_reversed then
    if found
       and v_order.credited_at is not null
       and v_order.reversed_at is null
       and v_order.user_id is not null then
      update devinx_laser.entitlements e
      set mentor_credits_balance=greatest(0,e.mentor_credits_balance-v_order.credits),
          mentor_access=(greatest(0,e.mentor_credits_balance-v_order.credits)>0),
          mentor_billing_mode=case
            when greatest(0,e.mentor_credits_balance-v_order.credits)>0 then 'metered'
            else 'disabled'
          end,
          updated_at=now()
      where e.user_id=v_order.user_id
        and e.status='active'
        and e.plan_id='control';
    end if;

    insert into devinx_laser.mentor_credit_orders(
      order_id,email,product_id,status,credits,user_id,expires_at,reversed_at,updated_at
    ) values(p_order_id,v_email,p_product_id,'reversed',v_students,v_user_id,v_expires_at,now(),now())
    on conflict(order_id) do update set
      status='reversed',
      reversed_at=coalesce(devinx_laser.mentor_credit_orders.reversed_at,now()),
      updated_at=now();

    return jsonb_build_object('ok',true,'order',p_order_id,'status','reversed','student_accesses',v_students);
  end if;

  insert into devinx_laser.mentor_credit_orders(
    order_id,email,product_id,status,credits,user_id,expires_at,updated_at
  ) values(p_order_id,v_email,p_product_id,'approved',v_students,v_user_id,v_expires_at,now())
  on conflict(order_id) do update set
    email=excluded.email,
    product_id=excluded.product_id,
    credits=1,
    user_id=coalesce(devinx_laser.mentor_credit_orders.user_id,excluded.user_id),
    expires_at=coalesce(devinx_laser.mentor_credit_orders.expires_at,excluded.expires_at),
    status=case when devinx_laser.mentor_credit_orders.status='reversed' then 'reversed' else 'approved' end,
    updated_at=now();

  if v_user_id is not null and v_plan_id='control'
     and v_expires_at is not null and v_expires_at>now() then
    perform public.laser_internal_apply_pending_mentor_credits(v_user_id);
  end if;

  return jsonb_build_object(
    'ok',true,'order',p_order_id,'status','approved','student_accesses',v_students,
    'expires_at',v_expires_at,
    'active_control_required',v_expires_at is null
  );
end;
$function$;

revoke all on function public.laser_internal_record_extra_mentor_credit(text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.laser_internal_record_extra_mentor_credit(text,text,text,boolean) to service_role;

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
  v_has_existing boolean:=false;
  v_same_cycle boolean:=false;
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
  from devinx_laser.entitlements e
  where e.user_id=p_user_id;
  v_has_existing:=found;

  v_same_cycle:=v_has_existing
    and v_existing.source='kiwify'
    and v_existing.status='active'
    and v_existing.plan_id=v_source_plan
    and v_existing.expires_at is not distinct from v_source_until;

  insert into devinx_laser.entitlements(
    user_id,plan_id,status,source,max_pcs,max_machines,max_mobile_devices,max_active_operators,
    starts_at,expires_at,owner_access,mentor_access,mentor_billing_mode,mentor_max_concurrent,
    provider_subscription_id,plan_name,amount_minor,currency_code,
    mentor_credits_balance,mentor_credits_cycle_started_at,updated_at
  ) values(
    p_user_id,v_source_plan,'active','kiwify',
    case when v_source_plan='mentor' then 5 else 2 end,
    1,
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
    0,
    coalesce(v_source_started,now()),
    now()
  )
  on conflict(user_id) do update set
    plan_id=excluded.plan_id,
    status='active',
    source='kiwify',
    max_pcs=excluded.max_pcs,
    max_machines=excluded.max_machines,
    max_mobile_devices=excluded.max_mobile_devices,
    max_active_operators=excluded.max_active_operators,
    starts_at=excluded.starts_at,
    expires_at=excluded.expires_at,
    owner_access=true,
    mentor_access=case
      when excluded.plan_id='mentor' then true
      when excluded.plan_id='control' and v_same_cycle then devinx_laser.entitlements.mentor_access
      else false
    end,
    mentor_billing_mode=case
      when excluded.plan_id='mentor' then 'included'
      when excluded.plan_id='control' and v_same_cycle
        then devinx_laser.entitlements.mentor_billing_mode
      else 'disabled'
    end,
    mentor_max_concurrent=1,
    provider_subscription_id=coalesce(excluded.provider_subscription_id,devinx_laser.entitlements.provider_subscription_id),
    plan_name=excluded.plan_name,
    amount_minor=coalesce(excluded.amount_minor,devinx_laser.entitlements.amount_minor),
    currency_code=excluded.currency_code,
    mentor_credits_balance=case
      when excluded.plan_id='mentor' then 0
      when excluded.plan_id='control' and v_same_cycle
        then greatest(devinx_laser.entitlements.mentor_credits_balance,0)
      else 0
    end,
    mentor_credits_cycle_started_at=case
      when excluded.plan_id='control' and v_same_cycle
        then devinx_laser.entitlements.mentor_credits_cycle_started_at
      else excluded.mentor_credits_cycle_started_at
    end,
    updated_at=now();

  if not v_is_br and v_source_plan='mentor' then
    perform public.laser_internal_apply_pending_intl_mentor_credits(p_user_id);
  end if;

  perform public.laser_internal_apply_pending_mentor_credits(p_user_id);
  perform public.laser_internal_apply_pending_pc_addons(p_user_id);
end;
$function$;

revoke all on function public.laser_internal_sync_entitlement_from_purchase(uuid) from public,anon,authenticated;
grant execute on function public.laser_internal_sync_entitlement_from_purchase(uuid) to service_role;

create or replace function public.laser_internal_apply_manual_access(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'devinx_laser','public','auth'
as $function$
declare
  v_email text;
  v_grant devinx_laser.email_access_grants%rowtype;
  v_existing devinx_laser.entitlements%rowtype;
  v_is_mentor boolean:=false;
  v_min_pcs integer:=2;
begin
  if p_user_id is null then return; end if;

  select lower(email) into v_email from auth.users where id=p_user_id;
  if v_email is null then return; end if;

  select * into v_grant from devinx_laser.email_access_grants g where g.email=v_email;
  if not found then return; end if;

  select * into v_existing from devinx_laser.entitlements e where e.user_id=p_user_id;
  v_is_mentor:=v_grant.plan_id='mentor';
  v_min_pcs:=case when v_is_mentor then 5 else 2 end;

  if v_grant.status='blocked'
     or (v_grant.expires_at is not null and v_grant.expires_at<=now()) then
    insert into devinx_laser.entitlements(
      user_id,plan_id,status,source,max_pcs,max_machines,max_mobile_devices,max_active_operators,
      starts_at,expires_at,owner_access,mentor_access,mentor_billing_mode,mentor_max_concurrent,
      plan_name,mentor_credits_balance,mentor_credits_cycle_started_at,updated_at
    ) values(
      p_user_id,v_grant.plan_id,'blocked','manual',greatest(v_grant.max_pcs,v_min_pcs),1,
      case when v_is_mentor then 5 else 3 end,
      case when v_is_mentor then 2 else 1 end,
      now(),v_grant.expires_at,false,false,'disabled',1,
      case when v_is_mentor then 'Manual Mentor' else 'Manual Control' end,
      0,null,now()
    )
    on conflict(user_id) do update set
      plan_id=excluded.plan_id,status='blocked',source='manual',
      max_pcs=excluded.max_pcs,max_machines=1,
      max_mobile_devices=excluded.max_mobile_devices,max_active_operators=excluded.max_active_operators,
      expires_at=excluded.expires_at,owner_access=false,mentor_access=false,
      mentor_billing_mode='disabled',mentor_max_concurrent=1,
      plan_name=excluded.plan_name,mentor_credits_balance=0,mentor_credits_cycle_started_at=null,
      updated_at=now();
    return;
  end if;

  insert into devinx_laser.entitlements(
    user_id,plan_id,status,source,max_pcs,max_machines,max_mobile_devices,max_active_operators,
    starts_at,expires_at,owner_access,mentor_access,mentor_billing_mode,mentor_max_concurrent,
    provider_subscription_id,plan_name,amount_minor,currency_code,
    mentor_credits_balance,mentor_credits_cycle_started_at,updated_at
  ) values(
    p_user_id,v_grant.plan_id,'active','manual',greatest(v_grant.max_pcs,v_min_pcs),1,
    case when v_is_mentor then 5 else 3 end,
    case when v_is_mentor then 2 else 1 end,
    now(),v_grant.expires_at,true,v_is_mentor,
    case when v_is_mentor then 'included' else 'disabled' end,
    1,null,
    case when v_is_mentor then 'Manual Mentor' else 'Manual Control' end,
    null,null,0,null,now()
  )
  on conflict(user_id) do update set
    plan_id=excluded.plan_id,status='active',source='manual',
    max_pcs=excluded.max_pcs,max_machines=1,
    max_mobile_devices=excluded.max_mobile_devices,max_active_operators=excluded.max_active_operators,
    expires_at=excluded.expires_at,owner_access=true,
    mentor_access=excluded.mentor_access,
    mentor_billing_mode=excluded.mentor_billing_mode,
    mentor_max_concurrent=1,
    provider_subscription_id=null,
    plan_name=excluded.plan_name,
    amount_minor=null,
    currency_code=null,
    mentor_credits_balance=0,
    mentor_credits_cycle_started_at=null,
    updated_at=now();
end;
$function$;

revoke all on function public.laser_internal_apply_manual_access(uuid) from public,anon,authenticated;
grant execute on function public.laser_internal_apply_manual_access(uuid) to service_role;

create or replace function public.get_laser_pc_capacity()
returns table(max_pcs integer,active_pcs integer,extra_pcs integer,expires_at timestamptz)
language plpgsql
security definer
set search_path to 'devinx_laser','public'
as $function$
declare
  v_user uuid:=auth.uid();
  v_admin boolean:=false;
  v_ent devinx_laser.entitlements%rowtype;
  v_base integer:=1;
  v_active integer:=0;
begin
  if v_user is null then return; end if;

  select exists(select 1 from public.devinx_admin_users a where a.user_id=v_user) into v_admin;
  if v_admin then
    select count(*)::integer into v_active
    from devinx_laser.devices d
    where d.owner_user_id=v_user and d.connection_mode<>'mentor' and d.status='active';
    return query select 25,v_active,24,null::timestamptz;
    return;
  end if;

  perform public.laser_internal_sync_entitlement_from_purchase(v_user);
  perform public.laser_internal_apply_pending_pc_addons(v_user);
  perform public.laser_internal_apply_manual_access(v_user);
  perform public.laser_internal_recompute_pc_capacity(v_user);

  select * into v_ent
  from devinx_laser.entitlements e
  where e.user_id=v_user
    and e.status='active'
    and e.owner_access=true
    and (e.expires_at is null or e.expires_at>now());

  if not found then return; end if;

  select count(*)::integer into v_active
  from devinx_laser.devices d
  where d.owner_user_id=v_user and d.connection_mode<>'mentor' and d.status='active';

  v_base:=public.laser_internal_base_pc_capacity(v_ent.plan_id,v_ent.source,v_ent.max_pcs);
  if v_ent.source<>'kiwify' then v_base:=v_ent.max_pcs; end if;

  return query select
    v_ent.max_pcs,
    v_active,
    greatest(v_ent.max_pcs-v_base,0),
    v_ent.expires_at;
end;
$function$;

revoke all on function public.get_laser_pc_capacity() from public,anon;
grant execute on function public.get_laser_pc_capacity() to authenticated,service_role;

create or replace function public.get_laser_mentor_sessions_remaining()
returns integer
language plpgsql
security definer
set search_path to 'devinx_laser','public'
as $function$
declare
  v_user uuid:=auth.uid();
  v_ent devinx_laser.entitlements%rowtype;
begin
  if v_user is null then return 0; end if;

  if exists(select 1 from public.devinx_admin_users a where a.user_id=v_user) then
    return -1;
  end if;

  perform public.laser_internal_sync_entitlement_from_purchase(v_user);
  perform public.laser_internal_apply_pending_intl_mentor_credits(v_user);
  perform public.laser_internal_apply_pending_mentor_credits(v_user);
  perform public.laser_internal_apply_manual_access(v_user);

  select * into v_ent
  from devinx_laser.entitlements e
  where e.user_id=v_user
    and e.status='active'
    and e.owner_access=true
    and (e.expires_at is null or e.expires_at>now());

  if not found then return 0; end if;
  if v_ent.plan_id='mentor' and v_ent.mentor_access then return -1; end if;
  if v_ent.plan_id='control' and v_ent.mentor_access then
    return greatest(coalesce(v_ent.mentor_credits_balance,0),0);
  end if;
  return 0;
end;
$function$;

revoke all on function public.get_laser_mentor_sessions_remaining() from public,anon;
grant execute on function public.get_laser_mentor_sessions_remaining() to authenticated,service_role;

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
      and e.plan_id in('control','mentor')
      and e.mentor_access=true
      and e.mentor_billing_mode<>'disabled'
      and (e.expires_at is null or e.expires_at>now());

    if not found then return false; end if;

    if v_ent.source='kiwify' and upper(coalesce(v_ent.currency_code,'BRL'))<>'BRL' then
      select lower(email) into v_email from auth.users where id=p_user_id;
      select * into v_cycle
      from public.laser_internal_current_pass_cycle(v_email)
      limit 1;
      if not found or v_cycle.plan_id<>v_ent.plan_id then return false; end if;
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

  v_limit:=greatest(coalesce(v_ent.max_pcs,1),1);

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

revoke all on function public.laser_internal_user_can_control_device(uuid,uuid) from public,anon,authenticated;
grant execute on function public.laser_internal_user_can_control_device(uuid,uuid) to service_role;

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
  v_base integer:=1;
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
    if v_ent.source='kiwify' and upper(coalesce(v_ent.currency_code,'BRL'))<>'BRL' then
      select lower(email) into v_email from auth.users where id=p_user_id;
      select * into v_cycle
      from public.laser_internal_current_pass_cycle(v_email)
      limit 1;
      if not found or v_cycle.plan_id<>v_ent.plan_id then return now(); end if;
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

  v_base:=public.laser_internal_base_pc_capacity(v_ent.plan_id,v_ent.source,v_ent.max_pcs);

  if coalesce(v_rank,0)>v_base and v_ent.source='kiwify' then
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

revoke all on function public.laser_internal_device_access_deadline(uuid,uuid) from public,anon,authenticated;
grant execute on function public.laser_internal_device_access_deadline(uuid,uuid) to service_role;

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
    perform public.laser_internal_apply_manual_access(p_user_id);

    select e.* into v_ent
    from devinx_laser.entitlements e
    where e.user_id=p_user_id
      and e.status='active'
      and e.plan_id in('control','mentor')
      and e.mentor_access=true
      and e.mentor_billing_mode in('included','metered')
      and (e.expires_at is null or e.expires_at>now())
    for update;

    if not found then raise exception 'mentor_entitlement_required'; end if;

    v_limit:=v_ent.mentor_max_concurrent;
    v_billing_mode:=v_ent.mentor_billing_mode;
    v_expires:=least(v_expires,coalesce(v_ent.expires_at,v_expires));

    if v_ent.plan_id='mentor' then
      v_billing_state:='included';
      v_credits_charged:=0;
    else
      if v_ent.mentor_credits_balance<=0 then raise exception 'mentor_credits_exhausted'; end if;
      v_billing_state:='settled';
      v_credits_charged:=1;
    end if;

    if v_ent.source='kiwify' and upper(coalesce(v_ent.currency_code,'BRL'))<>'BRL' then
      select lower(email) into v_email from auth.users where id=p_user_id;
      select * into v_cycle
      from public.laser_internal_current_pass_cycle(v_email)
      limit 1;
      if not found or v_cycle.plan_id<>v_ent.plan_id then
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
    where user_id=p_user_id
      and plan_id='control'
      and mentor_credits_balance>0;
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

revoke all on function public.laser_internal_claim_mentor(uuid,text) from public,anon,authenticated;
grant execute on function public.laser_internal_claim_mentor(uuid,text) to service_role;

-- Apply the new included PC capacity immediately without touching purchases or active sessions.
update devinx_laser.entitlements e
set max_pcs=case
      when e.plan_id='mentor' then greatest(e.max_pcs,5)
      when e.plan_id='control' then greatest(e.max_pcs,2)
      else e.max_pcs
    end,
    mentor_credits_balance=case when e.plan_id='mentor' then 0 else e.mentor_credits_balance end,
    mentor_billing_mode=case when e.plan_id='mentor' then 'included' else e.mentor_billing_mode end,
    mentor_access=case when e.plan_id='mentor' then true else e.mentor_access end,
    mentor_max_concurrent=case when e.plan_id='mentor' then 1 else e.mentor_max_concurrent end,
    updated_at=now()
where e.status='active'
  and e.plan_id in('control','mentor');

do $block$
declare
  r record;
begin
  for r in
    select e.user_id
    from devinx_laser.entitlements e
    where e.status='active' and e.plan_id in('control','mentor')
  loop
    perform public.laser_internal_recompute_pc_capacity(r.user_id);
  end loop;
end
$block$;

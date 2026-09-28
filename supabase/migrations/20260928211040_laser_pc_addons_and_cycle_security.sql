
create table if not exists devinx_laser.pc_addon_orders(
  order_id text primary key,
  email text not null,
  product_id text not null,
  checkout_link text not null,
  status text not null,
  slots integer not null default 1 check(slots between 1 and 100),
  plan_id text,
  user_id uuid,
  expires_at timestamptz,
  applied_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pc_addon_orders_user_active_idx
  on devinx_laser.pc_addon_orders(user_id,expires_at)
  where status='approved';

create index if not exists pc_addon_orders_email_idx
  on devinx_laser.pc_addon_orders(lower(email),created_at desc);

alter table devinx_laser.pc_addon_orders enable row level security;
revoke all on table devinx_laser.pc_addon_orders from anon,authenticated;

create or replace function public.laser_internal_current_paid_cycle(p_email text)
returns table(plan_id text,expires_at timestamptz,source text)
language plpgsql
security definer
set search_path to 'devinx_laser','public','auth'
as $function$
declare
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_sub devinx_laser.kiwify_subscriptions%rowtype;
  v_row record;
  v_segment_start timestamptz;
  v_segment_end timestamptz;
begin
  if v_email='' then return; end if;

  select * into v_sub
  from devinx_laser.kiwify_subscriptions s
  where s.email=v_email
    and s.has_access=true
    and s.access_until is not null
    and s.access_until>now();

  if found then
    return query select v_sub.plan_id,v_sub.access_until,'subscription'::text;
    return;
  end if;

  v_segment_end:=null;
  for v_row in
    select o.approved_at,o.duration_days,o.plan_id
    from devinx_laser.kiwify_pass_orders o
    where o.email=v_email
      and o.status='approved'
      and o.approved_at is not null
      and o.duration_days is not null
      and o.plan_id in ('control','mentor')
    order by o.approved_at,o.order_id
  loop
    v_segment_start:=case
      when v_segment_end is null then v_row.approved_at
      else greatest(v_segment_end,v_row.approved_at)
    end;
    v_segment_end:=v_segment_start+make_interval(days=>v_row.duration_days);

    if v_segment_start<=now() and v_segment_end>now() then
      return query select v_row.plan_id::text,v_segment_end,'pass'::text;
      return;
    end if;
  end loop;
end;
$function$;

revoke all on function public.laser_internal_current_paid_cycle(text) from public,anon,authenticated;
grant execute on function public.laser_internal_current_paid_cycle(text) to service_role;

create or replace function public.laser_internal_recompute_pc_capacity(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'devinx_laser','public'
as $function$
declare
  v_ent devinx_laser.entitlements%rowtype;
  v_extra integer:=0;
  v_limit integer:=1;
  v_revoked uuid[];
begin
  if p_user_id is null then return 0; end if;

  select * into v_ent
  from devinx_laser.entitlements e
  where e.user_id=p_user_id
  for update;

  if not found then return 0; end if;

  if v_ent.status='active'
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

  v_limit:=greatest(1,1+coalesce(v_extra,0));

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

create or replace function public.laser_internal_apply_pending_pc_addons(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'devinx_laser','public','auth'
as $function$
declare
  v_email text;
  v_count integer:=0;
begin
  select lower(email) into v_email from auth.users where id=p_user_id;
  if v_email is null then return 0; end if;

  update devinx_laser.pc_addon_orders o
  set user_id=p_user_id,
      applied_at=coalesce(o.applied_at,now()),
      updated_at=now()
  where lower(o.email)=v_email
    and o.status='approved'
    and o.expires_at is not null
    and o.expires_at>now()
    and (o.user_id is null or o.user_id=p_user_id);

  get diagnostics v_count=row_count;
  perform public.laser_internal_recompute_pc_capacity(p_user_id);
  return v_count;
end;
$function$;

revoke all on function public.laser_internal_apply_pending_pc_addons(uuid) from public,anon,authenticated;
grant execute on function public.laser_internal_apply_pending_pc_addons(uuid) to service_role;

create or replace function public.laser_internal_record_pc_addon(
  p_order_id text,
  p_email text,
  p_product_id text,
  p_checkout_link text,
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
  v_existing devinx_laser.pc_addon_orders%rowtype;
begin
  if p_order_id is null or trim(p_order_id)='' then raise exception 'pc_addon_order_id_missing'; end if;
  if v_email='' then raise exception 'customer email missing'; end if;
  if p_checkout_link not in ('IdNEzcp','PR4BNpa') then raise exception 'unknown_pc_addon_offer'; end if;

  select id into v_user_id from auth.users where lower(email)=v_email limit 1;

  select c.plan_id,c.expires_at
    into v_plan_id,v_expires_at
  from public.laser_internal_current_paid_cycle(v_email) c
  limit 1;

  select * into v_existing
  from devinx_laser.pc_addon_orders o
  where o.order_id=p_order_id
  for update;

  if p_reversed then
    insert into devinx_laser.pc_addon_orders(
      order_id,email,product_id,checkout_link,status,slots,plan_id,user_id,
      expires_at,reversed_at,updated_at
    ) values(
      p_order_id,v_email,p_product_id,p_checkout_link,'reversed',1,v_plan_id,v_user_id,
      v_expires_at,now(),now()
    )
    on conflict(order_id) do update set
      status='reversed',
      reversed_at=coalesce(devinx_laser.pc_addon_orders.reversed_at,now()),
      updated_at=now();

    if found and v_existing.user_id is not null then
      perform public.laser_internal_recompute_pc_capacity(v_existing.user_id);
    elsif v_user_id is not null then
      perform public.laser_internal_recompute_pc_capacity(v_user_id);
    end if;

    return jsonb_build_object('ok',true,'order',p_order_id,'status','reversed','slots',1);
  end if;

  if v_expires_at is null or v_expires_at<=now() or v_plan_id not in ('control','mentor') then
    insert into devinx_laser.pc_addon_orders(
      order_id,email,product_id,checkout_link,status,slots,plan_id,user_id,expires_at,updated_at
    ) values(
      p_order_id,v_email,p_product_id,p_checkout_link,'ineligible',1,v_plan_id,v_user_id,v_expires_at,now()
    )
    on conflict(order_id) do update set
      email=excluded.email,
      product_id=excluded.product_id,
      checkout_link=excluded.checkout_link,
      status=case when devinx_laser.pc_addon_orders.status='reversed' then 'reversed' else 'ineligible' end,
      updated_at=now();

    return jsonb_build_object(
      'ok',true,'order',p_order_id,'status','ineligible','slots',0,
      'active_plan_required',true
    );
  end if;

  insert into devinx_laser.pc_addon_orders(
    order_id,email,product_id,checkout_link,status,slots,plan_id,user_id,
    expires_at,applied_at,updated_at
  ) values(
    p_order_id,v_email,p_product_id,p_checkout_link,'approved',1,v_plan_id,v_user_id,
    v_expires_at,case when v_user_id is not null then now() else null end,now()
  )
  on conflict(order_id) do update set
    email=excluded.email,
    product_id=excluded.product_id,
    checkout_link=excluded.checkout_link,
    slots=1,
    plan_id=coalesce(devinx_laser.pc_addon_orders.plan_id,excluded.plan_id),
    user_id=coalesce(devinx_laser.pc_addon_orders.user_id,excluded.user_id),
    expires_at=coalesce(devinx_laser.pc_addon_orders.expires_at,excluded.expires_at),
    applied_at=case
      when devinx_laser.pc_addon_orders.status='reversed' then devinx_laser.pc_addon_orders.applied_at
      else coalesce(devinx_laser.pc_addon_orders.applied_at,excluded.applied_at)
    end,
    status=case
      when devinx_laser.pc_addon_orders.status='reversed' then 'reversed'
      else 'approved'
    end,
    updated_at=now();

  if v_user_id is not null then
    perform public.laser_internal_apply_pending_pc_addons(v_user_id);
  end if;

  return jsonb_build_object(
    'ok',true,'order',p_order_id,'status','approved','slots',1,
    'expires_at',v_expires_at,'plan',v_plan_id,
    'renewal_carries_over',false
  );
end;
$function$;

revoke all on function public.laser_internal_record_pc_addon(text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.laser_internal_record_pc_addon(text,text,text,text,boolean) to service_role;

create or replace function public.process_kiwify_laser_pc_addon_webhook(p_payload jsonb,p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'devinx_laser','public','auth'
as $function$
declare
  v_expected_hash text;
  v_expected_product text;
  v_extra_product text;
  v_intl_product text;
  v_product_id text;
  v_checkout_link text;
  v_email text;
  v_event text;
  v_order_status text;
  v_order_id text;
  v_approved boolean:=false;
  v_reversed boolean:=false;
begin
  select kiwify_laser_token_hash,kiwify_laser_extra_product_id,kiwify_laser_international_product_id
    into v_expected_hash,v_extra_product,v_intl_product
  from public.devinx_integration_settings
  where singleton=true;

  if v_expected_hash is null or p_token_hash is distinct from v_expected_hash then
    raise exception 'webhook unauthorized';
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
  elsif v_checkout_link='PR4BNpa' then
    v_expected_product:=v_intl_product;
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

  v_email:=lower(trim(coalesce(
    p_payload#>>'{Customer,email}',p_payload#>>'{customer,email}',p_payload->>'email',''
  )));
  if v_email='' then raise exception 'customer email missing'; end if;

  v_event:=lower(coalesce(p_payload->>'webhook_event_type',p_payload->>'event_type',p_payload->>'event',''));
  v_order_status:=lower(coalesce(p_payload->>'order_status',p_payload#>>'{order,status}',p_payload#>>'{Order,status}',''));
  v_order_id:=nullif(coalesce(
    p_payload->>'order_id',p_payload->>'order_ref',
    p_payload#>>'{order,order_id}',p_payload#>>'{Order,order_id}',
    p_payload#>>'{order,id}',p_payload#>>'{Order,id}',''
  ),'');
  if v_order_id is null then raise exception 'pc_addon_order_id_missing'; end if;

  v_reversed:=v_event in ('order_refunded','compra_reembolsada','chargeback','order_chargeback')
    or v_order_status in ('refunded','chargedback','chargeback');
  v_approved:=not v_reversed and (
    v_event in ('order_approved','compra_aprovada','order_paid','purchase_approved')
    or v_order_status in ('paid','approved')
  );

  if not v_approved and not v_reversed then
    return jsonb_build_object('ok',true,'ignored','event','event',v_event);
  end if;

  return public.laser_internal_record_pc_addon(
    v_order_id,v_email,v_product_id,v_checkout_link,v_reversed
  );
end;
$function$;

revoke all on function public.process_kiwify_laser_pc_addon_webhook(jsonb,text) from public;
grant execute on function public.process_kiwify_laser_pc_addon_webhook(jsonb,text) to anon,authenticated,service_role;

create or replace function public.get_laser_pc_capacity()
returns table(max_pcs integer,active_pcs integer,extra_pcs integer,expires_at timestamptz)
language plpgsql
security definer
set search_path to 'devinx_laser','public'
as $function$
declare
  v_user uuid:=auth.uid();
  v_admin boolean:=false;
  v_limit integer:=0;
  v_exp timestamptz;
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

  select e.max_pcs,e.expires_at into v_limit,v_exp
  from devinx_laser.entitlements e
  where e.user_id=v_user
    and e.status='active'
    and e.owner_access=true
    and (e.expires_at is null or e.expires_at>now());

  if not found then return; end if;

  select count(*)::integer into v_active
  from devinx_laser.devices d
  where d.owner_user_id=v_user and d.connection_mode<>'mentor' and d.status='active';

  return query select v_limit,v_active,greatest(v_limit-1,0),v_exp;
end;
$function$;

revoke all on function public.get_laser_pc_capacity() from public,anon;
grant execute on function public.get_laser_pc_capacity() to authenticated,service_role;

create or replace function public.get_laser_access_status()
returns table(
  allowed boolean,
  is_admin boolean,
  owner_access boolean,
  mentor_access boolean,
  plan_id text,
  expires_at timestamptz,
  mentor_billing_mode text,
  mentor_max_concurrent integer
)
language plpgsql
security definer
set search_path to 'devinx_laser','public'
as $function$
declare
  v_user uuid:=auth.uid();
  v_admin boolean:=false;
  v_ent devinx_laser.entitlements%rowtype;
begin
  if v_user is null then
    return query select false,false,false,false,null::text,null::timestamptz,'disabled'::text,1;
    return;
  end if;

  select exists(select 1 from public.devinx_admin_users a where a.user_id=v_user) into v_admin;
  if v_admin then
    return query select true,true,true,true,'master'::text,null::timestamptz,'master'::text,25;
    return;
  end if;

  perform public.laser_internal_sync_entitlement_from_purchase(v_user);
  perform public.laser_internal_apply_pending_mentor_credits(v_user);
  perform public.laser_internal_apply_pending_pc_addons(v_user);

  select * into v_ent from devinx_laser.entitlements e
  where e.user_id=v_user and e.status='active' and (e.expires_at is null or e.expires_at>now());

  if not found then
    return query select false,false,false,false,null::text,null::timestamptz,'disabled'::text,1;
    return;
  end if;

  return query select
    coalesce(v_ent.owner_access,false),false,coalesce(v_ent.owner_access,false),
    coalesce(v_ent.mentor_access,false) and v_ent.mentor_billing_mode<>'disabled',
    v_ent.plan_id,v_ent.expires_at,v_ent.mentor_billing_mode,v_ent.mentor_max_concurrent;
end;
$function$;

create or replace function public.laser_internal_claim_pairing(
  p_user_id uuid,
  p_pairing_code_hash text,
  p_display_name text
)
returns table(device_id uuid,status text)
language plpgsql
security definer
set search_path to 'devinx_laser','public'
as $function$
declare
  v_offer devinx_laser.pairing_offers%rowtype;
  v_existing devinx_laser.devices%rowtype;
  v_ent devinx_laser.entitlements%rowtype;
  v_is_admin boolean;
  v_active_pcs integer;
  v_name text;
  v_swap_ids uuid[];
begin
  if p_user_id is null or p_pairing_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_claim';
  end if;

  v_name:=left(coalesce(nullif(trim(p_display_name),''),'PC Windows'),80);

  select * into v_offer
  from devinx_laser.pairing_offers
  where pairing_code_hash=p_pairing_code_hash
    and consumed_at is null
    and expires_at>now()
  for update;

  if not found then raise exception 'pairing_offer_not_found'; end if;

  select exists(
    select 1 from public.devinx_admin_users a where a.user_id=p_user_id
  ) into v_is_admin;

  if not v_is_admin then
    perform public.laser_internal_sync_entitlement_from_purchase(p_user_id);
    perform public.laser_internal_apply_pending_pc_addons(p_user_id);

    select * into v_ent
    from devinx_laser.entitlements e
    where e.user_id=p_user_id
      and e.status='active'
      and e.owner_access=true
      and (e.expires_at is null or e.expires_at>now())
    for update;

    if not found then raise exception 'laser_entitlement_required'; end if;
  end if;

  select * into v_existing
  from devinx_laser.devices
  where id=v_offer.device_id or public_key_fingerprint=v_offer.public_key_fingerprint
  limit 1
  for update;

  if found then
    if v_existing.owner_user_id<>p_user_id then raise exception 'device_already_owned'; end if;

    if v_existing.status='active' then
      update devinx_laser.pairing_offers set consumed_at=now() where id=v_offer.id;
      return query select v_existing.id,v_existing.status;
      return;
    end if;

    if not v_is_admin then
      select count(*) into v_active_pcs
      from devinx_laser.devices d
      where d.owner_user_id=p_user_id
        and d.connection_mode<>'mentor'
        and d.status='active'
        and d.id<>v_existing.id;

      if v_active_pcs>=v_ent.max_pcs then
        if v_ent.max_pcs=1 then
          with swapped as(
            update devinx_laser.devices d
            set status='revoked',revoked_at=coalesce(d.revoked_at,now()),
                remote_control_enabled=false,updated_at=now()
            where d.owner_user_id=p_user_id
              and d.connection_mode<>'mentor'
              and d.status='active'
              and d.id<>v_existing.id
            returning d.id
          )
          select array_agg(id) into v_swap_ids from swapped;
        else
          raise exception 'laser_pc_limit_reached';
        end if;
      end if;
    end if;

    if coalesce(array_length(v_swap_ids,1),0)>0 then
      update devinx_laser.remote_sessions rs
      set status='closed',remote_input_enabled=false,input_token=null,
          closed_at=coalesce(rs.closed_at,now()),updated_at=now(),revision=rs.revision+1
      where rs.device_id=any(v_swap_ids) and rs.status='active';
    end if;

    update devinx_laser.devices d
    set status='active',revoked_at=null,display_name=v_name,
        agent_version=v_offer.agent_version,paired_at=now(),updated_at=now()
    where d.id=v_existing.id;

    update devinx_laser.pairing_offers set consumed_at=now() where id=v_offer.id;
    return query select v_existing.id,'active'::text;
    return;
  end if;

  if not v_is_admin then
    select count(*) into v_active_pcs
    from devinx_laser.devices d
    where d.owner_user_id=p_user_id
      and d.connection_mode<>'mentor'
      and d.status='active';

    if v_active_pcs>=v_ent.max_pcs then
      if v_ent.max_pcs=1 then
        with swapped as(
          update devinx_laser.devices d
          set status='revoked',revoked_at=coalesce(d.revoked_at,now()),
              remote_control_enabled=false,updated_at=now()
          where d.owner_user_id=p_user_id
            and d.connection_mode<>'mentor'
            and d.status='active'
          returning d.id
        )
        select array_agg(id) into v_swap_ids from swapped;
      else
        raise exception 'laser_pc_limit_reached';
      end if;
    end if;
  end if;

  if coalesce(array_length(v_swap_ids,1),0)>0 then
    update devinx_laser.remote_sessions rs
    set status='closed',remote_input_enabled=false,input_token=null,
        closed_at=coalesce(rs.closed_at,now()),updated_at=now(),revision=rs.revision+1
    where rs.device_id=any(v_swap_ids) and rs.status='active';
  end if;

  insert into devinx_laser.devices(
    id,owner_user_id,display_name,public_key_pem,public_key_fingerprint,
    status,agent_version,paired_at,remote_control_enabled,last_sequence
  )
  values(
    v_offer.device_id,p_user_id,v_name,v_offer.public_key_pem,v_offer.public_key_fingerprint,
    'active',v_offer.agent_version,now(),false,0
  );

  update devinx_laser.pairing_offers set consumed_at=now() where id=v_offer.id;
  return query select v_offer.device_id,'active'::text;
end;
$function$;

create or replace function public.laser_internal_open_remote_session(
  p_user_id uuid,
  p_device_id uuid
)
returns table(
  session_id uuid,
  topic text,
  frame_token text,
  control_token text,
  input_token text,
  remote_input_enabled boolean,
  revision bigint,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path to 'devinx_laser','public'
as $function$
declare
  v_id uuid;
  v_access_until timestamptz;
  v_lease_until timestamptz;
begin
  if not public.laser_internal_user_can_control_device(p_user_id,p_device_id) then
    raise exception 'remote_device_not_found';
  end if;

  select case when d.connection_mode='mentor' then d.access_expires_at else null end
    into v_access_until
  from devinx_laser.devices d
  where d.id=p_device_id and d.status='active';

  v_lease_until:=least(
    now()+interval '45 seconds',
    coalesce(v_access_until,now()+interval '45 seconds')
  );
  if v_lease_until<=now() then raise exception 'remote_device_not_found'; end if;

  update devinx_laser.remote_sessions as rs
  set status='closed',remote_input_enabled=false,input_token=null,
      closed_at=now(),updated_at=now(),revision=rs.revision+1
  where rs.device_id=p_device_id and rs.status='active' and rs.expires_at<=now();

  select rs.id into v_id
  from devinx_laser.remote_sessions rs
  where rs.device_id=p_device_id and rs.owner_user_id=p_user_id
    and rs.status='active' and rs.expires_at>now()
  order by rs.created_at desc limit 1;

  if v_id is null then
    update devinx_laser.remote_sessions as rs
    set status='closed',remote_input_enabled=false,input_token=null,
        closed_at=now(),updated_at=now(),revision=rs.revision+1
    where rs.device_id=p_device_id and rs.status='active';

    insert into devinx_laser.remote_sessions(
      owner_user_id,device_id,topic,frame_token,control_token,expires_at
    ) values(
      p_user_id,p_device_id,
      'laser-'||replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),
      encode(extensions.gen_random_bytes(32),'hex'),
      encode(extensions.gen_random_bytes(32),'hex'),
      v_lease_until
    ) returning id into v_id;
  else
    update devinx_laser.remote_sessions as rs
    set expires_at=v_lease_until,updated_at=now()
    where rs.id=v_id;
  end if;

  return query
  select rs.id,rs.topic,rs.frame_token,rs.control_token,rs.input_token,
         rs.remote_input_enabled,rs.revision,rs.expires_at
  from devinx_laser.remote_sessions rs where rs.id=v_id;
end;
$function$;

create or replace function public.laser_internal_set_remote_input(
  p_user_id uuid,
  p_session_id uuid,
  p_enabled boolean
)
returns table(enabled boolean,input_token text,revision bigint,expires_at timestamptz)
language plpgsql
security definer
set search_path to 'devinx_laser','public'
as $function$
declare
  v_device_id uuid;
  v_access_until timestamptz;
  v_lease_until timestamptz;
begin
  select rs.device_id into v_device_id
  from devinx_laser.remote_sessions rs
  where rs.id=p_session_id
    and rs.status='active'
    and rs.expires_at>now()
    and rs.owner_user_id=p_user_id;

  if v_device_id is null
     or not public.laser_internal_user_can_control_device(p_user_id,v_device_id) then
    raise exception 'remote_session_not_found';
  end if;

  select case when d.connection_mode='mentor' then d.access_expires_at else null end
    into v_access_until
  from devinx_laser.devices d
  where d.id=v_device_id and d.status='active';

  v_lease_until:=least(
    now()+interval '45 seconds',
    coalesce(v_access_until,now()+interval '45 seconds')
  );
  if v_lease_until<=now() then raise exception 'remote_session_not_found'; end if;

  update devinx_laser.remote_sessions as rs
  set remote_input_enabled=p_enabled,
      input_token=case when p_enabled then encode(extensions.gen_random_bytes(32),'hex') else null end,
      revision=rs.revision+1,
      expires_at=v_lease_until,
      updated_at=now()
  where rs.id=p_session_id;

  return query
  select rs.remote_input_enabled,rs.input_token,rs.revision,rs.expires_at
  from devinx_laser.remote_sessions rs
  where rs.id=p_session_id;
end;
$function$;

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
  v_sessions integer:=5;
begin
  if p_order_id is null or trim(p_order_id)='' then raise exception 'extra_order_id_missing'; end if;
  if v_email='' then raise exception 'customer email missing'; end if;

  select id into v_user_id from auth.users where lower(email)=v_email limit 1;

  select c.plan_id,c.expires_at into v_plan_id,v_expires_at
  from public.laser_internal_current_paid_cycle(v_email) c
  where c.plan_id='mentor'
  limit 1;

  select * into v_order
  from devinx_laser.mentor_credit_orders
  where order_id=p_order_id
  for update;

  if p_reversed then
    if found
       and v_order.credited_at is not null
       and v_order.reversed_at is null
       and v_order.user_id is not null
       and v_order.expires_at is not null
       and v_order.expires_at>now() then
      update devinx_laser.entitlements
      set mentor_credits_balance=greatest(0,mentor_credits_balance-v_order.credits),updated_at=now()
      where user_id=v_order.user_id
        and status='active'
        and plan_id='mentor'
        and expires_at>now();
    end if;

    insert into devinx_laser.mentor_credit_orders(
      order_id,email,product_id,status,credits,user_id,expires_at,reversed_at,updated_at
    ) values(p_order_id,v_email,p_product_id,'reversed',v_sessions,v_user_id,v_expires_at,now(),now())
    on conflict(order_id) do update set
      status='reversed',
      reversed_at=coalesce(devinx_laser.mentor_credit_orders.reversed_at,now()),
      updated_at=now();

    return jsonb_build_object('ok',true,'order',p_order_id,'status','reversed','sessions',v_sessions);
  end if;

  insert into devinx_laser.mentor_credit_orders(
    order_id,email,product_id,status,credits,user_id,expires_at,updated_at
  ) values(p_order_id,v_email,p_product_id,'approved',v_sessions,v_user_id,v_expires_at,now())
  on conflict(order_id) do update set
    email=excluded.email,
    product_id=excluded.product_id,
    credits=5,
    user_id=coalesce(devinx_laser.mentor_credit_orders.user_id,excluded.user_id),
    expires_at=coalesce(devinx_laser.mentor_credit_orders.expires_at,excluded.expires_at),
    status=case when devinx_laser.mentor_credit_orders.status='reversed' then 'reversed' else 'approved' end,
    updated_at=now();

  if v_user_id is not null and v_expires_at is not null and v_expires_at>now() then
    perform public.laser_internal_apply_pending_mentor_credits(v_user_id);
  end if;

  return jsonb_build_object(
    'ok',true,'order',p_order_id,'status','approved','sessions',v_sessions,
    'expires_at',v_expires_at,
    'active_mentor_required',v_expires_at is null
  );
end;
$function$;

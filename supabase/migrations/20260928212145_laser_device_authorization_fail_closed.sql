
create or replace function public.laser_internal_user_can_control_device(p_user_id uuid,p_device_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'devinx_laser','public'
as $function$
declare
  v_device devinx_laser.devices%rowtype;
  v_ent devinx_laser.entitlements%rowtype;
  v_admin boolean:=false;
  v_limit integer:=1;
  v_rank integer:=0;
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
    return found;
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
set search_path to 'devinx_laser','public'
as $function$
declare
  v_device devinx_laser.devices%rowtype;
  v_ent devinx_laser.entitlements%rowtype;
  v_admin boolean:=false;
  v_rank integer:=0;
  v_extra_until timestamptz;
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

  if v_device.connection_mode='mentor' then
    return v_device.access_expires_at;
  end if;

  if v_admin then return null; end if;

  select * into v_ent
  from devinx_laser.entitlements e
  where e.user_id=p_user_id
    and e.status='active'
    and e.owner_access=true
    and (e.expires_at is null or e.expires_at>now());

  if not found then return now(); end if;

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

revoke all on function public.laser_internal_device_access_deadline(uuid,uuid) from public,anon,authenticated;
grant execute on function public.laser_internal_device_access_deadline(uuid,uuid) to service_role;

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

  v_access_until:=public.laser_internal_device_access_deadline(p_user_id,p_device_id);
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

  v_access_until:=public.laser_internal_device_access_deadline(p_user_id,v_device_id);
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

create or replace function public.laser_internal_agent_remote_session(p_device_id uuid)
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
language sql
security definer
set search_path to 'devinx_laser','public'
as $function$
  select rs.id,rs.topic,rs.frame_token,rs.control_token,rs.input_token,
         rs.remote_input_enabled,rs.revision,rs.expires_at
  from devinx_laser.remote_sessions rs
  join devinx_laser.devices d on d.id=rs.device_id
  where rs.device_id=p_device_id
    and d.status='active'
    and public.laser_internal_user_can_control_device(rs.owner_user_id,d.id)
    and rs.status='active'
    and rs.expires_at>now()
  order by rs.created_at desc
  limit 1;
$function$;

create or replace function public.laser_internal_agent_next_session_command(p_device_id uuid)
returns table(command_id uuid,command_type text,expires_at timestamptz)
language plpgsql
security definer
set search_path to 'devinx_laser','public'
as $function$
declare
  v_id uuid;
  v_type text;
  v_expires timestamptz;
begin
  if not exists(
    select 1
    from devinx_laser.remote_sessions rs
    join devinx_laser.devices d on d.id=rs.device_id
    where rs.device_id=p_device_id
      and rs.status='active'
      and rs.expires_at>now()
      and public.laser_internal_user_can_control_device(rs.owner_user_id,d.id)
  ) then
    return;
  end if;

  update devinx_laser.commands as c
  set status='expired',
      rejection_reason=coalesce(c.rejection_reason,'expired_before_delivery')
  where c.device_id=p_device_id
    and c.status='queued'
    and c.expires_at<=now();

  update devinx_laser.commands as c
  set status='expired',
      rejection_reason=coalesce(c.rejection_reason,'ack_timeout')
  where c.device_id=p_device_id
    and c.status='delivered'
    and c.expires_at<=now();

  select c.id,c.command_type,c.expires_at
  into v_id,v_type,v_expires
  from devinx_laser.commands c
  where c.device_id=p_device_id
    and c.status='queued'
    and c.expires_at>now()
  order by c.created_at
  for update skip locked
  limit 1;

  if v_id is null then return; end if;

  update devinx_laser.commands as c
  set status='delivered',delivered_at=now()
  where c.id=v_id and c.status='queued';

  insert into devinx_laser.command_events(command_id,device_id,event_type,detail)
  values(v_id,p_device_id,'delivered','{}'::jsonb);

  return query select v_id,v_type,v_expires;
end;
$function$;

create or replace function public.laser_internal_device_auth_context(p_device_id uuid)
returns table(public_key_pem text,public_key_fingerprint text,device_status text,last_sequence bigint)
language sql
stable
security definer
set search_path to 'devinx_laser','public'
as $function$
  select d.public_key_pem,d.public_key_fingerprint,
    case
      when d.status<>'active' then d.status
      when not public.laser_internal_user_can_control_device(d.owner_user_id,d.id) then 'revoked'
      else 'active'
    end,
    d.last_sequence
  from devinx_laser.devices d
  where d.id=p_device_id
  limit 1;
$function$;

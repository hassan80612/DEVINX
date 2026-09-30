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
    now()+interval '5 minutes',
    coalesce(v_access_until,now()+interval '5 minutes')
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
returns table(
  enabled boolean,
  input_token text,
  revision bigint,
  expires_at timestamptz
)
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
    now()+interval '5 minutes',
    coalesce(v_access_until,now()+interval '5 minutes')
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

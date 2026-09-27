create or replace function public.laser_internal_enqueue_session_command(
  p_user_id uuid,
  p_session_id uuid,
  p_device_id uuid,
  p_command_type text,
  p_idempotency_key uuid
)
returns table(command_id uuid,status text,expires_at timestamptz)
language plpgsql
security definer
set search_path to 'devinx_laser','public','realtime'
as $function$
declare
  v_command_id uuid;
  v_expires timestamptz;
  v_topic text;
  v_control_token text;
  v_machine boolean;
begin
  if p_command_type not in ('start','pause','stop','frame') then
    raise exception 'unsupported_command';
  end if;

  if not public.laser_internal_user_can_control_device(p_user_id,p_device_id) then
    raise exception 'remote_session_not_found';
  end if;

  select rs.topic,rs.control_token
  into v_topic,v_control_token
  from devinx_laser.remote_sessions rs
  where rs.id=p_session_id
    and rs.device_id=p_device_id
    and rs.owner_user_id=p_user_id
    and rs.status='active'
    and rs.expires_at>now();

  if v_topic is null then raise exception 'remote_session_not_found'; end if;

  select s.machine_connected
  into v_machine
  from devinx_laser.device_state s
  where s.device_id=p_device_id;

  if coalesce(v_machine,false)=false then
    raise exception 'machine_not_connected';
  end if;

  v_expires:=now()+case when p_command_type in ('start','frame') then interval '8 seconds' else interval '5 seconds' end;

  insert into devinx_laser.commands(
    owner_user_id,device_id,command_type,payload,idempotency_key,status,expires_at
  )
  values(
    p_user_id,p_device_id,p_command_type,
    jsonb_build_object('session_id',p_session_id),
    p_idempotency_key,'queued',v_expires
  )
  on conflict(device_id,idempotency_key)
  do update set idempotency_key=excluded.idempotency_key
  returning id into v_command_id;

  insert into devinx_laser.command_events(command_id,device_id,event_type,detail)
  values(
    v_command_id,p_device_id,'created',
    jsonb_build_object('command_type',p_command_type,'session_id',p_session_id)
  );

  perform realtime.send(
    jsonb_build_object(
      'token',v_control_token,
      'commandId',v_command_id,
      'command',p_command_type,
      'expiresAt',v_expires
    ),
    'command',v_topic,false
  );

  return query select v_command_id,'queued'::text,v_expires;
end
$function$;

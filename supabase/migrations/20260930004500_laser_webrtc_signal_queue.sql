create table if not exists devinx_laser.webrtc_signals(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references devinx_laser.remote_sessions(id) on delete cascade,
  device_id uuid not null references devinx_laser.devices(id) on delete cascade,
  user_id uuid not null,
  event text not null check (event in ('webrtc_offer','webrtc_ice','webrtc_stop')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '30 seconds'),
  consumed_at timestamptz
);

create index if not exists webrtc_signals_device_pending_idx
  on devinx_laser.webrtc_signals(device_id,created_at)
  where consumed_at is null;

revoke all on table devinx_laser.webrtc_signals from public,anon,authenticated;

create or replace function public.laser_internal_send_webrtc_signal(
  p_user_id uuid,
  p_session_id uuid,
  p_event text,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path to 'devinx_laser','public'
as $function$
declare
  v_device_id uuid;
  v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);
begin
  if p_event not in ('webrtc_offer','webrtc_ice','webrtc_stop') then
    raise exception 'unsupported_webrtc_signal';
  end if;
  if jsonb_typeof(v_payload)<>'object' then
    raise exception 'invalid_webrtc_payload';
  end if;
  if octet_length(v_payload::text)>100000 then
    raise exception 'webrtc_payload_too_large';
  end if;

  select rs.device_id into v_device_id
  from devinx_laser.remote_sessions rs
  where rs.id=p_session_id
    and rs.owner_user_id=p_user_id
    and rs.status='active'
    and rs.expires_at>now();

  if v_device_id is null then
    raise exception 'remote_session_not_found';
  end if;

  delete from devinx_laser.webrtc_signals
  where expires_at<=now()
     or (session_id=p_session_id and consumed_at is not null and consumed_at<now()-interval '10 seconds');

  if p_event='webrtc_offer' then
    delete from devinx_laser.webrtc_signals
    where session_id=p_session_id
      and consumed_at is null
      and event in ('webrtc_offer','webrtc_ice');
  elsif p_event='webrtc_stop' then
    delete from devinx_laser.webrtc_signals
    where session_id=p_session_id
      and consumed_at is null;
  end if;

  insert into devinx_laser.webrtc_signals(
    session_id,device_id,user_id,event,payload,expires_at
  ) values(
    p_session_id,v_device_id,p_user_id,p_event,v_payload,now()+interval '30 seconds'
  );

  return true;
end
$function$;

revoke all on function public.laser_internal_send_webrtc_signal(uuid,uuid,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.laser_internal_send_webrtc_signal(uuid,uuid,text,jsonb)
  to service_role;

create or replace function public.laser_internal_agent_next_webrtc_signal(
  p_device_id uuid
)
returns table(signal_id uuid,session_id uuid,event text,payload jsonb,created_at timestamptz)
language plpgsql
security definer
set search_path to 'devinx_laser','public'
as $function$
declare v_id uuid;
begin
  delete from devinx_laser.webrtc_signals
  where expires_at<=now()
     or (consumed_at is not null and consumed_at<now()-interval '10 seconds');

  select ws.id into v_id
  from devinx_laser.webrtc_signals ws
  join devinx_laser.remote_sessions rs on rs.id=ws.session_id
  where ws.device_id=p_device_id
    and ws.consumed_at is null
    and ws.expires_at>now()
    and rs.status='active'
    and rs.expires_at>now()
  order by ws.created_at
  limit 1
  for update of ws skip locked;

  if v_id is null then return; end if;

  return query
  update devinx_laser.webrtc_signals ws
  set consumed_at=now()
  where ws.id=v_id
  returning ws.id,ws.session_id,ws.event,ws.payload,ws.created_at;
end
$function$;

revoke all on function public.laser_internal_agent_next_webrtc_signal(uuid)
  from public,anon,authenticated;
grant execute on function public.laser_internal_agent_next_webrtc_signal(uuid)
  to service_role;

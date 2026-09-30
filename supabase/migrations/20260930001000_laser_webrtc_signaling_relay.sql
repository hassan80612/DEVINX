-- WebRTC signaling relay for Laser Control.
-- Browser -> Agent signaling is relayed server-side through realtime.send so
-- the existing stable Agent channel remains the single receiving path.

create or replace function public.laser_internal_send_webrtc_signal(
  p_user_id uuid,
  p_session_id uuid,
  p_event text,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path to 'devinx_laser','public','realtime'
as $function$
declare
  v_topic text;
  v_frame_token text;
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

  select rs.topic,rs.frame_token
    into v_topic,v_frame_token
  from devinx_laser.remote_sessions rs
  where rs.id=p_session_id
    and rs.owner_user_id=p_user_id
    and rs.status='active'
    and rs.expires_at>now();

  if v_topic is null or v_frame_token is null then
    raise exception 'remote_session_not_found';
  end if;

  perform realtime.send(
    v_payload || jsonb_build_object(
      'token',v_frame_token,
      'from','browser'
    ),
    p_event,
    v_topic,
    false
  );

  return true;
end
$function$;

revoke all on function public.laser_internal_send_webrtc_signal(uuid,uuid,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.laser_internal_send_webrtc_signal(uuid,uuid,text,jsonb)
  to service_role;

-- Historical hotfix: qualify remote-session columns to avoid RETURNS TABLE name collisions.
-- The immediately following migration also qualifies pgcrypto calls explicitly.
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
begin
  if not exists(
    select 1 from devinx_laser.devices d
    where d.id=p_device_id and d.status='active'
      and (d.owner_user_id=p_user_id or exists(
        select 1 from public.devinx_admin_users a where a.user_id=p_user_id
      ))
  ) then raise exception 'remote_device_not_found'; end if;

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
      now()+interval '45 seconds'
    ) returning id into v_id;
  else
    update devinx_laser.remote_sessions as rs
    set expires_at=now()+interval '45 seconds',updated_at=now()
    where rs.id=v_id;
  end if;

  return query
  select rs.id,rs.topic,rs.frame_token,rs.control_token,rs.input_token,
         rs.remote_input_enabled,rs.revision,rs.expires_at
  from devinx_laser.remote_sessions rs where rs.id=v_id;
end;
$function$;

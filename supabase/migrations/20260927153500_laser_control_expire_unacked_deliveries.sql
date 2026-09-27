create or replace function public.laser_internal_agent_next_session_command(p_device_id uuid)
returns table(command_id uuid, command_type text, expires_at timestamptz)
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
    select 1 from devinx_laser.remote_sessions rs
    where rs.device_id=p_device_id
      and rs.status='active'
      and rs.expires_at>now()
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

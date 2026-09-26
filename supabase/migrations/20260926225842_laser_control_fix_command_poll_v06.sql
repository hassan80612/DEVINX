create or replace function public.laser_internal_agent_next_command(
  p_device_id uuid
)
returns table(
  command_id uuid,
  command_type text,
  expires_at timestamptz,
  local_arm_until timestamptz
)
language plpgsql
security definer
set search_path=devinx_laser,public
as $$
declare
  v_id uuid;
  v_type text;
  v_expires timestamptz;
  v_arm_until timestamptz;
begin
  select d.local_arm_until
  into v_arm_until
  from devinx_laser.devices d
  where d.id=p_device_id
    and d.status='active'
    and d.remote_control_enabled=true
    and d.local_arm_until>now();

  if v_arm_until is null then return; end if;

  update devinx_laser.commands as c
  set status='expired',
      rejection_reason=coalesce(c.rejection_reason,'expired_before_delivery')
  where c.device_id=p_device_id
    and c.status='queued'
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

  return query select v_id,v_type,v_expires,v_arm_until;
end;
$$;

revoke all on function public.laser_internal_agent_next_command(uuid) from public,anon,authenticated;
grant execute on function public.laser_internal_agent_next_command(uuid) to service_role;

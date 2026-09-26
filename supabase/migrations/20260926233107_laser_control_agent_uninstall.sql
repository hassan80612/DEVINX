create or replace function public.laser_internal_agent_uninstall_device(
  p_device_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=devinx_laser,public
as $$
declare v_ok boolean;
begin
  update devinx_laser.remote_sessions
  set status='closed',
      remote_input_enabled=false,
      input_token=null,
      revision=revision+1,
      closed_at=now(),
      updated_at=now()
  where device_id=p_device_id and status='active';

  update devinx_laser.commands
  set status='expired',
      rejection_reason=coalesce(rejection_reason,'agent_uninstalled')
  where device_id=p_device_id and status in('queued','delivered');

  update devinx_laser.devices
  set status='revoked',
      remote_control_enabled=false,
      local_arm_until=null,
      updated_at=now()
  where id=p_device_id and status<>'revoked'
  returning true into v_ok;

  return coalesce(v_ok,false);
end;
$$;

revoke all on function public.laser_internal_agent_uninstall_device(uuid)
  from public,anon,authenticated;
grant execute on function public.laser_internal_agent_uninstall_device(uuid)
  to service_role;

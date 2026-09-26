-- Applied to DevinX Supabase as migration 20260926183437.
-- Master-only revocation/reactivation of paired Laser Control devices.

create or replace function public.laser_internal_admin_set_device_access(
  p_user_id uuid,
  p_device_id uuid,
  p_action text
)
returns table(device_id uuid, device_status text)
language plpgsql
security definer
set search_path to 'devinx_laser','public'
as $$
declare
  v_status text;
begin
  if not exists(select 1 from public.devinx_admin_users a where a.user_id=p_user_id) then
    raise exception 'admin_required';
  end if;

  if p_action not in ('revoke','reactivate') then
    raise exception 'invalid_device_action';
  end if;

  if p_action='revoke' then
    update devinx_laser.devices
    set status='revoked',revoked_at=now(),remote_control_enabled=false,local_arm_until=null,updated_at=now()
    where id=p_device_id
    returning status into v_status;

    update devinx_laser.control_sessions
    set status='revoked',released_at=coalesce(released_at,now())
    where device_id=p_device_id and status='active';

    update devinx_laser.commands
    set status='rejected',
        rejection_reason=coalesce(rejection_reason,'device_revoked'),
        acknowledged_at=coalesce(acknowledged_at,now())
    where device_id=p_device_id and status in ('queued','delivered');
  else
    update devinx_laser.devices
    set status='active',revoked_at=null,remote_control_enabled=false,local_arm_until=null,updated_at=now()
    where id=p_device_id
    returning status into v_status;
  end if;

  if v_status is null then raise exception 'device_not_found'; end if;
  return query select p_device_id,v_status;
end;
$$;

revoke all on function public.laser_internal_admin_set_device_access(uuid,uuid,text) from public;
revoke all on function public.laser_internal_admin_set_device_access(uuid,uuid,text) from anon;
revoke all on function public.laser_internal_admin_set_device_access(uuid,uuid,text) from authenticated;
grant execute on function public.laser_internal_admin_set_device_access(uuid,uuid,text) to service_role;

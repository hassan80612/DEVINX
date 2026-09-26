-- Applied to DevinX Supabase as migration 20260926182805.
-- Removes the temporary duplicate telemetry path and keeps device_state as the single source.

drop function if exists public.laser_internal_get_device_auth(uuid);
drop function if exists public.laser_internal_accept_heartbeat(uuid,bigint,text,text,jsonb);
drop function if exists public.laser_internal_admin_list_devices(uuid);

alter table devinx_laser.devices
  drop column if exists last_telemetry;

create or replace function public.laser_internal_admin_list_devices(
  p_user_id uuid
)
returns table(
  device_id uuid,
  owner_user_id uuid,
  display_name text,
  device_status text,
  agent_version text,
  adapter text,
  last_seen_at timestamptz,
  lightburn_online boolean,
  machine_connected boolean,
  machine_name text,
  job_state text,
  progress_permille integer,
  project_file text,
  captured_at timestamptz,
  remote_control_enabled boolean,
  local_arm_until timestamptz,
  paired_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'devinx_laser','public'
as $$
begin
  if not exists(select 1 from public.devinx_admin_users a where a.user_id=p_user_id) then
    raise exception 'admin_required';
  end if;

  return query
  select
    d.id,d.owner_user_id,d.display_name,d.status,d.agent_version,d.adapter,d.last_seen_at,
    s.lightburn_online,s.machine_connected,s.machine_name,s.job_state,s.progress_permille,
    s.project_file,s.captured_at,d.remote_control_enabled,d.local_arm_until,d.paired_at
  from devinx_laser.devices d
  left join devinx_laser.device_state s on s.device_id=d.id
  order by d.created_at desc;
end;
$$;

revoke all on function public.laser_internal_admin_list_devices(uuid) from public;
revoke all on function public.laser_internal_admin_list_devices(uuid) from anon;
revoke all on function public.laser_internal_admin_list_devices(uuid) from authenticated;
grant execute on function public.laser_internal_admin_list_devices(uuid) to service_role;

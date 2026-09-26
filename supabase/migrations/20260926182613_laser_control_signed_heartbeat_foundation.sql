-- Applied to DevinX Supabase as migration 20260926182613.
-- This temporary layer was immediately consolidated by migration 20260926182805.

alter table devinx_laser.devices
  add column if not exists last_telemetry jsonb not null default '{}'::jsonb;

create or replace function public.laser_internal_get_device_auth(
  p_device_id uuid
)
returns table(
  device_id uuid,
  public_key_pem text,
  public_key_fingerprint text,
  device_status text,
  last_sequence bigint
)
language sql
stable
security definer
set search_path to 'devinx_laser','public'
as $$
  select d.id,d.public_key_pem,d.public_key_fingerprint,d.status,d.last_sequence
  from devinx_laser.devices d
  where d.id=p_device_id
  limit 1;
$$;

revoke all on function public.laser_internal_get_device_auth(uuid) from public;
revoke all on function public.laser_internal_get_device_auth(uuid) from anon;
revoke all on function public.laser_internal_get_device_auth(uuid) from authenticated;
grant execute on function public.laser_internal_get_device_auth(uuid) to service_role;

create or replace function public.laser_internal_accept_heartbeat(
  p_device_id uuid,
  p_sequence bigint,
  p_agent_version text,
  p_adapter text,
  p_telemetry jsonb
)
returns boolean
language plpgsql
security definer
set search_path to 'devinx_laser','public'
as $$
declare
  v_updated integer;
begin
  if p_device_id is null
     or p_sequence < 1
     or char_length(coalesce(p_agent_version,'')) not between 1 and 40
     or p_adapter not in ('lightburn-rest','lightburn-udp-legacy')
     or p_telemetry is null
     or pg_column_size(p_telemetry) > 16384 then
    raise exception 'invalid_heartbeat';
  end if;

  update devinx_laser.devices
  set
    last_sequence=p_sequence,
    agent_version=p_agent_version,
    adapter=p_adapter,
    last_seen_at=now(),
    last_telemetry=p_telemetry,
    updated_at=now()
  where id=p_device_id
    and status='active'
    and p_sequence>last_sequence;

  get diagnostics v_updated=row_count;
  if v_updated<>1 then return false; end if;
  return true;
end;
$$;

revoke all on function public.laser_internal_accept_heartbeat(uuid,bigint,text,text,jsonb) from public;
revoke all on function public.laser_internal_accept_heartbeat(uuid,bigint,text,text,jsonb) from anon;
revoke all on function public.laser_internal_accept_heartbeat(uuid,bigint,text,text,jsonb) from authenticated;
grant execute on function public.laser_internal_accept_heartbeat(uuid,bigint,text,text,jsonb) to service_role;

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
  last_telemetry jsonb,
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
    d.last_telemetry,d.remote_control_enabled,d.local_arm_until,d.paired_at
  from devinx_laser.devices d
  order by d.created_at desc;
end;
$$;

revoke all on function public.laser_internal_admin_list_devices(uuid) from public;
revoke all on function public.laser_internal_admin_list_devices(uuid) from anon;
revoke all on function public.laser_internal_admin_list_devices(uuid) from authenticated;
grant execute on function public.laser_internal_admin_list_devices(uuid) to service_role;

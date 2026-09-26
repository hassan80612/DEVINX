-- Rollback for migration 20260926182805.
-- Restores the temporary duplicate heartbeat layer exactly enough for migration rollback.

alter table devinx_laser.devices
  add column if not exists last_telemetry jsonb not null default '{}'::jsonb;

drop function if exists public.laser_internal_admin_list_devices(uuid);

create or replace function public.laser_internal_get_device_auth(
  p_device_id uuid
)
returns table(device_id uuid,public_key_pem text,public_key_fingerprint text,device_status text,last_sequence bigint)
language sql stable security definer
set search_path to 'devinx_laser','public'
as $$
  select d.id,d.public_key_pem,d.public_key_fingerprint,d.status,d.last_sequence
  from devinx_laser.devices d where d.id=p_device_id limit 1;
$$;

revoke all on function public.laser_internal_get_device_auth(uuid) from public,anon,authenticated;
grant execute on function public.laser_internal_get_device_auth(uuid) to service_role;

create or replace function public.laser_internal_accept_heartbeat(
  p_device_id uuid,p_sequence bigint,p_agent_version text,p_adapter text,p_telemetry jsonb
)
returns boolean
language plpgsql security definer
set search_path to 'devinx_laser','public'
as $$
declare v_updated integer;
begin
  update devinx_laser.devices
  set last_sequence=p_sequence,agent_version=p_agent_version,adapter=p_adapter,last_seen_at=now(),
      last_telemetry=p_telemetry,updated_at=now()
  where id=p_device_id and status='active' and p_sequence>last_sequence;
  get diagnostics v_updated=row_count;
  return v_updated=1;
end;
$$;

revoke all on function public.laser_internal_accept_heartbeat(uuid,bigint,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.laser_internal_accept_heartbeat(uuid,bigint,text,text,jsonb) to service_role;

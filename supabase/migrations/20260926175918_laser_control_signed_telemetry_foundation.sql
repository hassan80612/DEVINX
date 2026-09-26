-- Applied to DevinX Supabase as migration 20260926175918.
-- Canonical signed telemetry foundation used by the Agent.

create table if not exists devinx_laser.device_state (
  device_id uuid primary key references devinx_laser.devices(id) on delete cascade,
  lightburn_online boolean not null default false,
  machine_connected boolean not null default false,
  machine_name text,
  job_state text not null default 'unknown'
    check (job_state in ('unknown','idle','running','paused','busy')),
  progress_permille integer
    check (progress_permille is null or (progress_permille between 0 and 1000)),
  project_file text,
  captured_at timestamptz not null,
  received_at timestamptz not null default now()
);

alter table devinx_laser.device_state enable row level security;
revoke all on table devinx_laser.device_state from public;
revoke all on table devinx_laser.device_state from anon;
revoke all on table devinx_laser.device_state from authenticated;

create or replace function public.laser_internal_device_auth_context(
  p_device_id uuid
)
returns table(
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
  select d.public_key_pem,d.public_key_fingerprint,d.status,d.last_sequence
  from devinx_laser.devices d
  where d.id=p_device_id
  limit 1;
$$;

revoke all on function public.laser_internal_device_auth_context(uuid) from public;
revoke all on function public.laser_internal_device_auth_context(uuid) from anon;
revoke all on function public.laser_internal_device_auth_context(uuid) from authenticated;
grant execute on function public.laser_internal_device_auth_context(uuid) to service_role;

create or replace function public.laser_internal_accept_telemetry(
  p_device_id uuid,
  p_sequence bigint,
  p_agent_version text,
  p_adapter text,
  p_lightburn_online boolean,
  p_machine_connected boolean,
  p_machine_name text,
  p_job_state text,
  p_progress_permille integer,
  p_project_file text,
  p_captured_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path to 'devinx_laser','public'
as $$
declare
  v_updated uuid;
begin
  if p_device_id is null
     or p_sequence is null or p_sequence < 1
     or p_adapter not in ('lightburn-rest','lightburn-udp-legacy')
     or p_job_state not in ('unknown','idle','running','paused','busy')
     or (p_progress_permille is not null and (p_progress_permille < 0 or p_progress_permille > 1000))
     or char_length(coalesce(p_agent_version,'')) > 40
     or char_length(coalesce(p_machine_name,'')) > 160
     or char_length(coalesce(p_project_file,'')) > 500
     or p_captured_at < now()-interval '5 minutes'
     or p_captured_at > now()+interval '1 minute' then
    raise exception 'invalid_telemetry';
  end if;

  update devinx_laser.devices
  set
    last_sequence=p_sequence,
    last_seen_at=now(),
    agent_version=nullif(p_agent_version,''),
    adapter=p_adapter,
    updated_at=now()
  where id=p_device_id
    and status='active'
    and last_sequence < p_sequence
  returning id into v_updated;

  if v_updated is null then
    if exists(select 1 from devinx_laser.devices where id=p_device_id and status<>'active') then
      raise exception 'device_not_active';
    end if;
    raise exception 'stale_sequence';
  end if;

  insert into devinx_laser.device_state(
    device_id,lightburn_online,machine_connected,machine_name,job_state,
    progress_permille,project_file,captured_at,received_at
  )
  values(
    p_device_id,p_lightburn_online,p_machine_connected,nullif(left(coalesce(p_machine_name,''),160),''),
    p_job_state,p_progress_permille,nullif(left(coalesce(p_project_file,''),500),''),
    p_captured_at,now()
  )
  on conflict(device_id) do update set
    lightburn_online=excluded.lightburn_online,
    machine_connected=excluded.machine_connected,
    machine_name=excluded.machine_name,
    job_state=excluded.job_state,
    progress_permille=excluded.progress_permille,
    project_file=excluded.project_file,
    captured_at=excluded.captured_at,
    received_at=excluded.received_at;

  return true;
end;
$$;

revoke all on function public.laser_internal_accept_telemetry(uuid,bigint,text,text,boolean,boolean,text,text,integer,text,timestamptz) from public;
revoke all on function public.laser_internal_accept_telemetry(uuid,bigint,text,text,boolean,boolean,text,text,integer,text,timestamptz) from anon;
revoke all on function public.laser_internal_accept_telemetry(uuid,bigint,text,text,boolean,boolean,text,text,integer,text,timestamptz) from authenticated;
grant execute on function public.laser_internal_accept_telemetry(uuid,bigint,text,text,boolean,boolean,text,text,integer,text,timestamptz) to service_role;

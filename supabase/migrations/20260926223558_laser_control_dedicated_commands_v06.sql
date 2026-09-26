-- Laser Control v0.6: retire touch experiment and enable dedicated short-lived commands.

update devinx_laser.devices
set remote_control_enabled=false,
    local_arm_until=null,
    updated_at=now()
where remote_control_enabled=true or local_arm_until is not null;

drop function if exists public.laser_internal_set_preview_touch(uuid,uuid,boolean);
drop function if exists public.laser_internal_queue_preview_tap(uuid,uuid,double precision,double precision);
drop function if exists public.laser_internal_preview_control_state(uuid,bigint);
drop function if exists public.laser_internal_agent_set_local_arm(uuid,boolean);

alter table devinx_laser.preview_state
  drop column if exists touch_event_at,
  drop column if exists touch_event,
  drop column if exists touch_event_seq,
  drop column if exists touch_enabled;

create or replace function public.laser_internal_agent_set_remote_arm(
  p_device_id uuid,
  p_enabled boolean
)
returns timestamptz
language plpgsql
security definer
set search_path=devinx_laser,public
as $$
declare v_until timestamptz;
begin
  if not exists(
    select 1 from devinx_laser.devices d
    where d.id=p_device_id and d.status='active'
  ) then
    raise exception 'device_not_active';
  end if;

  v_until:=case when p_enabled then now()+interval '5 minutes' else null end;

  update devinx_laser.devices
  set remote_control_enabled=p_enabled,
      local_arm_until=v_until,
      updated_at=now()
  where id=p_device_id;

  if not p_enabled then
    update devinx_laser.commands
    set status='expired',
        rejection_reason='local_arm_disabled'
    where device_id=p_device_id
      and status in ('queued','delivered')
      and expires_at>now();
  end if;

  return v_until;
end;
$$;

create or replace function public.laser_internal_enqueue_command(
  p_user_id uuid,
  p_device_id uuid,
  p_command_type text,
  p_idempotency_key uuid
)
returns table(command_id uuid,status text,expires_at timestamptz)
language plpgsql
security definer
set search_path=devinx_laser,public
as $$
declare
  v_command_id uuid;
  v_expires timestamptz;
  v_state text;
  v_machine boolean;
begin
  if p_command_type not in ('start','pause','stop','frame') then
    raise exception 'unsupported_command';
  end if;

  if not exists(
    select 1
    from devinx_laser.devices d
    where d.id=p_device_id
      and d.status='active'
      and d.remote_control_enabled=true
      and d.local_arm_until>now()
      and (
        d.owner_user_id=p_user_id
        or exists(select 1 from public.devinx_admin_users a where a.user_id=p_user_id)
      )
  ) then
    raise exception 'remote_control_not_armed';
  end if;

  select s.job_state,s.machine_connected
  into v_state,v_machine
  from devinx_laser.device_state s
  where s.device_id=p_device_id;

  if coalesce(v_machine,false)=false then
    raise exception 'machine_not_connected';
  end if;

  if p_command_type in ('start','frame') and coalesce(v_state,'unknown')<>'idle' then
    raise exception 'machine_not_idle';
  end if;

  if p_command_type='pause' and coalesce(v_state,'unknown') not in ('running','busy') then
    raise exception 'not_running';
  end if;

  v_expires:=now()+case when p_command_type in ('start','frame') then interval '8 seconds'
                        else interval '5 seconds' end;

  insert into devinx_laser.commands(
    owner_user_id,device_id,command_type,payload,idempotency_key,status,expires_at
  )
  values(
    p_user_id,p_device_id,p_command_type,'{}'::jsonb,p_idempotency_key,'queued',v_expires
  )
  on conflict(device_id,idempotency_key) do update
    set idempotency_key=excluded.idempotency_key
  returning id into v_command_id;

  insert into devinx_laser.command_events(command_id,device_id,event_type,detail)
  values(v_command_id,p_device_id,'created',jsonb_build_object('command_type',p_command_type));

  return query select v_command_id,'queued'::text,v_expires;
end;
$$;

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

  update devinx_laser.commands
  set status='expired',
      rejection_reason=coalesce(rejection_reason,'expired_before_delivery')
  where device_id=p_device_id
    and status='queued'
    and expires_at<=now();

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

  update devinx_laser.commands
  set status='delivered',
      delivered_at=now()
  where id=v_id and status='queued';

  insert into devinx_laser.command_events(command_id,device_id,event_type,detail)
  values(v_id,p_device_id,'delivered','{}'::jsonb);

  return query select v_id,v_type,v_expires,v_arm_until;
end;
$$;

create or replace function public.laser_internal_agent_ack_command(
  p_device_id uuid,
  p_command_id uuid,
  p_ok boolean,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path=devinx_laser,public
as $$
declare v_updated boolean;
begin
  update devinx_laser.commands
  set status=case when p_ok then 'acknowledged' else 'rejected' end,
      acknowledged_at=now(),
      rejection_reason=case when p_ok then null else left(coalesce(p_reason,'rejected'),160) end
  where id=p_command_id
    and device_id=p_device_id
    and status='delivered'
  returning true into v_updated;

  if coalesce(v_updated,false) then
    insert into devinx_laser.command_events(command_id,device_id,event_type,detail)
    values(
      p_command_id,
      p_device_id,
      case when p_ok then 'completed' else 'rejected' end,
      case when p_ok then '{}'::jsonb
           else jsonb_build_object('reason',left(coalesce(p_reason,'rejected'),160))
      end
    );
  end if;

  return coalesce(v_updated,false);
end;
$$;

create or replace function public.laser_internal_command_status(
  p_user_id uuid,
  p_command_id uuid
)
returns table(
  command_id uuid,
  command_type text,
  status text,
  rejection_reason text,
  created_at timestamptz,
  delivered_at timestamptz,
  acknowledged_at timestamptz
)
language sql
security definer
set search_path=devinx_laser,public
as $$
  select c.id,c.command_type,c.status,c.rejection_reason,
         c.created_at,c.delivered_at,c.acknowledged_at
  from devinx_laser.commands c
  where c.id=p_command_id
    and (
      c.owner_user_id=p_user_id
      or exists(select 1 from public.devinx_admin_users a where a.user_id=p_user_id)
    )
$$;

revoke all on function public.laser_internal_agent_set_remote_arm(uuid,boolean) from public,anon,authenticated;
revoke all on function public.laser_internal_enqueue_command(uuid,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.laser_internal_agent_next_command(uuid) from public,anon,authenticated;
revoke all on function public.laser_internal_agent_ack_command(uuid,uuid,boolean,text) from public,anon,authenticated;
revoke all on function public.laser_internal_command_status(uuid,uuid) from public,anon,authenticated;

grant execute on function public.laser_internal_agent_set_remote_arm(uuid,boolean) to service_role;
grant execute on function public.laser_internal_enqueue_command(uuid,uuid,text,uuid) to service_role;
grant execute on function public.laser_internal_agent_next_command(uuid) to service_role;
grant execute on function public.laser_internal_agent_ack_command(uuid,uuid,boolean,text) to service_role;
grant execute on function public.laser_internal_command_status(uuid,uuid) to service_role;

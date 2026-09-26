alter table devinx_laser.preview_state
  add column if not exists touch_enabled boolean not null default false,
  add column if not exists touch_event_seq bigint not null default 0,
  add column if not exists touch_event jsonb,
  add column if not exists touch_event_at timestamptz;

create or replace function public.laser_internal_set_preview_touch(
  p_user_id uuid,p_device_id uuid,p_enabled boolean
)
returns table(enabled boolean,local_arm_until timestamptz)
language plpgsql
security definer
set search_path=devinx_laser,public
as $$
declare
  v_allowed boolean;
  v_arm_until timestamptz;
begin
  select exists(
    select 1 from devinx_laser.devices d
    where d.id=p_device_id and d.status='active'
      and (d.owner_user_id=p_user_id
        or exists(select 1 from public.devinx_admin_users a where a.user_id=p_user_id))
  ) into v_allowed;

  if not v_allowed then raise exception 'preview_device_not_found'; end if;

  select d.local_arm_until into v_arm_until
  from devinx_laser.devices d where d.id=p_device_id;

  if p_enabled and (
    v_arm_until is null or v_arm_until<=now()
    or not exists(select 1 from devinx_laser.devices d
                  where d.id=p_device_id and d.remote_control_enabled=true)
  ) then
    raise exception 'local_arm_required';
  end if;

  insert into devinx_laser.preview_state(device_id,touch_enabled,updated_at)
  values(p_device_id,p_enabled,now())
  on conflict(device_id) do update set
    touch_enabled=excluded.touch_enabled,updated_at=now();

  return query select p_enabled,v_arm_until;
end;
$$;

create or replace function public.laser_internal_queue_preview_tap(
  p_user_id uuid,p_device_id uuid,p_x double precision,p_y double precision
)
returns bigint
language plpgsql
security definer
set search_path=devinx_laser,public
as $$
declare v_seq bigint;
begin
  if p_x<0 or p_x>1 or p_y<0 or p_y>1 then
    raise exception 'invalid_touch_coordinates';
  end if;

  if not exists(
    select 1
    from devinx_laser.devices d
    join devinx_laser.preview_state ps on ps.device_id=d.id
    where d.id=p_device_id
      and d.status='active'
      and ps.requested_until>now()
      and ps.touch_enabled=true
      and d.remote_control_enabled=true
      and d.local_arm_until>now()
      and (d.owner_user_id=p_user_id
        or exists(select 1 from public.devinx_admin_users a where a.user_id=p_user_id))
  ) then
    raise exception 'touch_not_enabled';
  end if;

  update devinx_laser.preview_state
  set touch_event_seq=touch_event_seq+1,
      touch_event=jsonb_build_object('type','tap','x',p_x,'y',p_y),
      touch_event_at=now(),
      updated_at=now()
  where device_id=p_device_id
  returning touch_event_seq into v_seq;

  return v_seq;
end;
$$;

create or replace function public.laser_internal_preview_control_state(
  p_device_id uuid,p_after_seq bigint default 0
)
returns table(
  preview_active boolean,
  touch_enabled boolean,
  local_arm_until timestamptz,
  event_seq bigint,
  touch_event jsonb,
  touch_event_at timestamptz
)
language sql
security definer
set search_path=devinx_laser,public
as $$
  select
    coalesce(ps.requested_until>now(),false),
    coalesce(ps.touch_enabled and d.remote_control_enabled and d.local_arm_until>now(),false),
    d.local_arm_until,
    coalesce(ps.touch_event_seq,0),
    case when ps.touch_event_seq>coalesce(p_after_seq,0)
          and ps.touch_event_at>now()-interval '5 seconds'
         then ps.touch_event else null end,
    ps.touch_event_at
  from devinx_laser.devices d
  left join devinx_laser.preview_state ps on ps.device_id=d.id
  where d.id=p_device_id and d.status='active'
$$;

create or replace function public.laser_internal_agent_set_local_arm(
  p_device_id uuid,p_enabled boolean
)
returns timestamptz
language plpgsql
security definer
set search_path=devinx_laser,public
as $$
declare v_until timestamptz;
begin
  if not exists(select 1 from devinx_laser.devices d
                where d.id=p_device_id and d.status='active') then
    raise exception 'device_not_active';
  end if;

  v_until:=case when p_enabled then now()+interval '5 minutes' else null end;

  update devinx_laser.devices
  set remote_control_enabled=p_enabled,local_arm_until=v_until,updated_at=now()
  where id=p_device_id;

  if not p_enabled then
    update devinx_laser.preview_state
    set touch_enabled=false,updated_at=now()
    where device_id=p_device_id;
  end if;

  return v_until;
end;
$$;

revoke all on function public.laser_internal_set_preview_touch(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.laser_internal_queue_preview_tap(uuid,uuid,double precision,double precision) from public,anon,authenticated;
revoke all on function public.laser_internal_preview_control_state(uuid,bigint) from public,anon,authenticated;
revoke all on function public.laser_internal_agent_set_local_arm(uuid,boolean) from public,anon,authenticated;

grant execute on function public.laser_internal_set_preview_touch(uuid,uuid,boolean) to service_role;
grant execute on function public.laser_internal_queue_preview_tap(uuid,uuid,double precision,double precision) to service_role;
grant execute on function public.laser_internal_preview_control_state(uuid,bigint) to service_role;
grant execute on function public.laser_internal_agent_set_local_arm(uuid,boolean) to service_role;

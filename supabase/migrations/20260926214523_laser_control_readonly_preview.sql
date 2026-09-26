create table if not exists devinx_laser.preview_state (
  device_id uuid primary key references devinx_laser.devices(id) on delete cascade,
  requested_by_user_id uuid,
  requested_until timestamptz,
  last_frame_at timestamptz,
  frame_version bigint not null default 0,
  frame_width integer,
  frame_height integer,
  frame_byte_size integer,
  updated_at timestamptz not null default now(),
  constraint preview_frame_width_valid check (frame_width is null or (frame_width between 1 and 4096)),
  constraint preview_frame_height_valid check (frame_height is null or (frame_height between 1 and 4096)),
  constraint preview_frame_byte_size_valid check (frame_byte_size is null or (frame_byte_size between 1 and 500000))
);

alter table devinx_laser.preview_state enable row level security;
revoke all on devinx_laser.preview_state from public, anon, authenticated;

create index if not exists preview_state_requested_until_idx
  on devinx_laser.preview_state(requested_until)
  where requested_until is not null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('devinx-laser-preview','devinx-laser-preview',false,500000,array['image/jpeg']::text[])
on conflict(id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types,
    updated_at=now();

create or replace function public.laser_internal_set_preview_request(
  p_user_id uuid,
  p_device_id uuid,
  p_active boolean
)
returns table(active boolean, requested_until timestamptz)
language plpgsql
security definer
set search_path = devinx_laser, public
as $$
declare
  v_allowed boolean;
  v_until timestamptz;
begin
  select exists(
    select 1
    from devinx_laser.devices d
    where d.id=p_device_id
      and d.status='active'
      and (
        d.owner_user_id=p_user_id
        or exists(select 1 from public.devinx_admin_users a where a.user_id=p_user_id)
      )
  ) into v_allowed;

  if not v_allowed then
    raise exception 'preview_device_not_found';
  end if;

  v_until := case when p_active then now()+interval '45 seconds' else null end;

  insert into devinx_laser.preview_state(device_id,requested_by_user_id,requested_until,updated_at)
  values(p_device_id,case when p_active then p_user_id else null end,v_until,now())
  on conflict(device_id) do update set
    requested_by_user_id=excluded.requested_by_user_id,
    requested_until=excluded.requested_until,
    updated_at=now();

  return query select p_active, v_until;
end;
$$;

create or replace function public.laser_internal_preview_request_state(p_device_id uuid)
returns table(active boolean, requested_until timestamptz)
language sql
security definer
set search_path = devinx_laser, public
as $$
  select
    coalesce(ps.requested_until>now(),false) as active,
    ps.requested_until
  from devinx_laser.devices d
  left join devinx_laser.preview_state ps on ps.device_id=d.id
  where d.id=p_device_id and d.status='active'
$$;

create or replace function public.laser_internal_record_preview_frame(
  p_device_id uuid,
  p_width integer,
  p_height integer,
  p_byte_size integer,
  p_captured_at timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = devinx_laser, public
as $$
declare
  v_version bigint;
begin
  if p_width<1 or p_width>4096
     or p_height<1 or p_height>4096
     or p_byte_size<1 or p_byte_size>500000
     or p_captured_at<now()-interval '2 minutes'
     or p_captured_at>now()+interval '30 seconds' then
    raise exception 'invalid_preview_frame';
  end if;

  if not exists(
    select 1
    from devinx_laser.devices d
    join devinx_laser.preview_state ps on ps.device_id=d.id
    where d.id=p_device_id
      and d.status='active'
      and ps.requested_until>now()
  ) then
    raise exception 'preview_not_requested';
  end if;

  insert into devinx_laser.preview_state(
    device_id,last_frame_at,frame_version,frame_width,frame_height,frame_byte_size,updated_at
  )
  values(p_device_id,p_captured_at,1,p_width,p_height,p_byte_size,now())
  on conflict(device_id) do update set
    last_frame_at=excluded.last_frame_at,
    frame_version=devinx_laser.preview_state.frame_version+1,
    frame_width=excluded.frame_width,
    frame_height=excluded.frame_height,
    frame_byte_size=excluded.frame_byte_size,
    updated_at=now()
  returning frame_version into v_version;

  return v_version;
end;
$$;

create or replace function public.laser_internal_preview_meta(p_user_id uuid,p_device_id uuid)
returns table(
  active boolean,
  requested_until timestamptz,
  last_frame_at timestamptz,
  frame_version bigint,
  frame_width integer,
  frame_height integer,
  frame_byte_size integer
)
language plpgsql
security definer
set search_path = devinx_laser, public
as $$
begin
  if not exists(
    select 1
    from devinx_laser.devices d
    where d.id=p_device_id
      and (
        d.owner_user_id=p_user_id
        or exists(select 1 from public.devinx_admin_users a where a.user_id=p_user_id)
      )
  ) then
    raise exception 'preview_device_not_found';
  end if;

  return query
  select
    coalesce(ps.requested_until>now(),false),
    ps.requested_until,
    ps.last_frame_at,
    coalesce(ps.frame_version,0),
    ps.frame_width,
    ps.frame_height,
    ps.frame_byte_size
  from devinx_laser.devices d
  left join devinx_laser.preview_state ps on ps.device_id=d.id
  where d.id=p_device_id;
end;
$$;

revoke all on function public.laser_internal_set_preview_request(uuid,uuid,boolean) from public, anon, authenticated;
revoke all on function public.laser_internal_preview_request_state(uuid) from public, anon, authenticated;
revoke all on function public.laser_internal_record_preview_frame(uuid,integer,integer,integer,timestamptz) from public, anon, authenticated;
revoke all on function public.laser_internal_preview_meta(uuid,uuid) from public, anon, authenticated;

grant execute on function public.laser_internal_set_preview_request(uuid,uuid,boolean) to service_role;
grant execute on function public.laser_internal_preview_request_state(uuid) to service_role;
grant execute on function public.laser_internal_record_preview_frame(uuid,integer,integer,integer,timestamptz) to service_role;
grant execute on function public.laser_internal_preview_meta(uuid,uuid) to service_role;

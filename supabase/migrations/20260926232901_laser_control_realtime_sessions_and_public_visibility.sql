alter table public.devinx_settings
  add column if not exists laser_public_visible boolean not null default false,
  add column if not exists finance_public_visible boolean not null default true;

create or replace function public.admin_get_site_visibility()
returns table(laser_public_visible boolean,finance_public_visible boolean)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not exists(select 1 from public.devinx_admin_users a where a.user_id=auth.uid()) then
    raise exception 'forbidden';
  end if;
  return query select s.laser_public_visible,s.finance_public_visible
  from public.devinx_settings s where s.singleton=true;
end;
$$;

create or replace function public.admin_update_site_visibility(
  p_laser_public_visible boolean default null,
  p_finance_public_visible boolean default null
)
returns void
language plpgsql security definer set search_path=''
as $$
begin
  if not exists(select 1 from public.devinx_admin_users a where a.user_id=auth.uid()) then
    raise exception 'forbidden';
  end if;
  update public.devinx_settings
  set laser_public_visible=coalesce(p_laser_public_visible,laser_public_visible),
      finance_public_visible=coalesce(p_finance_public_visible,finance_public_visible),
      updated_at=now()
  where singleton=true;
end;
$$;

create or replace function public.get_public_site_visibility()
returns table(laser_public_visible boolean,finance_public_visible boolean)
language sql stable security definer set search_path=''
as $$
  select s.laser_public_visible,s.finance_public_visible
  from public.devinx_settings s where s.singleton=true
$$;

revoke all on function public.admin_get_site_visibility() from public,anon,authenticated;
revoke all on function public.admin_update_site_visibility(boolean,boolean) from public,anon,authenticated;
grant execute on function public.admin_get_site_visibility() to authenticated;
grant execute on function public.admin_update_site_visibility(boolean,boolean) to authenticated;
revoke all on function public.get_public_site_visibility() from public;
grant execute on function public.get_public_site_visibility() to anon,authenticated;

create table if not exists devinx_laser.remote_sessions(
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  device_id uuid not null references devinx_laser.devices(id) on delete cascade,
  topic text not null unique,
  frame_token text not null,
  control_token text not null,
  input_token text,
  remote_input_enabled boolean not null default false,
  revision bigint not null default 1,
  status text not null default 'active',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint remote_sessions_status_check check(status in('active','closed'))
);
alter table devinx_laser.remote_sessions enable row level security;
revoke all on devinx_laser.remote_sessions from public,anon,authenticated;

create unique index if not exists remote_sessions_one_active_device_idx
  on devinx_laser.remote_sessions(device_id) where status='active';
create index if not exists remote_sessions_expiry_idx
  on devinx_laser.remote_sessions(expires_at) where status='active';

create or replace function public.laser_internal_open_remote_session(
  p_user_id uuid,p_device_id uuid
)
returns table(
  session_id uuid,topic text,frame_token text,control_token text,input_token text,
  remote_input_enabled boolean,revision bigint,expires_at timestamptz
)
language plpgsql security definer set search_path=devinx_laser,public
as $$
declare v_id uuid;
begin
  if not exists(
    select 1 from devinx_laser.devices d
    where d.id=p_device_id and d.status='active'
      and (d.owner_user_id=p_user_id
        or exists(select 1 from public.devinx_admin_users a where a.user_id=p_user_id))
  ) then raise exception 'remote_device_not_found'; end if;

  update devinx_laser.remote_sessions
  set status='closed',remote_input_enabled=false,input_token=null,
      closed_at=now(),updated_at=now(),revision=revision+1
  where device_id=p_device_id and status='active' and expires_at<=now();

  select rs.id into v_id from devinx_laser.remote_sessions rs
  where rs.device_id=p_device_id and rs.owner_user_id=p_user_id
    and rs.status='active' and rs.expires_at>now()
  order by rs.created_at desc limit 1;

  if v_id is null then
    update devinx_laser.remote_sessions
    set status='closed',remote_input_enabled=false,input_token=null,
        closed_at=now(),updated_at=now(),revision=revision+1
    where device_id=p_device_id and status='active';

    insert into devinx_laser.remote_sessions(
      owner_user_id,device_id,topic,frame_token,control_token,expires_at
    )
    values(
      p_user_id,p_device_id,
      'laser-'||replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),
      encode(gen_random_bytes(32),'hex'),
      encode(gen_random_bytes(32),'hex'),
      now()+interval '45 seconds'
    ) returning id into v_id;
  else
    update devinx_laser.remote_sessions
    set expires_at=now()+interval '45 seconds',updated_at=now()
    where id=v_id;
  end if;

  return query
  select rs.id,rs.topic,rs.frame_token,rs.control_token,rs.input_token,
         rs.remote_input_enabled,rs.revision,rs.expires_at
  from devinx_laser.remote_sessions rs where rs.id=v_id;
end;
$$;

create or replace function public.laser_internal_set_remote_input(
  p_user_id uuid,p_session_id uuid,p_enabled boolean
)
returns table(enabled boolean,input_token text,revision bigint,expires_at timestamptz)
language plpgsql security definer set search_path=devinx_laser,public
as $$
begin
  if not exists(
    select 1 from devinx_laser.remote_sessions rs
    join devinx_laser.devices d on d.id=rs.device_id
    where rs.id=p_session_id and rs.status='active' and rs.expires_at>now()
      and (rs.owner_user_id=p_user_id
        or exists(select 1 from public.devinx_admin_users a where a.user_id=p_user_id))
  ) then raise exception 'remote_session_not_found'; end if;

  update devinx_laser.remote_sessions
  set remote_input_enabled=p_enabled,
      input_token=case when p_enabled then encode(gen_random_bytes(32),'hex') else null end,
      revision=revision+1,expires_at=now()+interval '45 seconds',updated_at=now()
  where id=p_session_id;

  return query
  select rs.remote_input_enabled,rs.input_token,rs.revision,rs.expires_at
  from devinx_laser.remote_sessions rs where rs.id=p_session_id;
end;
$$;

create or replace function public.laser_internal_close_remote_session(
  p_user_id uuid,p_session_id uuid
)
returns boolean
language plpgsql security definer set search_path=devinx_laser,public
as $$
declare v_ok boolean;
begin
  update devinx_laser.remote_sessions rs
  set status='closed',remote_input_enabled=false,input_token=null,
      revision=revision+1,closed_at=now(),updated_at=now()
  where rs.id=p_session_id and rs.status='active'
    and (rs.owner_user_id=p_user_id
      or exists(select 1 from public.devinx_admin_users a where a.user_id=p_user_id))
  returning true into v_ok;
  return coalesce(v_ok,false);
end;
$$;

create or replace function public.laser_internal_agent_remote_session(p_device_id uuid)
returns table(
  session_id uuid,topic text,frame_token text,control_token text,input_token text,
  remote_input_enabled boolean,revision bigint,expires_at timestamptz
)
language sql security definer set search_path=devinx_laser,public
as $$
  select rs.id,rs.topic,rs.frame_token,rs.control_token,rs.input_token,
         rs.remote_input_enabled,rs.revision,rs.expires_at
  from devinx_laser.remote_sessions rs
  join devinx_laser.devices d on d.id=rs.device_id
  where rs.device_id=p_device_id and d.status='active'
    and rs.status='active' and rs.expires_at>now()
  order by rs.created_at desc limit 1
$$;

create or replace function public.laser_internal_enqueue_session_command(
  p_user_id uuid,p_session_id uuid,p_device_id uuid,p_command_type text,p_idempotency_key uuid
)
returns table(command_id uuid,status text,expires_at timestamptz)
language plpgsql security definer set search_path=devinx_laser,public,realtime
as $$
declare
  v_command_id uuid;
  v_expires timestamptz;
  v_topic text;
  v_control_token text;
  v_state text;
  v_machine boolean;
begin
  if p_command_type not in ('start','pause','stop','frame') then raise exception 'unsupported_command'; end if;

  select rs.topic,rs.control_token into v_topic,v_control_token
  from devinx_laser.remote_sessions rs
  join devinx_laser.devices d on d.id=rs.device_id
  where rs.id=p_session_id and rs.device_id=p_device_id
    and rs.status='active' and rs.expires_at>now() and d.status='active'
    and (rs.owner_user_id=p_user_id
      or exists(select 1 from public.devinx_admin_users a where a.user_id=p_user_id));

  if v_topic is null then raise exception 'remote_session_not_found'; end if;

  select s.job_state,s.machine_connected into v_state,v_machine
  from devinx_laser.device_state s where s.device_id=p_device_id;
  if coalesce(v_machine,false)=false then raise exception 'machine_not_connected'; end if;
  if p_command_type in ('start','frame') and coalesce(v_state,'unknown')<>'idle' then raise exception 'machine_not_idle'; end if;
  if p_command_type='pause' and coalesce(v_state,'unknown') not in ('running','busy') then raise exception 'not_running'; end if;

  v_expires:=now()+case when p_command_type in ('start','frame') then interval '8 seconds' else interval '5 seconds' end;

  insert into devinx_laser.commands(owner_user_id,device_id,command_type,payload,idempotency_key,status,expires_at)
  values(p_user_id,p_device_id,p_command_type,jsonb_build_object('session_id',p_session_id),p_idempotency_key,'queued',v_expires)
  on conflict(device_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key
  returning id into v_command_id;

  insert into devinx_laser.command_events(command_id,device_id,event_type,detail)
  values(v_command_id,p_device_id,'created',jsonb_build_object('command_type',p_command_type,'session_id',p_session_id));

  perform realtime.send(
    jsonb_build_object('token',v_control_token,'commandId',v_command_id,'command',p_command_type,'expiresAt',v_expires),
    'command',v_topic,false
  );

  return query select v_command_id,'queued'::text,v_expires;
end;
$$;

create or replace function public.laser_internal_agent_next_session_command(p_device_id uuid)
returns table(command_id uuid,command_type text,expires_at timestamptz)
language plpgsql security definer set search_path=devinx_laser,public
as $$
declare v_id uuid; v_type text; v_expires timestamptz;
begin
  if not exists(
    select 1 from devinx_laser.remote_sessions rs
    where rs.device_id=p_device_id and rs.status='active' and rs.expires_at>now()
  ) then return; end if;

  update devinx_laser.commands as c
  set status='expired',rejection_reason=coalesce(c.rejection_reason,'expired_before_delivery')
  where c.device_id=p_device_id and c.status='queued' and c.expires_at<=now();

  select c.id,c.command_type,c.expires_at into v_id,v_type,v_expires
  from devinx_laser.commands c
  where c.device_id=p_device_id and c.status='queued' and c.expires_at>now()
  order by c.created_at for update skip locked limit 1;
  if v_id is null then return; end if;

  update devinx_laser.commands as c
  set status='delivered',delivered_at=now()
  where c.id=v_id and c.status='queued';

  insert into devinx_laser.command_events(command_id,device_id,event_type,detail)
  values(v_id,p_device_id,'delivered','{}'::jsonb);

  return query select v_id,v_type,v_expires;
end;
$$;

revoke all on function public.laser_internal_open_remote_session(uuid,uuid) from public,anon,authenticated;
revoke all on function public.laser_internal_set_remote_input(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.laser_internal_close_remote_session(uuid,uuid) from public,anon,authenticated;
revoke all on function public.laser_internal_agent_remote_session(uuid) from public,anon,authenticated;
revoke all on function public.laser_internal_enqueue_session_command(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.laser_internal_agent_next_session_command(uuid) from public,anon,authenticated;

grant execute on function public.laser_internal_open_remote_session(uuid,uuid) to service_role;
grant execute on function public.laser_internal_set_remote_input(uuid,uuid,boolean) to service_role;
grant execute on function public.laser_internal_close_remote_session(uuid,uuid) to service_role;
grant execute on function public.laser_internal_agent_remote_session(uuid) to service_role;
grant execute on function public.laser_internal_enqueue_session_command(uuid,uuid,uuid,text,uuid) to service_role;
grant execute on function public.laser_internal_agent_next_session_command(uuid) to service_role;

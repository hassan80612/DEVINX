-- Central Master Laser: operação, presença, funil, sessões, dispositivos e saúde.
-- Aplicado em produção no Supabase em 2026-10-01.

create table if not exists devinx_laser.funnel_events(
  id bigint generated always as identity primary key,
  event_name text not null check(event_name in (
    'landing_view','presentation_open','presentation_play','presentation_complete',
    'login_click','student_access_click','guide_click',
    'plan_control_click','plan_mentor_click','workspace_open','checkout_return'
  )),
  session_id uuid,
  user_id uuid references auth.users(id) on delete set null,
  path text,
  source text,
  language text,
  plan_id text check(plan_id is null or plan_id in ('control','mentor')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists laser_funnel_events_created_idx
  on devinx_laser.funnel_events(created_at desc);
create index if not exists laser_funnel_events_name_created_idx
  on devinx_laser.funnel_events(event_name,created_at desc);
create index if not exists laser_funnel_events_session_idx
  on devinx_laser.funnel_events(session_id);

alter table devinx_laser.funnel_events enable row level security;
revoke all on table devinx_laser.funnel_events from public,anon,authenticated;
grant all on table devinx_laser.funnel_events to service_role;

create or replace function public.track_laser_funnel_event(
  p_event_name text,
  p_session_id uuid,
  p_path text default null,
  p_source text default null,
  p_language text default null,
  p_plan_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_event text:=lower(trim(coalesce(p_event_name,'')));
  v_plan text:=nullif(lower(trim(coalesce(p_plan_id,''))),'');
  v_meta jsonb:=coalesce(p_metadata,'{}'::jsonb);
begin
  if v_event not in (
    'landing_view','presentation_open','presentation_play','presentation_complete',
    'login_click','student_access_click','guide_click',
    'plan_control_click','plan_mentor_click','workspace_open','checkout_return'
  ) then return false; end if;

  if p_session_id is null then return false; end if;
  if v_plan is not null and v_plan not in ('control','mentor') then v_plan:=null; end if;
  if octet_length(v_meta::text)>4096 then v_meta:='{}'::jsonb; end if;

  if exists(
    select 1 from devinx_laser.funnel_events e
    where e.session_id=p_session_id
      and e.event_name=v_event
      and e.created_at>now()-interval '3 seconds'
  ) then
    return true;
  end if;

  insert into devinx_laser.funnel_events(
    event_name,session_id,user_id,path,source,language,plan_id,metadata,created_at
  ) values(
    v_event,p_session_id,auth.uid(),
    left(coalesce(nullif(trim(p_path),''),'/laser-control/conhecer'),300),
    left(coalesce(nullif(trim(p_source),''),'Direto/sem referência'),120),
    left(coalesce(nullif(trim(p_language),''),'pt-BR'),20),
    v_plan,v_meta,now()
  );

  return true;
end;
$$;

revoke all on function public.track_laser_funnel_event(text,uuid,text,text,text,text,jsonb) from public;
grant execute on function public.track_laser_funnel_event(text,uuid,text,text,text,text,jsonb) to anon,authenticated;

create or replace function public.admin_list_laser_live_presence(
  p_window_seconds integer default 210
)
returns table(
  session_id uuid,
  user_id uuid,
  email text,
  authenticated boolean,
  is_master boolean,
  path text,
  source text,
  language text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  age_seconds integer
)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_window integer:=greatest(30,least(coalesce(p_window_seconds,210),600));
begin
  if not public.is_devinx_admin() then
    raise exception 'not authorized' using errcode='42501';
  end if;

  return query
  select
    p.session_id,
    p.user_id,
    lower(u.email)::text,
    (p.user_id is not null),
    exists(select 1 from public.devinx_admin_users a where a.user_id=p.user_id),
    p.path,
    p.source,
    p.language,
    p.first_seen_at,
    p.last_seen_at,
    greatest(0,extract(epoch from (now()-p.last_seen_at))::integer)
  from public.devinx_live_presence p
  left join auth.users u on u.id=p.user_id
  where p.last_seen_at>=now()-make_interval(secs=>v_window)
  order by p.last_seen_at desc;
end;
$$;

revoke all on function public.admin_list_laser_live_presence(integer) from public;
grant execute on function public.admin_list_laser_live_presence(integer) to authenticated;

create or replace function public.admin_list_laser_devices()
returns table(
  device_id uuid,
  owner_user_id uuid,
  owner_email text,
  display_name text,
  device_status text,
  connection_mode text,
  agent_version text,
  adapter text,
  last_seen_at timestamptz,
  online boolean,
  lightburn_online boolean,
  machine_connected boolean,
  machine_name text,
  job_state text,
  progress_permille integer,
  project_file text,
  captured_at timestamptz,
  remote_control_enabled boolean,
  local_arm_until timestamptz,
  paired_at timestamptz,
  access_expires_at timestamptz,
  preview_requested_until timestamptz,
  preview_last_frame_at timestamptz,
  preview_frame_width integer,
  preview_frame_height integer
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.is_devinx_admin() then
    raise exception 'not authorized' using errcode='42501';
  end if;

  return query
  select
    d.id,d.owner_user_id,lower(u.email)::text,d.display_name,d.status,d.connection_mode,
    d.agent_version,d.adapter,d.last_seen_at,
    (d.status='active' and d.last_seen_at is not null and d.last_seen_at>now()-interval '15 seconds'),
    s.lightburn_online,s.machine_connected,s.machine_name,s.job_state,s.progress_permille,
    s.project_file,s.captured_at,d.remote_control_enabled,d.local_arm_until,d.paired_at,
    d.access_expires_at,p.requested_until,p.last_frame_at,p.frame_width,p.frame_height
  from devinx_laser.devices d
  left join auth.users u on u.id=d.owner_user_id
  left join devinx_laser.device_state s on s.device_id=d.id
  left join devinx_laser.preview_state p on p.device_id=d.id
  order by
    (d.status='active' and d.last_seen_at is not null and d.last_seen_at>now()-interval '15 seconds') desc,
    d.last_seen_at desc nulls last,
    d.created_at desc;
end;
$$;

revoke all on function public.admin_list_laser_devices() from public;
grant execute on function public.admin_list_laser_devices() to authenticated;

create or replace function public.admin_list_laser_sessions(
  p_limit integer default 100
)
returns table(
  session_kind text,
  session_id uuid,
  owner_user_id uuid,
  owner_email text,
  device_id uuid,
  device_name text,
  status text,
  started_at timestamptz,
  expires_at timestamptz,
  closed_at timestamptz,
  detail text,
  is_active boolean
)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_limit integer:=greatest(10,least(coalesce(p_limit,100),300));
begin
  if not public.is_devinx_admin() then
    raise exception 'not authorized' using errcode='42501';
  end if;

  return query
  select * from (
    select
      'mentor'::text,
      ms.id,
      ms.mentor_user_id,
      lower(u.email)::text,
      ms.device_id,
      d.display_name,
      ms.status,
      ms.opened_at,
      ms.expires_at,
      ms.closed_at,
      (ms.billing_mode||' · '||ms.billing_state)::text,
      (ms.status='active' and ms.expires_at>now())
    from devinx_laser.mentor_sessions ms
    left join auth.users u on u.id=ms.mentor_user_id
    left join devinx_laser.devices d on d.id=ms.device_id

    union all

    select
      'remote'::text,
      rs.id,
      rs.owner_user_id,
      lower(u.email)::text,
      rs.device_id,
      d.display_name,
      rs.status,
      rs.created_at,
      rs.expires_at,
      rs.closed_at,
      case when rs.remote_input_enabled then 'entrada remota ativa' else 'entrada remota desligada' end,
      (rs.status='active' and rs.expires_at>now())
    from devinx_laser.remote_sessions rs
    left join auth.users u on u.id=rs.owner_user_id
    left join devinx_laser.devices d on d.id=rs.device_id

    union all

    select
      'control'::text,
      cs.id,
      cs.owner_user_id,
      lower(u.email)::text,
      cs.device_id,
      d.display_name,
      cs.status,
      cs.acquired_at,
      cs.expires_at,
      cs.released_at,
      'lease de controle'::text,
      (cs.status='active' and cs.expires_at>now())
    from devinx_laser.control_sessions cs
    left join auth.users u on u.id=cs.owner_user_id
    left join devinx_laser.devices d on d.id=cs.device_id
  ) q
  order by q.started_at desc
  limit v_limit;
end;
$$;

revoke all on function public.admin_list_laser_sessions(integer) from public;
grant execute on function public.admin_list_laser_sessions(integer) to authenticated;

create or replace function public.admin_get_laser_ops_snapshot(
  p_presence_seconds integer default 210,
  p_funnel_hours integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_presence integer:=greatest(30,least(coalesce(p_presence_seconds,210),600));
  v_hours integer:=greatest(1,least(coalesce(p_funnel_hours,24),720));
  v_cutoff timestamptz:=now()-make_interval(hours=>greatest(1,least(coalesce(p_funnel_hours,24),720)));
  v_site_online integer:=0;
  v_external_online integer:=0;
  v_laser_online integer:=0;
  v_laser_external integer:=0;
  v_agents_online integer:=0;
  v_agents_total integer:=0;
  v_agents_active integer:=0;
  v_agents_revoked integer:=0;
  v_lightburn_online integer:=0;
  v_remote_active integer:=0;
  v_mentor_active integer:=0;
  v_control_active integer:=0;
  v_commands_pending integer:=0;
  v_commands_rejected_24h integer:=0;
  v_webrtc_pending integer:=0;
  v_preview_active integer:=0;
  v_stale_sessions integer:=0;
  v_db_size bigint:=0;
  v_laser_size bigint:=0;
  v_connections integer:=0;
  v_max_connections integer:=0;
  v_rls_disabled jsonb:='[]'::jsonb;
  v_languages jsonb:='[]'::jsonb;
  v_funnel jsonb:='{}'::jsonb;
  v_last_agent timestamptz;
  v_last_presence timestamptz;
begin
  if not public.is_devinx_admin() then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select
    count(*)::integer,
    count(*) filter(where not exists(select 1 from public.devinx_admin_users a where a.user_id=p.user_id))::integer,
    count(*) filter(where p.path like '/laser-control%')::integer,
    count(*) filter(where p.path like '/laser-control%' and not exists(select 1 from public.devinx_admin_users a where a.user_id=p.user_id))::integer,
    max(p.last_seen_at)
  into v_site_online,v_external_online,v_laser_online,v_laser_external,v_last_presence
  from public.devinx_live_presence p
  where p.last_seen_at>=now()-make_interval(secs=>v_presence);

  select
    count(*)::integer,
    count(*) filter(where d.status='active')::integer,
    count(*) filter(where d.status='revoked')::integer,
    count(*) filter(where d.status='active' and d.last_seen_at is not null and d.last_seen_at>now()-interval '15 seconds')::integer,
    max(d.last_seen_at)
  into v_agents_total,v_agents_active,v_agents_revoked,v_agents_online,v_last_agent
  from devinx_laser.devices d;

  select count(*) filter(
    where d.status='active'
      and d.last_seen_at>now()-interval '15 seconds'
      and s.lightburn_online is true
  )::integer
  into v_lightburn_online
  from devinx_laser.devices d
  left join devinx_laser.device_state s on s.device_id=d.id;

  select
    count(*) filter(where status='active' and expires_at>now())::integer,
    count(*) filter(where status='active' and expires_at<=now())::integer
  into v_remote_active,v_stale_sessions
  from devinx_laser.remote_sessions;

  select
    v_stale_sessions + count(*) filter(where status='active' and expires_at<=now())::integer,
    count(*) filter(where status='active' and expires_at>now())::integer
  into v_stale_sessions,v_mentor_active
  from devinx_laser.mentor_sessions;

  select
    v_stale_sessions + count(*) filter(where status='active' and expires_at<=now())::integer,
    count(*) filter(where status='active' and expires_at>now())::integer
  into v_stale_sessions,v_control_active
  from devinx_laser.control_sessions;

  select
    count(*) filter(where status in ('queued','delivered'))::integer,
    count(*) filter(where status='rejected' and created_at>now()-interval '24 hours')::integer
  into v_commands_pending,v_commands_rejected_24h
  from devinx_laser.commands;

  select count(*) filter(where consumed_at is null and expires_at>now())::integer
  into v_webrtc_pending
  from devinx_laser.webrtc_signals;

  select count(*) filter(where requested_until>now())::integer
  into v_preview_active
  from devinx_laser.preview_state;

  select pg_catalog.pg_database_size(pg_catalog.current_database()) into v_db_size;

  select coalesce(sum(pg_catalog.pg_total_relation_size(c.oid)),0)
  into v_laser_size
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='devinx_laser'
    and c.relkind in ('r','m');

  select count(*)::integer
  into v_connections
  from pg_catalog.pg_stat_activity
  where datname=pg_catalog.current_database();

  select pg_catalog.current_setting('max_connections')::integer into v_max_connections;

  select coalesce(jsonb_agg(x.name order by x.name),'[]'::jsonb)
  into v_rls_disabled
  from (
    select (n.nspname||'.'||c.relname)::text as name
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='devinx_laser'
      and c.relkind='r'
      and not c.relrowsecurity
  ) x;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('language',q.language,'sessions',q.sessions)
      order by q.sessions desc
    ),
    '[]'::jsonb
  )
  into v_languages
  from (
    select
      coalesce(nullif(trim(p.language),''),'—') language,
      count(*)::integer sessions
    from public.devinx_live_presence p
    where p.last_seen_at>=v_cutoff
      and p.path like '/laser-control%'
    group by 1
  ) q;

  select jsonb_build_object(
    'window_hours',v_hours,
    'laser_visitors',(
      select count(distinct p.session_id)::integer
      from public.devinx_live_presence p
      where p.last_seen_at>=v_cutoff
        and p.path like '/laser-control%'
    ),
    'landing_view',(
      select count(distinct session_id)::integer
      from devinx_laser.funnel_events
      where created_at>=v_cutoff and event_name='landing_view'
    ),
    'presentation_open',(
      select count(distinct session_id)::integer
      from devinx_laser.funnel_events
      where created_at>=v_cutoff and event_name='presentation_open'
    ),
    'presentation_play',(
      select count(distinct session_id)::integer
      from devinx_laser.funnel_events
      where created_at>=v_cutoff and event_name='presentation_play'
    ),
    'login_click',(
      select count(distinct session_id)::integer
      from devinx_laser.funnel_events
      where created_at>=v_cutoff and event_name='login_click'
    ),
    'control_click',(
      select count(distinct session_id)::integer
      from devinx_laser.funnel_events
      where created_at>=v_cutoff and event_name='plan_control_click'
    ),
    'mentor_click',(
      select count(distinct session_id)::integer
      from devinx_laser.funnel_events
      where created_at>=v_cutoff and event_name='plan_mentor_click'
    ),
    'sales',(
      select count(*)::integer
      from (
        select lower(email) email
        from devinx_laser.kiwify_subscriptions
        where has_access is true and last_event_at>=v_cutoff
        union
        select lower(email) email
        from devinx_laser.kiwify_pass_orders
        where status='approved' and approved_at>=v_cutoff
      ) s
    )
  ) into v_funnel;

  return jsonb_build_object(
    'generated_at',now(),
    'presence_window_seconds',v_presence,
    'live',jsonb_build_object(
      'site_online',v_site_online,
      'external_online',v_external_online,
      'laser_online',v_laser_online,
      'laser_external',v_laser_external,
      'last_presence_at',v_last_presence
    ),
    'agents',jsonb_build_object(
      'total',v_agents_total,
      'active',v_agents_active,
      'revoked',v_agents_revoked,
      'online',v_agents_online,
      'lightburn_online',v_lightburn_online,
      'last_heartbeat_at',v_last_agent
    ),
    'sessions',jsonb_build_object(
      'remote_active',v_remote_active,
      'mentor_active',v_mentor_active,
      'control_active',v_control_active,
      'stale',v_stale_sessions
    ),
    'realtime',jsonb_build_object(
      'commands_pending',v_commands_pending,
      'commands_rejected_24h',v_commands_rejected_24h,
      'webrtc_pending',v_webrtc_pending,
      'preview_active',v_preview_active
    ),
    'health',jsonb_build_object(
      'database_size_bytes',v_db_size,
      'laser_schema_size_bytes',v_laser_size,
      'connections',v_connections,
      'max_connections',v_max_connections
    ),
    'security',jsonb_build_object(
      'rls_disabled_tables',v_rls_disabled,
      'rls_disabled_count',jsonb_array_length(v_rls_disabled)
    ),
    'languages',v_languages,
    'funnel',v_funnel
  );
end;
$$;

revoke all on function public.admin_get_laser_ops_snapshot(integer,integer) from public;
grant execute on function public.admin_get_laser_ops_snapshot(integer,integer) to authenticated;

create or replace function public.admin_laser_device_action(
  p_device_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_row record;
begin
  if not public.is_devinx_admin() then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if p_action not in ('revoke','reactivate') then
    raise exception 'invalid action';
  end if;

  select *
  into v_row
  from public.laser_internal_admin_set_device_access(auth.uid(),p_device_id,p_action);

  return jsonb_build_object(
    'ok',true,
    'device_id',v_row.device_id,
    'status',v_row.device_status
  );
end;
$$;

revoke all on function public.admin_laser_device_action(uuid,text) from public;
grant execute on function public.admin_laser_device_action(uuid,text) to authenticated;

create or replace function public.admin_laser_close_session(
  p_session_kind text,
  p_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_kind text:=lower(trim(coalesce(p_session_kind,'')));
  v_count integer:=0;
begin
  if not public.is_devinx_admin() then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if v_kind='remote' then
    return public.laser_internal_close_remote_session(auth.uid(),p_session_id);
  elsif v_kind='mentor' then
    perform public.laser_internal_close_mentor_session(auth.uid(),p_session_id);
    return true;
  elsif v_kind='control' then
    update devinx_laser.control_sessions
    set status='released',
        released_at=coalesce(released_at,now())
    where id=p_session_id
      and status='active';

    get diagnostics v_count=row_count;
    return v_count>0;
  end if;

  raise exception 'invalid session kind';
end;
$$;

revoke all on function public.admin_laser_close_session(text,uuid) from public;
grant execute on function public.admin_laser_close_session(text,uuid) to authenticated;

create or replace function public.admin_set_laser_mentor_credits_by_email(
  p_email text,
  p_credits integer
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_uid uuid;
begin
  if not public.is_devinx_admin() then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if p_credits is null or p_credits<0 or p_credits>999 then
    raise exception 'invalid credits';
  end if;

  select id into v_uid
  from auth.users
  where lower(email)=v_email
  limit 1;

  if v_uid is null then
    raise exception 'account not found';
  end if;

  update devinx_laser.entitlements
  set mentor_credits_balance=p_credits,
      mentor_credits_cycle_started_at=coalesce(mentor_credits_cycle_started_at,now()),
      updated_at=now()
  where user_id=v_uid;

  if not found then
    raise exception 'laser entitlement not found';
  end if;

  return jsonb_build_object(
    'ok',true,
    'email',v_email,
    'credits',p_credits
  );
end;
$$;

revoke all on function public.admin_set_laser_mentor_credits_by_email(text,integer) from public;
grant execute on function public.admin_set_laser_mentor_credits_by_email(text,integer) to authenticated;

create or replace function public.admin_laser_close_user_sessions(
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_uid uuid;
  v_remote integer:=0;
  v_control integer:=0;
  v_mentor integer:=0;
  r record;
begin
  if not public.is_devinx_admin() then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select id into v_uid
  from auth.users
  where lower(email)=v_email
  limit 1;

  if v_uid is null then
    raise exception 'account not found';
  end if;

  update devinx_laser.remote_sessions
  set status='closed',
      remote_input_enabled=false,
      input_token=null,
      revision=revision+1,
      closed_at=coalesce(closed_at,now()),
      updated_at=now()
  where owner_user_id=v_uid
    and status='active';

  get diagnostics v_remote=row_count;

  update devinx_laser.control_sessions
  set status='released',
      released_at=coalesce(released_at,now())
  where owner_user_id=v_uid
    and status='active';

  get diagnostics v_control=row_count;

  for r in
    select id
    from devinx_laser.mentor_sessions
    where mentor_user_id=v_uid
      and status='active'
  loop
    perform public.laser_internal_close_mentor_session(auth.uid(),r.id);
    v_mentor:=v_mentor+1;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'email',v_email,
    'remote',v_remote,
    'control',v_control,
    'mentor',v_mentor
  );
end;
$$;

revoke all on function public.admin_laser_close_user_sessions(text) from public;
grant execute on function public.admin_laser_close_user_sessions(text) to authenticated;

create or replace function public.admin_laser_cleanup_expired()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_remote integer:=0;
  v_control integer:=0;
  v_commands integer:=0;
  v_signals integer:=0;
  v_mentor integer:=0;
  r record;
begin
  if not public.is_devinx_admin() then
    raise exception 'not authorized' using errcode='42501';
  end if;

  update devinx_laser.remote_sessions
  set status='closed',
      remote_input_enabled=false,
      input_token=null,
      revision=revision+1,
      closed_at=coalesce(closed_at,now()),
      updated_at=now()
  where status='active'
    and expires_at<=now();

  get diagnostics v_remote=row_count;

  update devinx_laser.control_sessions
  set status='expired',
      released_at=coalesce(released_at,now())
  where status='active'
    and expires_at<=now();

  get diagnostics v_control=row_count;

  for r in
    select id
    from devinx_laser.mentor_sessions
    where status='active'
      and expires_at<=now()
  loop
    perform public.laser_internal_close_mentor_session(auth.uid(),r.id);
    v_mentor:=v_mentor+1;
  end loop;

  update devinx_laser.commands
  set status='expired',
      acknowledged_at=coalesce(acknowledged_at,now()),
      rejection_reason=coalesce(rejection_reason,'expired_by_master_cleanup')
  where status in ('queued','delivered')
    and expires_at<=now();

  get diagnostics v_commands=row_count;

  delete from devinx_laser.webrtc_signals
  where expires_at<=now();

  get diagnostics v_signals=row_count;

  return jsonb_build_object(
    'ok',true,
    'remote',v_remote,
    'control',v_control,
    'mentor',v_mentor,
    'commands',v_commands,
    'signals',v_signals
  );
end;
$$;

revoke all on function public.admin_laser_cleanup_expired() from public;
grant execute on function public.admin_laser_cleanup_expired() to authenticated;

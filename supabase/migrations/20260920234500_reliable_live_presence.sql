create table if not exists public.devinx_live_presence (
  session_id uuid primary key,
  secret_hash text not null,
  user_id uuid null references auth.users(id) on delete set null,
  path text not null default '/',
  source text not null default 'Direto/sem referência',
  language text not null default 'pt-BR',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists devinx_live_presence_last_seen_idx
  on public.devinx_live_presence(last_seen_at desc);

create index if not exists devinx_live_presence_user_idx
  on public.devinx_live_presence(user_id);

alter table public.devinx_live_presence enable row level security;
revoke all on table public.devinx_live_presence from anon, authenticated;

create or replace function public.touch_devinx_presence(
  p_session_id uuid,
  p_secret text,
  p_path text default '/',
  p_source text default 'Direto/sem referência',
  p_language text default 'pt-BR'
)
returns boolean
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_existing_hash text;
begin
  if p_session_id is null
     or p_secret is null
     or length(p_secret) < 24
     or length(p_secret) > 256 then
    return false;
  end if;

  v_hash := encode(digest(p_secret, 'sha256'), 'hex');

  select secret_hash into v_existing_hash
  from public.devinx_live_presence
  where session_id = p_session_id;

  if found and v_existing_hash <> v_hash then
    return false;
  end if;

  insert into public.devinx_live_presence (
    session_id,secret_hash,user_id,path,source,language,first_seen_at,last_seen_at
  )
  values (
    p_session_id,v_hash,v_uid,
    left(coalesce(nullif(trim(p_path),''),'/'),300),
    left(coalesce(nullif(trim(p_source),''),'Direto/sem referência'),120),
    left(coalesce(nullif(trim(p_language),''),'pt-BR'),20),
    now(),now()
  )
  on conflict (session_id) do update
  set user_id=excluded.user_id,
      path=excluded.path,
      source=excluded.source,
      language=excluded.language,
      last_seen_at=now()
  where public.devinx_live_presence.secret_hash=excluded.secret_hash;

  return true;
end;
$$;

revoke all on function public.touch_devinx_presence(uuid,text,text,text,text) from public;
grant execute on function public.touch_devinx_presence(uuid,text,text,text,text) to anon, authenticated;

create or replace function public.admin_get_devinx_live_presence(
  p_window_seconds integer default 75
)
returns table(
  session_id uuid,
  user_id uuid,
  email text,
  authenticated boolean,
  path text,
  source text,
  language text,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $$
declare
  v_window integer:=greatest(30,least(coalesce(p_window_seconds,75),300));
begin
  if not public.is_devinx_admin() then
    raise exception 'not authorized' using errcode='42501';
  end if;

  delete from public.devinx_live_presence
  where last_seen_at < now()-interval '7 days';

  return query
  select
    p.session_id,
    p.user_id,
    lower(u.email)::text,
    (p.user_id is not null),
    p.path,
    p.source,
    p.language,
    p.last_seen_at
  from public.devinx_live_presence p
  left join auth.users u on u.id=p.user_id
  where p.last_seen_at >= now()-make_interval(secs=>v_window)
    and not exists(
      select 1 from public.devinx_admin_users a where a.user_id=p.user_id
    )
  order by p.last_seen_at desc;
end;
$$;

revoke all on function public.admin_get_devinx_live_presence(integer) from public;
grant execute on function public.admin_get_devinx_live_presence(integer) to authenticated;

-- Live presence v2: one browser identity, activity-aware client and a versioned
-- heartbeat signature so old tabs cannot keep stale sessions alive forever.

create or replace function public.touch_devinx_presence(
  p_session_id uuid,
  p_secret text,
  p_path text,
  p_source text,
  p_language text,
  p_client_version integer
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
  if p_client_version <> 2 then
    return false;
  end if;

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

revoke all on function public.touch_devinx_presence(uuid,text,text,text,text,integer) from public;
grant execute on function public.touch_devinx_presence(uuid,text,text,text,text,integer) to anon, authenticated;

-- Keep the old function definition for migration history compatibility, but remove
-- browser access so already-open v1 tabs expire naturally instead of refreshing ghosts.
revoke execute on function public.touch_devinx_presence(uuid,text,text,text,text) from anon, authenticated;

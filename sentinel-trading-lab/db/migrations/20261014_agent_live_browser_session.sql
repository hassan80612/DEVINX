-- Sentinel 13.8.1: paid Agent requires an ACTIVE browser session.
-- A closed tab stops presence pings; after 60 seconds the Agent pauses.
-- Logout deletes the session immediately. The separate paid-entitlement
-- function remains unchanged for site access and payment registration.
ALTER TABLE sentinel_app.sessions ADD COLUMN IF NOT EXISTS last_presence_at timestamptz;
CREATE INDEX IF NOT EXISTS sentinel_sessions_recent_presence
 ON sentinel_app.sessions(account_id,last_presence_at DESC)
 WHERE last_presence_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sentinel_web_presence(p_session_token text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
 AS $$
 DECLARE v_account uuid;v_hash text;
 BEGIN
   v_hash:=encode(extensions.digest(coalesce(p_session_token,''),'sha256'),'hex');
   UPDATE sentinel_app.sessions s SET last_presence_at=now()
   WHERE s.token_hash=v_hash AND s.expires_at>now()
     AND EXISTS(SELECT 1 FROM sentinel_app.accounts a
       WHERE a.id=s.account_id AND a.status='active')
   RETURNING s.account_id INTO v_account;
   IF v_account IS NULL THEN
     RETURN jsonb_build_object('ok',false,'error','unauthorized');
   END IF;
   RETURN jsonb_build_object('ok',true);
 END $$;
REVOKE ALL ON FUNCTION public.sentinel_web_presence(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sentinel_web_presence(text) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION sentinel_app.agent_web_session_active(p_account_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
 AS $$
 SELECT EXISTS (
  SELECT 1 FROM sentinel_app.sessions s
  JOIN sentinel_app.accounts a ON a.id=s.account_id
  WHERE s.account_id=p_account_id AND s.expires_at>now() AND a.status='active'
    AND s.last_presence_at>=now()-interval '60 seconds'
 ) $$;
REVOKE ALL ON FUNCTION sentinel_app.agent_web_session_active(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sentinel_agent_heartbeat(p_install_id text, p_device_secret text, p_state jsonb, p_agent_version text DEFAULT '8.8.0'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v sentinel_app.devices%rowtype;
  v_hash text;
  v_access boolean:=false;
begin
  v_hash:=encode(extensions.digest(coalesce(p_device_secret,''),'sha256'),'hex');

  select * into v from sentinel_app.devices
  where install_id=p_install_id limit 1;
  if not found or v.device_secret_hash<>v_hash or v.status='revoked' then
    return jsonb_build_object('ok',false,'error','device_unauthorized');
  end if;
  if v.account_id is not null then
    v_access:=sentinel_app.agent_access_active(v.account_id) AND sentinel_app.agent_web_session_active(v.account_id);
  end if;

  -- The Agent already polls commands at the original cadence, and the poll
  -- RPC refreshes last_seen_at at most once every 10s. Updating the same
  -- device on EACH 5s heartbeat produces duplicate writes and index churn.
  -- Never allow last_seen_at to exceed the existing 15s online threshold;
  -- update immediately on a version change or after a 10s age.
  update sentinel_app.devices
  set last_seen_at=now(),
      agent_version=left(coalesce(p_agent_version,'8.8.0'),30),
      updated_at=now()
  where id=v.id AND (
    v.last_seen_at IS NULL OR
    v.last_seen_at < now() - interval '10 seconds' OR
    v.agent_version IS DISTINCT FROM left(coalesce(p_agent_version,'8.8.0'),30)
  );

  -- Preserve the entire active dashboard snapshot / heartbeat cadence.
  insert into sentinel_app.device_state AS target(device_id,account_id,state,heartbeat_at,updated_at)
  values(v.id,v.account_id,coalesce(p_state,'{}'::jsonb),now(),now())
  on conflict(device_id) do update
  set account_id=excluded.account_id,
      -- Retain the original TOAST pointer for an identical JSON snapshot.
      -- The heartbeat timestamp STILL advances on every call, so availability
      -- and mobile stale-state logic remain exactly as before.
      state=case when target.state IS DISTINCT FROM excluded.state
                 then excluded.state else target.state end,
      heartbeat_at=now(),
      updated_at=now();

  return jsonb_build_object(
    'ok',true,'paired',v.account_id is not null,'deviceId',v.id,
    'accessActive',v_access,
    'accessReason',case
      when v.account_id is null then 'unpaired'
      when v_access then 'active' else 'subscription_inactive'
    end
  );
end
$function$
;

CREATE OR REPLACE FUNCTION public.sentinel_agent_poll(p_install_id text, p_device_secret text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v sentinel_app.devices%rowtype;
  c sentinel_app.commands%rowtype;
  v_hash text;
  v_access boolean:=false;
  v_kill_id uuid;
begin
  v_hash:=encode(extensions.digest(coalesce(p_device_secret,''),'sha256'),'hex');

  select * into v
  from sentinel_app.devices
  where install_id=p_install_id
  limit 1;

  if not found or v.device_secret_hash<>v_hash or v.status='revoked' then
    return jsonb_build_object('ok',false,'error','device_unauthorized');
  end if;

  update sentinel_app.devices
  set last_seen_at=now(),updated_at=now()
  where id=v.id and (last_seen_at is null or last_seen_at < now() - interval '10 seconds');

  update sentinel_app.commands
  set status='expired'
  where device_id=v.id
    and status in ('queued','delivered')
    and expires_at<=now();

  if v.account_id is null then
    return jsonb_build_object(
      'ok',true,'paired',false,'accessActive',false,
      'accessReason','unpaired','command',null
    );
  end if;

  v_access:=sentinel_app.agent_access_active(v.account_id) AND sentinel_app.agent_web_session_active(v.account_id);

  if not v_access then
    update sentinel_app.commands
    set status='canceled'
    where device_id=v.id
      and status in ('queued','delivered')
      and command_type<>'control/kill';

    select id into v_kill_id
    from sentinel_app.commands
    where device_id=v.id
      and command_type='control/kill'
      and status='queued'
      and expires_at>now()
    order by created_at desc
    limit 1;

    if v_kill_id is null then
      insert into sentinel_app.commands(
        account_id,device_id,command_type,payload,status,expires_at
      )
      values(
        v.account_id,v.id,'control/kill',
        jsonb_build_object('actor','system','reason','agent_access_inactive'),
        'queued',now()+interval '25 seconds'
      )
      returning id into v_kill_id;
    end if;

    update sentinel_app.commands
    set status='delivered',delivered_at=now()
    where id=v_kill_id;

    return jsonb_build_object(
      'ok',true,
      'paired',true,
      'accessActive',false,
      'accessReason','subscription_inactive',
      'command',jsonb_build_object(
        'id',v_kill_id,
        'type','control/kill',
        'payload',jsonb_build_object('actor','system','reason','agent_access_inactive'),
        'expiresAt',now()+interval '25 seconds'
      )
    );
  end if;

  select * into c
  from sentinel_app.commands
  where device_id=v.id
    and status='queued'
    and expires_at>now()
  order by created_at asc
  limit 1
  for update skip locked;

  if not found then
    return jsonb_build_object(
      'ok',true,'paired',true,'accessActive',true,
      'accessReason','active','command',null
    );
  end if;

  update sentinel_app.commands
  set status='delivered',delivered_at=now()
  where id=c.id;

  return jsonb_build_object(
    'ok',true,
    'paired',true,
    'accessActive',true,
    'accessReason','active',
    'command',jsonb_build_object(
      'id',c.id,
      'type',c.command_type,
      'payload',c.payload,
      'expiresAt',c.expires_at
    )
  );
end
$function$
;

CREATE OR REPLACE FUNCTION public.sentinel_agent_register(p_install_id text, p_device_secret text, p_display_name text DEFAULT 'PC Sentinel'::text, p_agent_version text DEFAULT '8.8.0'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v sentinel_app.devices%rowtype;
  v_hash text;
  v_code text;
  v_access boolean:=false;
begin
  if length(coalesce(p_install_id,''))<16 or length(coalesce(p_device_secret,''))<24 then
    return jsonb_build_object('ok',false,'error','device_identity_invalid');
  end if;

  v_hash:=encode(extensions.digest(p_device_secret,'sha256'),'hex');

  select * into v
  from sentinel_app.devices
  where install_id=p_install_id
  limit 1;

  if not found then
    v_code:='SNTL-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4))||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));

    insert into sentinel_app.devices(
      install_id,device_secret_hash,pairing_code_hash,pairing_expires_at,
      display_name,status,agent_version,last_seen_at
    )
    values(
      p_install_id,
      v_hash,
      encode(extensions.digest(v_code,'sha256'),'hex'),
      now()+interval '30 minutes',
      left(coalesce(nullif(trim(p_display_name),''),'PC Sentinel'),80),
      'pending',
      left(coalesce(p_agent_version,'8.8.0'),30),
      now()
    )
    returning * into v;
  else
    if v.device_secret_hash<>v_hash or v.status='revoked' then
      return jsonb_build_object('ok',false,'error','device_unauthorized');
    end if;

    update sentinel_app.devices
    set display_name=left(coalesce(nullif(trim(p_display_name),''),display_name),80),
        agent_version=left(coalesce(p_agent_version,'8.8.0'),30),
        last_seen_at=now(),
        updated_at=now()
    where id=v.id
    returning * into v;

    if v.account_id is null then
      v_code:='SNTL-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4))||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
      update sentinel_app.devices
      set status='pending',
          paired_at=null,
          pairing_code_hash=encode(extensions.digest(v_code,'sha256'),'hex'),
          pairing_expires_at=now()+interval '30 minutes',
          updated_at=now()
      where id=v.id;
    end if;
  end if;

  if v.account_id is not null then
    v_access:=sentinel_app.agent_access_active(v.account_id) AND sentinel_app.agent_web_session_active(v.account_id);
  end if;

  return jsonb_build_object(
    'ok',true,
    'deviceId',v.id,
    'paired',v.account_id is not null,
    'pairingCode',v_code,
    'accessActive',v_access,
    'accessReason',
      case
        when v.account_id is null then 'unpaired'
        when v_access then 'active'
        else 'subscription_inactive'
      end
  );
end
$function$
;
-- Existing payment and browser-login entitlements are unchanged.

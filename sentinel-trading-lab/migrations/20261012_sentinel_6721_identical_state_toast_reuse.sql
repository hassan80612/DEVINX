-- Sentinel 67.21: identical-state heartbeat physical-write optimization.
-- Identical interface, JSON values, timestamps, authorization and cadence.
-- Existing release / Agent / mobile UI must not be modified.
-- State changes remain immediate; no fixed delay, cache, throttle or signal loss.
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
    v_access:=sentinel_app.agent_access_active(v.account_id);
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

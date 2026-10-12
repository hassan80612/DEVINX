-- Maintenance for Sentinel 13.4.67.21.
-- Deliberately preserves ALL live RPC signatures, command polling frequency,
-- live channel, analysis, device accounts, active sessions and active agents.
-- Only reduce redundant heartbeat writes and retire terminal commands.
CREATE OR REPLACE FUNCTION public.sentinel_agent_heartbeat(
 p_install_id text,
 p_device_secret text,
 p_state jsonb,
 p_agent_version text DEFAULT '8.8.0'::text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
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
  insert into sentinel_app.device_state(device_id,account_id,state,heartbeat_at,updated_at)
  values(v.id,v.account_id,coalesce(p_state,'{}'::jsonb),now(),now())
  on conflict(device_id) do update
  set account_id=excluded.account_id,
      state=excluded.state,
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
$function$;

-- The account table is tiny, but remove a proven exact duplicate unique
-- index while leaving the other single-master uniqueness rule in place.
DROP INDEX IF EXISTS sentinel_app.sentinel_single_master_idx;

-- Terminal commands are no longer executed; retain >=72h of recent history
-- and all manual-order commands for diagnostics and dispute resolution.
DELETE FROM sentinel_app.commands
WHERE status IN ('acked','rejected','expired','canceled')
  AND created_at < now() - interval '72 hours'
  AND command_type NOT LIKE '%manual-order%';

-- Old abandoned/revoked heartbeat snapshots are regenerated automatically
-- if an unpaired device starts up later. Keep active devices untouched.
DELETE FROM sentinel_app.device_state s
USING sentinel_app.devices d
WHERE s.device_id=d.id AND d.status IN ('revoked','pending')
 AND COALESCE(d.last_seen_at,d.created_at)<now()-interval '7 days'
 AND NOT EXISTS(
   SELECT 1 FROM sentinel_app.commands c
   WHERE c.device_id=d.id AND c.status IN ('queued','delivered')
 );

-- One light, daily retention operation prevents endless command buildup.
SELECT cron.schedule(
 'sentinel_terminal_commands_retention_72h',
 '39 6 * * *',
 $job$DELETE FROM sentinel_app.commands
 WHERE status IN ('acked','rejected','expired','canceled')
 AND created_at < now() - interval '72 hours'
 AND command_type NOT LIKE '%manual-order%'$job$
);

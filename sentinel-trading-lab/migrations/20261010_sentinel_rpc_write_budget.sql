-- Preserve the existing security-definer RPC implementations and grants.
-- Only throttle redundant liveness writes; command detection remains at 2.5s.
DO $$
DECLARE def text; marker text; substitute text;
BEGIN
  def:=pg_get_functiondef('public.sentinel_agent_poll(text,text)'::regprocedure);
  marker:=E'  update sentinel_app.devices\n  set last_seen_at=now(),updated_at=now()\n  where id=v.id;';
  substitute:=E'  update sentinel_app.devices\n  set last_seen_at=now(),updated_at=now()\n  where id=v.id and (last_seen_at is null or last_seen_at < now() - interval ''10 seconds'');';
  IF position(marker in def)=0 THEN
    IF position('last_seen_at < now() - interval ''10 seconds''' in def)=0 THEN
      RAISE EXCEPTION 'Unexpected sentinel_agent_poll definition. No changes applied.';
    END IF;
  ELSE
    EXECUTE replace(def,marker,substitute);
  END IF;

  def:=pg_get_functiondef('public.sentinel_auth_me(text)'::regprocedure);
  marker:=E'  update sentinel_app.sessions\n  set last_seen_at=now()\n  where token_hash=v_hash;';
  substitute:=E'  update sentinel_app.sessions\n  set last_seen_at=now()\n  where token_hash=v_hash and (last_seen_at is null or last_seen_at < now() - interval ''5 minutes'');';
  IF position(marker in def)=0 THEN
    IF position('last_seen_at < now() - interval ''5 minutes''' in def)=0 THEN
      RAISE EXCEPTION 'Unexpected sentinel_auth_me definition. No changes applied.';
    END IF;
  ELSE
    EXECUTE replace(def,marker,substitute);
  END IF;
END $$;

-- Background browser timers may run only once per minute. A 60s lease
-- races that schedule. Keep a bounded three-minute OPEN-tab lease, while
-- expired/revoked sessions and inactive accounts still fail immediately.
CREATE OR REPLACE FUNCTION sentinel_app.agent_web_session_active(p_account_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
 AS $$
 SELECT EXISTS (
  SELECT 1 FROM sentinel_app.sessions s
  JOIN sentinel_app.accounts a ON a.id=s.account_id
  WHERE s.account_id=p_account_id AND s.expires_at>now() AND a.status='active'
    AND s.last_presence_at>=now()-interval '180 seconds'
 ) $$;
REVOKE ALL ON FUNCTION sentinel_app.agent_web_session_active(uuid) FROM PUBLIC,anon,authenticated;

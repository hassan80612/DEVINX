-- Agent authorization follows authenticated login, never browser presence.
-- An explicit logout invalidates older Agent authorizations account-wide;
-- a subsequent login can authorize again. Paid/device checks stay unchanged.
ALTER TABLE sentinel_app.accounts
  ADD COLUMN IF NOT EXISTS agent_logged_out_at timestamptz;

CREATE OR REPLACE FUNCTION sentinel_app.agent_web_session_active(p_account_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
 AS $$
 SELECT EXISTS (
   SELECT 1 FROM sentinel_app.sessions s
   JOIN sentinel_app.accounts a ON a.id=s.account_id
   WHERE s.account_id=p_account_id AND a.status='active'
     AND s.expires_at>now()
     AND (a.agent_logged_out_at IS NULL OR s.created_at>a.agent_logged_out_at)
 ) $$;
REVOKE ALL ON FUNCTION sentinel_app.agent_web_session_active(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sentinel_auth_logout(p_session_token text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
 AS $$
 DECLARE v_account uuid;
 BEGIN
   DELETE FROM sentinel_app.sessions
   WHERE token_hash=encode(extensions.digest(coalesce(p_session_token,''),'sha256'),'hex')
   RETURNING account_id INTO v_account;
   IF v_account IS NOT NULL THEN
     UPDATE sentinel_app.accounts
     SET agent_logged_out_at=clock_timestamp(),updated_at=now()
     WHERE id=v_account;
   END IF;
   RETURN jsonb_build_object('ok',true);
 END $$;

-- Integration test against the installed RPCs. All fixture rows roll back.
BEGIN;
DO $$
DECLARE
  a uuid; d uuid; response jsonb;
  token text:='logout-fixture-'||gen_random_uuid()::text;
  install text:='logout-fixture-'||gen_random_uuid()::text;
  secret text:=gen_random_uuid()::text;
BEGIN
  INSERT INTO sentinel_app.accounts(email,password_hash,role,plan,agent_enabled,access_expires_at)
  VALUES(gen_random_uuid()::text||'@test.invalid','unusable-test-hash','user','manual',true,now()+interval '1 day')
  RETURNING id INTO a;
  INSERT INTO sentinel_app.sessions(token_hash,account_id,expires_at,created_at,last_presence_at)
  VALUES(encode(extensions.digest(token,'sha256'),'hex'),a,now()+interval '1 day',now()-interval '1 hour',NULL),
    (encode(extensions.digest(token||'-old','sha256'),'hex'),a,now()+interval '1 day',now()-interval '2 hours',now()-interval '2 hours');
  response:=public.sentinel_agent_register(install,secret,'Isolated logout test','13.8.9');
  d:=(response->>'deviceId')::uuid;
  UPDATE sentinel_app.devices SET account_id=a,status='active' WHERE id=d;
  response:=public.sentinel_agent_poll(install,secret);
  IF response->>'accessActive' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'No page presence must still authorize: %',response; END IF;
  PERFORM public.sentinel_auth_logout('wrong-'||token);
  IF NOT sentinel_app.agent_web_session_active(a) THEN RAISE EXCEPTION 'Unknown token revoked account'; END IF;
  PERFORM public.sentinel_auth_logout(token);
  response:=public.sentinel_agent_poll(install,secret);
  IF response->>'accessActive' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Logout must stop Agent despite older sessions: %',response; END IF;
  INSERT INTO sentinel_app.sessions(token_hash,account_id,expires_at,created_at)
  VALUES(encode(extensions.digest(token||'-new','sha256'),'hex'),a,now()+interval '1 day',clock_timestamp());
  response:=public.sentinel_agent_poll(install,secret);
  IF response->>'accessActive' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'New login must restore access: %',response; END IF;
  UPDATE sentinel_app.accounts SET access_expires_at=now()-interval '1 second' WHERE id=a;
  response:=public.sentinel_agent_poll(install,secret);
  IF response->>'accessActive' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Expired subscription authorized'; END IF;
  UPDATE sentinel_app.accounts SET access_expires_at=now()+interval '1 day',agent_enabled=false WHERE id=a;
  response:=public.sentinel_agent_poll(install,secret);
  IF response->>'accessActive' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Revoked entitlement authorized'; END IF;
  UPDATE sentinel_app.accounts SET agent_enabled=true,status='blocked' WHERE id=a;
  IF sentinel_app.agent_web_session_active(a) THEN RAISE EXCEPTION 'Blocked account authorized'; END IF;
  UPDATE sentinel_app.accounts SET status='active' WHERE id=a;
  UPDATE sentinel_app.sessions SET expires_at=now()-interval '1 second' WHERE account_id=a;
  IF sentinel_app.agent_web_session_active(a) THEN RAISE EXCEPTION 'Expired login authorized'; END IF;
  UPDATE sentinel_app.devices SET status='revoked' WHERE id=d;
  response:=public.sentinel_agent_poll(install,secret);
  IF response->>'error' IS DISTINCT FROM 'device_unauthorized' THEN RAISE EXCEPTION 'Revoked device authorized'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: absent presence, logout, old sessions, new login, expired subscription, revoked entitlement, blocked account, expired login, revoked device' AS result;

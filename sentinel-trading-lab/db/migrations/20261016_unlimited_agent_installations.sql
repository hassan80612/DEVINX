-- Sentinel: authenticated paid accounts may authorize any number of PCs.
-- The existing account-to-Agent authorization remains automatic in the PC panel.
CREATE OR REPLACE FUNCTION public.sentinel_claim_device(p_session_token text, p_pairing_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE a sentinel_app.accounts%rowtype; d sentinel_app.devices%rowtype; v_hash text;
BEGIN
  v_hash:=encode(extensions.digest(coalesce(p_session_token,''),'sha256'),'hex');
  SELECT x.* INTO a FROM sentinel_app.sessions s
  JOIN sentinel_app.accounts x ON x.id=s.account_id
  WHERE s.token_hash=v_hash AND s.expires_at>now() AND x.status='active' LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','unauthorized'); END IF;
  IF NOT sentinel_app.agent_access_active(a.id) THEN RETURN jsonb_build_object('ok',false,'error','agent_access_required'); END IF;
  SELECT * INTO d FROM sentinel_app.devices
  WHERE pairing_code_hash=encode(extensions.digest(upper(trim(coalesce(p_pairing_code,''))),'sha256'),'hex')
    AND pairing_expires_at>now() AND account_id IS NULL AND status='pending' LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','codigo_expirado_ou_invalido'); END IF;
  UPDATE sentinel_app.devices SET account_id=a.id,status='active',paired_at=now(),
      pairing_code_hash=NULL,pairing_expires_at=NULL,updated_at=now() WHERE id=d.id;
  UPDATE sentinel_app.device_state SET account_id=a.id WHERE device_id=d.id;
  RETURN jsonb_build_object('ok',true,'deviceId',d.id,'accessActive',true);
END;
$function$;
-- Deprecated endpoint is retained for older clients but cannot revoke the old PC.
CREATE OR REPLACE FUNCTION public.sentinel_replace_device(p_session_token text, p_pairing_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE outcome jsonb;
BEGIN
  outcome:=public.sentinel_claim_device(p_session_token,p_pairing_code);
  IF coalesce((outcome->>'ok')::boolean,false) THEN RETURN outcome||jsonb_build_object('replaced',false); END IF;
  RETURN outcome;
END;
$function$;

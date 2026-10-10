CREATE TABLE IF NOT EXISTS sentinel_app.kiwify_webhook_auth (integration text PRIMARY KEY, secret_sha256 text NOT NULL);
ALTER TABLE sentinel_app.kiwify_webhook_auth ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sentinel_app.kiwify_webhook_auth FROM PUBLIC,anon,authenticated;
INSERT INTO sentinel_app.kiwify_webhook_auth(integration,secret_sha256) VALUES('sentinel_monthly','11adfc9a9f1588e0a33930ac2e6482f838de58c18a41b09418cfd628aeee8756')
ON CONFLICT(integration) DO UPDATE SET secret_sha256=excluded.secret_sha256;
CREATE OR REPLACE FUNCTION public.sentinel_kiwify_paid_verified(p_internal_token text,p_order_id text,p_product_id text,p_email text,p_kind text,p_paid_at timestamptz DEFAULT NULL,p_event_at timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
IF NOT EXISTS(SELECT 1 FROM sentinel_app.kiwify_webhook_auth WHERE integration='sentinel_monthly' AND secret_sha256=encode(extensions.digest(coalesce(p_internal_token,''),'sha256'),'hex')) THEN
 RETURN jsonb_build_object('ok',false,'error','unauthorized');
END IF;
RETURN public.sentinel_kiwify_apply_prepaid(p_order_id,p_product_id,p_email,p_kind,p_paid_at,p_event_at);
END $fn$;
REVOKE ALL ON FUNCTION public.sentinel_kiwify_paid_verified(text,text,text,text,text,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sentinel_kiwify_paid_verified(text,text,text,text,text,timestamptz,timestamptz) TO anon,authenticated;
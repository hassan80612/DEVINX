-- 30-day prepaid Sentinel entitlement: only Kiwify-verified, non-refunded orders.
-- A purchase made before signup begins at registration (same buyer email).
CREATE OR REPLACE FUNCTION sentinel_app.refresh_kiwify_prepaid_access(p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid; v_registered_at timestamptz; v_expiry timestamptz; v_order record; v_paid_count integer:=0;
BEGIN
 SELECT a.id,a.created_at INTO v_id,v_registered_at FROM sentinel_app.accounts a
 WHERE lower(a.email)=lower(trim(p_email)) AND a.status='active' FOR UPDATE;
 IF v_id IS NULL THEN RETURN jsonb_build_object('ok',true,'accountLinked',false); END IF;
 IF EXISTS(SELECT 1 FROM sentinel_app.master_owner mo WHERE mo.account_id=v_id)
 THEN RETURN jsonb_build_object('ok',true,'accountLinked',true,'master',true); END IF;
 IF NOT EXISTS(SELECT 1 FROM sentinel_app.kiwify_prepaid_orders o WHERE o.customer_email=lower(trim(p_email)))
 THEN RETURN jsonb_build_object('ok',true,'accountLinked',true,'unchanged',true); END IF;
 FOR v_order IN SELECT o.order_id,o.paid_at FROM sentinel_app.kiwify_prepaid_orders o
  WHERE o.customer_email=lower(trim(p_email)) AND o.state='paid' AND o.paid_at IS NOT NULL
  ORDER BY o.paid_at,o.order_id LOOP
  v_expiry := greatest(coalesce(v_expiry,v_order.paid_at),v_order.paid_at,v_registered_at)+interval '30 days';
  v_paid_count:=v_paid_count+1;
 END LOOP;
 UPDATE sentinel_app.accounts SET plan='sentinel-kiwify-prepaid-30d',
  agent_enabled=(v_expiry IS NOT NULL AND v_expiry>now()),
  access_expires_at=coalesce(v_expiry,now()),updated_at=now()
 WHERE id=v_id;
 RETURN jsonb_build_object('ok',true,'accountLinked',true,'paidOrders',v_paid_count,
  'accessActive',coalesce(v_expiry>now(),false),'expiresAt',v_expiry,'billing','prepaid_30_days');
END $$;
REVOKE ALL ON FUNCTION sentinel_app.refresh_kiwify_prepaid_access(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION sentinel_app.refresh_kiwify_prepaid_access(text) TO service_role;
CREATE OR REPLACE FUNCTION sentinel_app.agent_access_active(p_account_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT EXISTS(SELECT 1 FROM sentinel_app.master_owner mo
  WHERE mo.singleton=true AND mo.account_id=a.id)
  OR (a.status='active' AND a.agent_enabled=true AND (
   (a.plan IN ('sentinel-kiwify-prepaid-30d','sentinel-kiwify-usd50-prepaid-30d')
     AND a.access_expires_at>now())
   OR (a.plan='manual' AND (a.access_expires_at IS NULL OR a.access_expires_at>now()))))
  FROM sentinel_app.accounts a WHERE a.id=p_account_id),false)
$$;
REVOKE ALL ON FUNCTION sentinel_app.agent_access_active(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION sentinel_app.agent_access_active(uuid) TO service_role;
DO $$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT a.email FROM sentinel_app.accounts a
   JOIN sentinel_app.kiwify_prepaid_orders o ON o.customer_email=lower(trim(a.email))
   WHERE a.status='active' AND a.role<>'master'
 LOOP PERFORM sentinel_app.refresh_kiwify_prepaid_access(r.email); END LOOP;
END $$;

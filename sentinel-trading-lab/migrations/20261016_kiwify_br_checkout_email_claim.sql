-- Allow exactly the verified Sentinel BR checkout after an authenticated
-- Kiwify webhook binds its real product ID. Existing INTL ID stays valid.
CREATE TABLE IF NOT EXISTS sentinel_app.kiwify_checkout_products(
  checkout_code text PRIMARY KEY CHECK(checkout_code='SQku9Rd'),
  product_id text NOT NULL UNIQUE CHECK(
    product_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sentinel_app.kiwify_checkout_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sentinel_app.kiwify_checkout_products FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sentinel_kiwify_apply_prepaid(p_order_id text, p_product_id text, p_email text, p_kind text, p_paid_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_event_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_order sentinel_app.kiwify_prepaid_orders%rowtype;
  v_kind text:=lower(trim(coalesce(p_kind,'')));
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_result jsonb;
  v_event_at timestamptz:=coalesce(p_event_at,now());
BEGIN
  IF p_product_id<>'c05e1f00-c469-11f1-8fdf-3f2670dd515f'
     AND NOT EXISTS (
       SELECT 1 FROM sentinel_app.kiwify_checkout_products
       WHERE checkout_code='SQku9Rd' AND product_id=p_product_id
     ) THEN
    RETURN jsonb_build_object('ok',true,'ignored','product');
  END IF;
  IF length(coalesce(p_order_id,'')) NOT BETWEEN 6 AND 180 OR
     v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR
     length(v_email)>254 OR v_kind NOT IN ('paid','reversed') THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_event');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_order_id));
  SELECT * INTO v_order FROM sentinel_app.kiwify_prepaid_orders
    WHERE order_id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO sentinel_app.kiwify_prepaid_orders(
      order_id,product_id,customer_email,state,paid_at,last_event_at
    ) VALUES(
      p_order_id,p_product_id,v_email,v_kind,
      CASE WHEN v_kind='paid' THEN coalesce(p_paid_at,now()) ELSE NULL END,v_event_at
    );
  ELSE
    -- Refunds/chargebacks are terminal for this order. A delayed approval or
    -- Kiwify retry cannot re-enable it. A refund may arrive before approval.
    IF v_order.product_id<>p_product_id OR v_order.customer_email<>v_email THEN
      RETURN jsonb_build_object('ok',false,'error','order_identity_conflict');
    END IF;
    IF v_order.state='reversed' OR (v_order.state='paid' AND v_kind='paid') THEN
      RETURN jsonb_build_object('ok',true,'duplicate',true);
    END IF;
    UPDATE sentinel_app.kiwify_prepaid_orders
       SET state='reversed',last_event_at=v_event_at,updated_at=now()
       WHERE order_id=p_order_id;
  END IF;
  v_result:=sentinel_app.refresh_kiwify_prepaid_access(v_email);
  RETURN jsonb_build_object('ok',true,'kind',v_kind,'orderProcessed',true,
    'accountLinked',v_result->'accountLinked','accessActive',v_result->'accessActive',
    'expiresAt',v_result->'expiresAt');
END $function$;

REVOKE ALL ON FUNCTION public.sentinel_kiwify_apply_prepaid(text,text,text,text,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sentinel_kiwify_apply_prepaid(text,text,text,text,timestamptz,timestamptz) TO service_role;

-- This RPC retains the existing internal-token defense. Its product-ID binding
-- comes from the Kiwify-signed checkout_link sent by the server, not the user.
CREATE OR REPLACE FUNCTION public.sentinel_kiwify_paid_verified_checkout(
  p_internal_token text,
  p_order_id text,
  p_product_id text,
  p_checkout_code text,
  p_email text,
  p_kind text,
  p_paid_at timestamptz DEFAULT NULL,
  p_event_at timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_bound_id text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM sentinel_app.kiwify_webhook_auth
    WHERE integration='sentinel_monthly'
      AND secret_sha256=encode(extensions.digest(coalesce(p_internal_token,''),'sha256'),'hex')
  ) THEN
    RETURN jsonb_build_object('ok',false,'error','unauthorized');
  END IF;

  IF coalesce(p_checkout_code,'')<>'SQku9Rd' OR
     p_product_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN jsonb_build_object('ok',false,'error','unrecognized_checkout');
  END IF;
  IF length(coalesce(p_order_id,'')) NOT BETWEEN 6 AND 180 OR
     lower(trim(coalesce(p_email,''))) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR
     lower(trim(coalesce(p_kind,''))) NOT IN ('paid','reversed') THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_event');
  END IF;

  -- First signed purchase irrevocably binds the BR checkout to a product.
  -- A future mismatched product ID fails closed instead of overwriting it.
  INSERT INTO sentinel_app.kiwify_checkout_products(checkout_code,product_id)
  VALUES('SQku9Rd',p_product_id) ON CONFLICT DO NOTHING;
  SELECT product_id INTO v_bound_id FROM sentinel_app.kiwify_checkout_products
  WHERE checkout_code='SQku9Rd';
  IF v_bound_id IS DISTINCT FROM p_product_id THEN
    RETURN jsonb_build_object('ok',false,'error','checkout_product_mismatch');
  END IF;

  RETURN public.sentinel_kiwify_apply_prepaid(
    p_order_id,p_product_id,p_email,p_kind,p_paid_at,p_event_at
  );
END
$$;
REVOKE ALL ON FUNCTION public.sentinel_kiwify_paid_verified_checkout(text,text,text,text,text,text,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sentinel_kiwify_paid_verified_checkout(text,text,text,text,text,text,timestamptz,timestamptz) TO anon,authenticated;

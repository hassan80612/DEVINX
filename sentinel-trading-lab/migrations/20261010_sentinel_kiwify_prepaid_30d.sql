-- Sentinel prepaid Kiwify checkout: one confirmed purchase = 30 days.
-- Deploy migration only as part of the user's approved unified release.
-- Orders may arrive before a customer registers. No raw checkout payloads,
-- CPF, card data or webhook signatures are stored.
CREATE TABLE IF NOT EXISTS sentinel_app.kiwify_prepaid_orders(
  order_id text PRIMARY KEY,
  product_id text NOT NULL,
  customer_email text NOT NULL,
  state text NOT NULL CHECK (state IN ('paid','reversed')),
  paid_at timestamptz,
  last_event_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sentinel_kiwify_order_size CHECK (length(order_id) BETWEEN 6 AND 180),
  CONSTRAINT sentinel_kiwify_email_size CHECK (length(customer_email) BETWEEN 3 AND 254)
);
CREATE INDEX IF NOT EXISTS sentinel_kiwify_orders_customer_idx
  ON sentinel_app.kiwify_prepaid_orders(customer_email,paid_at) WHERE state='paid';
ALTER TABLE sentinel_app.kiwify_prepaid_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sentinel_app.kiwify_prepaid_orders FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON sentinel_app.kiwify_prepaid_orders TO service_role;

-- Rebuild a membership from distinct, non-refunded payments in chronological
-- order. A refund never grants access and a second webhook for the same order
-- never adds days. Existing manual/master accounts are not touched unless
-- they have a payment on this specific product.
CREATE OR REPLACE FUNCTION sentinel_app.refresh_kiwify_prepaid_access(p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_id uuid;
  v_role text;
  v_expiry timestamptz:=NULL;
  v_order record;
  v_days integer:=0;
  v_paid_count integer:=0;
BEGIN
  SELECT a.id,a.role INTO v_id,v_role
  FROM sentinel_app.accounts a
  WHERE lower(a.email)=lower(trim(p_email)) AND a.status='active'
  FOR UPDATE;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok',true,'accountLinked',false,'days',0);
  END IF;
  IF EXISTS(SELECT 1 FROM sentinel_app.master_owner WHERE account_id=v_id) THEN
    RETURN jsonb_build_object('ok',true,'accountLinked',true,'master',true);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM sentinel_app.kiwify_prepaid_orders
                WHERE customer_email=lower(trim(p_email))) THEN
    RETURN jsonb_build_object('ok',true,'accountLinked',true,'unchanged',true);
  END IF;
  FOR v_order IN
    SELECT paid_at FROM sentinel_app.kiwify_prepaid_orders
    WHERE customer_email=lower(trim(p_email))
      AND state='paid' AND paid_at IS NOT NULL
    ORDER BY paid_at,order_id
  LOOP
    v_expiry:=greatest(coalesce(v_expiry,v_order.paid_at),v_order.paid_at)
              +interval '30 days';
    v_paid_count:=v_paid_count+1;
  END LOOP;
  UPDATE sentinel_app.accounts
  SET plan='sentinel-kiwify-usd50-prepaid-30d',
      agent_enabled=(v_expiry IS NOT NULL AND v_expiry>now()),
      access_expires_at=coalesce(v_expiry,now()),
      updated_at=now()
  WHERE id=v_id;
  RETURN jsonb_build_object('ok',true,'accountLinked',true,
    'paidOrders',v_paid_count,'accessActive',v_expiry>now(),
    'expiresAt',v_expiry);
END $$;
REVOKE ALL ON FUNCTION sentinel_app.refresh_kiwify_prepaid_access(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION sentinel_app.refresh_kiwify_prepaid_access(text) TO service_role;

-- The webhook RPC is inaccessible with the public/anon key. Only an
-- authenticated server using the service-role key may alter entitlements.
CREATE OR REPLACE FUNCTION public.sentinel_kiwify_apply_prepaid(
  p_order_id text,
  p_product_id text,
  p_email text,
  p_kind text,
  p_paid_at timestamptz DEFAULT NULL,
  p_event_at timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_order sentinel_app.kiwify_prepaid_orders%rowtype;
  v_kind text:=lower(trim(coalesce(p_kind,'')));
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_result jsonb;
  v_event_at timestamptz:=coalesce(p_event_at,now());
BEGIN
  IF p_product_id<>'c05e1f00-c469-11f1-8fdf-3f2670dd515f' THEN
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
END $$;
REVOKE ALL ON FUNCTION public.sentinel_kiwify_apply_prepaid(text,text,text,text,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sentinel_kiwify_apply_prepaid(text,text,text,text,timestamptz,timestamptz) TO service_role;

-- Allow a user who paid before registering to claim her prepaid days without
-- exposing any untrusted RPC or bypassing normal registration validation.
CREATE OR REPLACE FUNCTION sentinel_app.kiwify_claim_on_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF new.role <> 'master' THEN
    PERFORM sentinel_app.refresh_kiwify_prepaid_access(new.email);
  END IF;
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION sentinel_app.kiwify_claim_on_signup() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS sentinel_kiwify_claim_on_signup ON sentinel_app.accounts;
CREATE TRIGGER sentinel_kiwify_claim_on_signup
  AFTER INSERT ON sentinel_app.accounts
  FOR EACH ROW EXECUTE FUNCTION sentinel_app.kiwify_claim_on_signup();

-- Only the real master and paid, unexpired Kiwify users can operate the Agent.
-- This check is shared by web login, Agent heartbeat and command polling.
CREATE OR REPLACE FUNCTION sentinel_app.agent_access_active(p_account_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $
  SELECT coalesce((
    SELECT EXISTS (
      SELECT 1 FROM sentinel_app.master_owner mo
      WHERE mo.singleton=true AND mo.account_id=a.id
    )
    OR (
      a.status='active'
      AND a.agent_enabled=true
      AND a.plan='sentinel-kiwify-usd50-prepaid-30d'
      AND a.access_expires_at IS NOT NULL
      AND a.access_expires_at>now()
    )
    FROM sentinel_app.accounts a WHERE a.id=p_account_id
  ),false)
$;
REVOKE ALL ON FUNCTION sentinel_app.agent_access_active(uuid) FROM PUBLIC,anon,authenticated;
-- Security-definer callers resolve this function with creator privileges.
GRANT EXECUTE ON FUNCTION sentinel_app.agent_access_active(uuid) TO service_role;


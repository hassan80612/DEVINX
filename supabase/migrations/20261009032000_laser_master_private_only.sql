-- Applied through Supabase management API to DEVINX on 2026-10-09.
-- Product-specific privacy switch. Do not disable Financeiro or Loja signups.
CREATE OR REPLACE FUNCTION public.get_laser_access_status()
RETURNS TABLE(
  allowed boolean, is_admin boolean, owner_access boolean, mentor_access boolean,
  plan_id text, expires_at timestamptz, mentor_billing_mode text, mentor_max_concurrent integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $body$
DECLARE v_master boolean:=false;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.devinx_admin_users a WHERE a.user_id=auth.uid()
    ) INTO v_master;
  END IF;
  IF v_master THEN
    RETURN QUERY SELECT true,true,true,true,'master'::text,NULL::timestamptz,'master'::text,25;
  ELSE
    RETURN QUERY SELECT false,false,false,false,NULL::text,NULL::timestamptz,'disabled'::text,1;
  END IF;
END;
$body$;

CREATE OR REPLACE FUNCTION public.register_devinx_product(p_product text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $body$
DECLARE
  v_uid uuid:=auth.uid();
  v_product text:=lower(trim(coalesce(p_product,'')));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF v_product NOT IN ('financeiro','laser') THEN RAISE EXCEPTION 'invalid product'; END IF;
  IF v_product='laser' AND NOT EXISTS (
    SELECT 1 FROM public.devinx_admin_users a WHERE a.user_id=v_uid
  ) THEN
    RAISE EXCEPTION 'laser_private';
  END IF;
  INSERT INTO public.devinx_product_memberships(user_id,product,source,created_at,updated_at)
  VALUES(v_uid,v_product,'authenticated_flow',now(),now())
  ON CONFLICT(user_id,product) DO UPDATE SET updated_at=now();
END;
$body$;

-- Existing user grants are intentionally preserved for audit, but they do not
-- authorize the product after this migration. Ferrari access was revoked
-- individually in production with status='blocked'.
UPDATE public.devinx_settings
SET laser_public_visible=false
WHERE singleton=true;

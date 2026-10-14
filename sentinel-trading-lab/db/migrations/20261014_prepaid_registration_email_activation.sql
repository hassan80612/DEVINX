-- Purchase-first onboarding: once the customer registers with the SAME
-- approved Kiwify checkout email, attach previously verified, signed
-- prepaid orders to this Sentinel account. Never grant access for a mere
-- redirect/URL/email claim: only the verified webhook writes paid orders.
CREATE OR REPLACE FUNCTION sentinel_app.activate_prepaid_after_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
 IF NEW.role<>'master' AND EXISTS (
   SELECT 1 FROM sentinel_app.kiwify_prepaid_orders o
   WHERE o.customer_email=lower(trim(NEW.email)) AND o.state='paid'
 ) THEN
   PERFORM sentinel_app.refresh_kiwify_prepaid_access(NEW.email);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sentinel_accounts_activate_prepaid_after_registration ON sentinel_app.accounts;
CREATE TRIGGER sentinel_accounts_activate_prepaid_after_registration
 AFTER INSERT ON sentinel_app.accounts FOR EACH ROW
 EXECUTE FUNCTION sentinel_app.activate_prepaid_after_registration();
REVOKE ALL ON FUNCTION sentinel_app.activate_prepaid_after_registration() FROM PUBLIC,anon,authenticated;

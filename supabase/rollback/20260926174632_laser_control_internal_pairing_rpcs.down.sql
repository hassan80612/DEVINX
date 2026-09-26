-- Rollback for migration 20260926174632.
revoke all on function public.laser_internal_store_pairing_offer(uuid,text,text,text,text,text,text,timestamptz) from service_role;
revoke all on function public.laser_internal_pairing_status(uuid,text) from service_role;
revoke all on function public.laser_internal_claim_pairing(uuid,text,text) from service_role;

drop function if exists public.laser_internal_store_pairing_offer(uuid,text,text,text,text,text,text,timestamptz);
drop function if exists public.laser_internal_pairing_status(uuid,text);
drop function if exists public.laser_internal_claim_pairing(uuid,text,text);

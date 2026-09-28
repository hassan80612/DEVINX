
do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname like 'laser_internal_%'
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated',
      r.schema_name,r.proname,r.args
    );
    execute format(
      'grant execute on function %I.%I(%s) to service_role',
      r.schema_name,r.proname,r.args
    );
  end loop;
end
$$;

revoke all on function public.laser_guard_mentor_device_expiry() from public,anon,authenticated;
grant execute on function public.laser_guard_mentor_device_expiry() to service_role;

revoke execute on function public.get_laser_access_status() from public,anon;
grant execute on function public.get_laser_access_status() to authenticated,service_role;

revoke execute on function public.get_laser_mentor_sessions_remaining() from public,anon;
grant execute on function public.get_laser_mentor_sessions_remaining() to authenticated,service_role;

create index if not exists claim_attempts_user_id_idx
  on devinx_laser.claim_attempts(user_id);

create index if not exists mentor_credit_orders_user_id_idx
  on devinx_laser.mentor_credit_orders(user_id);

create index if not exists mentor_pairing_offers_claimed_by_user_id_idx
  on devinx_laser.mentor_pairing_offers(claimed_by_user_id);

create index if not exists mentor_usage_ledger_mentor_user_id_idx
  on devinx_laser.mentor_usage_ledger(mentor_user_id);

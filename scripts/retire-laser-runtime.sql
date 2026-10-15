-- DEVINX only: retire the Laser runtime without deleting accounts or data.
-- Verified target: jubiwhtnhxluetzkzomm. This does not lift a billing restriction.
-- Never apply this script to the separate Vetorize/Sentinel project.
begin;
do $retire$
declare
  fn record;
  access_before boolean;
begin
  if to_regnamespace('devinx_laser') is null then
    raise exception 'Expected DEVINX Laser schema is missing; no changes applied';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and p.proname not ilike '%laser%' and p.prosrc ilike '%devinx_laser%'
  ) then
    raise exception 'A shared function still references Laser; review before proceeding';
  end if;
  access_before := has_function_privilege('authenticated',
    'public.get_devinx_access_status()','EXECUTE');
  for fn in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.proname ilike '%laser%'
  loop
    execute format('revoke all privileges on function public.%I(%s) from public, anon, authenticated, service_role',fn.proname,fn.args);
  end loop;
  revoke all privileges on all tables in schema devinx_laser from public, anon, authenticated, service_role;
  revoke all privileges on all sequences in schema devinx_laser from public, anon, authenticated, service_role;
  revoke all privileges on schema devinx_laser from public, anon, authenticated, service_role;
  if has_function_privilege('authenticated',
    'public.get_devinx_access_status()','EXECUTE') is distinct from access_before then
    raise exception 'Finance access grant changed; rolling back';
  end if;
end $retire$;
notify pgrst, 'reload schema';
commit;

-- Expected: 71 retained routines, zero executable Laser routines per API role.
select count(*) as laser_routines,
  count(*) filter(where has_function_privilege('anon',p.oid,'EXECUTE')) as anon_executable,
  count(*) filter(where has_function_privilege('authenticated',p.oid,'EXECUTE')) as authenticated_executable,
  count(*) filter(where has_function_privilege('service_role',p.oid,'EXECUTE')) as service_role_executable
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' and p.proname ilike '%laser%';

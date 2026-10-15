-- Pending explicit confirmation for permanent deletion. Do not run implicitly.
-- Target: DEVINX jubiwhtnhxluetzkzomm. Auth, public finance tables, and Store stay.
-- RESTRICT deliberately aborts the whole transaction on external dependencies.
begin;
do $purge$
declare fn record; typ record; trg record; table_list text; count_functions integer; count_tables integer;
begin
  if not has_function_privilege('authenticated','public.get_devinx_access_status()','EXECUTE') then
    raise exception 'Finance access baseline not satisfied';
  end if;
  select count(*) into count_functions from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.proname ilike '%laser%';
  select count(*) into count_tables from pg_tables where schemaname='devinx_laser';
  if count_functions<>71 or count_tables<>22 then
    raise exception 'Laser inventory changed: functions %, tables %',count_functions,count_tables;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.proname not ilike '%laser%'
      and p.prosrc ilike '%devinx_laser%') then
    raise exception 'A non-Laser function depends on Laser; no deletion applied';
  end if;
  for trg in select t.tgname,c.relname from pg_trigger t
    join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='devinx_laser' and not t.tgisinternal
  loop
    execute format('drop trigger %I on devinx_laser.%I restrict',trg.tgname,trg.relname);
  end loop;
  for fn in select p.proname,pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.proname ilike '%laser%'
  loop
    execute format('drop function public.%I(%s) restrict',fn.proname,fn.args);
  end loop;
  select string_agg(format('%I.%I',schemaname,tablename),', ') into table_list
    from pg_tables where schemaname='devinx_laser';
  execute 'drop table '||table_list||' restrict';
  for typ in select t.typname from pg_type t join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='devinx_laser' and t.typtype in ('e','d')
  loop
    execute format('drop type devinx_laser.%I restrict',typ.typname);
  end loop;
  drop schema devinx_laser restrict;
  if not has_function_privilege('authenticated','public.get_devinx_access_status()','EXECUTE') then
    raise exception 'Finance access changed; rolling back all deletion';
  end if;
end $purge$;
notify pgrst, 'reload schema';
commit;

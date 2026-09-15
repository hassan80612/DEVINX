create or replace function public.complete_initial_setup(p_sources jsonb, p_vehicle jsonb default null)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := auth.uid();
  item jsonb;
  k text;
  n text;
  v_type text;
  e_type text;
  eff numeric;
  price_minor bigint;
  vehicle_name text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_sources is null or jsonb_typeof(p_sources) <> 'array' or jsonb_array_length(p_sources)=0 then
    raise exception 'at least one income source is required';
  end if;
  for item in select value from jsonb_array_elements(p_sources) loop
    k := item->>'kind';
    n := nullif(trim(item->>'name'),'');
    if k not in ('driver','delivery','salary','self_employed','other') or n is null then raise exception 'invalid income source'; end if;
    insert into public.income_sources(user_id,kind,name,is_active) values(uid,k,n,true)
    on conflict (user_id,kind,name) do update set is_active=true;
  end loop;
  if p_vehicle is not null and p_vehicle <> 'null'::jsonb then
    v_type := coalesce(nullif(p_vehicle->>'vehicle_type',''),'car');
    e_type := coalesce(nullif(p_vehicle->>'energy_type',''),'gasoline');
    vehicle_name := coalesce(nullif(trim(p_vehicle->>'name'),''),case v_type when 'motorcycle' then 'Minha moto' when 'bicycle' then 'Minha bicicleta' else 'Meu carro' end);
    if v_type not in ('car','motorcycle','bicycle') then raise exception 'invalid vehicle type'; end if;
    if v_type='bicycle' then e_type:='human'; end if;
    if e_type not in ('gasoline','ethanol','diesel','hybrid','electric','human') then raise exception 'invalid energy type'; end if;
    eff := nullif(p_vehicle->>'efficiency','')::numeric;
    price_minor := coalesce(nullif(p_vehicle->>'unit_price_minor','')::bigint,0);
    if e_type <> 'human' and (eff is null or eff <= 0) then raise exception 'invalid efficiency'; end if;
    if price_minor < 0 then raise exception 'invalid unit price'; end if;
    update public.vehicles set is_default=false where user_id=uid and is_default=true;
    insert into public.vehicles(user_id,name,vehicle_type,energy_type,efficiency,unit_price_minor,is_default)
    values(uid,vehicle_name,v_type,e_type,case when e_type='human' then null else eff end,case when e_type='human' then 0 else price_minor end,true);
  end if;
  update public.profiles set onboarded_at=coalesce(onboarded_at,now()),updated_at=now() where id=uid;
end;
$$;
revoke all on function public.complete_initial_setup(jsonb,jsonb) from public,anon;
grant execute on function public.complete_initial_setup(jsonb,jsonb) to authenticated;

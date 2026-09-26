-- Applied to DevinX Supabase as migration 20260926174632.
-- Internal pairing RPCs are callable only by service_role.

create or replace function public.laser_internal_store_pairing_offer(
  p_device_id uuid,
  p_public_key_pem text,
  p_public_key_fingerprint text,
  p_pairing_code_hash text,
  p_nonce_hash text,
  p_source_ip_hash text,
  p_agent_version text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path to 'devinx_laser','public'
as $$
declare
  v_existing uuid;
  v_count integer;
  v_id uuid;
begin
  if p_device_id is null
     or p_public_key_pem is null
     or char_length(p_public_key_pem) not between 100 and 2048
     or p_public_key_fingerprint !~ '^[0-9a-f]{64}$'
     or p_pairing_code_hash !~ '^[0-9a-f]{64}$'
     or p_nonce_hash !~ '^[0-9a-f]{64}$'
     or p_source_ip_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at <= now()
     or p_expires_at > now() + interval '6 minutes'
     or char_length(coalesce(p_agent_version,'')) > 40 then
    raise exception 'invalid_pairing_offer';
  end if;

  select id into v_existing
  from devinx_laser.pairing_offers
  where nonce_hash=p_nonce_hash
  limit 1;

  if v_existing is not null then return v_existing; end if;

  select count(*) into v_count
  from devinx_laser.pairing_offers
  where created_at > now()-interval '10 minutes'
    and (public_key_fingerprint=p_public_key_fingerprint or source_ip_hash=p_source_ip_hash);

  if v_count >= 5 then raise exception 'pairing_rate_limited'; end if;

  delete from devinx_laser.pairing_offers
  where expires_at < now()-interval '1 day';

  insert into devinx_laser.pairing_offers(
    device_id,public_key_pem,public_key_fingerprint,pairing_code_hash,nonce_hash,
    source_ip_hash,agent_version,expires_at
  )
  values(
    p_device_id,p_public_key_pem,p_public_key_fingerprint,p_pairing_code_hash,p_nonce_hash,
    p_source_ip_hash,nullif(p_agent_version,''),p_expires_at
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.laser_internal_store_pairing_offer(uuid,text,text,text,text,text,text,timestamptz) from public;
revoke all on function public.laser_internal_store_pairing_offer(uuid,text,text,text,text,text,text,timestamptz) from anon;
revoke all on function public.laser_internal_store_pairing_offer(uuid,text,text,text,text,text,text,timestamptz) from authenticated;
grant execute on function public.laser_internal_store_pairing_offer(uuid,text,text,text,text,text,text,timestamptz) to service_role;

create or replace function public.laser_internal_pairing_status(
  p_device_id uuid,
  p_public_key_fingerprint text
)
returns table(paired boolean, device_status text, offer_pending boolean)
language sql
stable
security definer
set search_path to 'devinx_laser','public'
as $$
  select
    exists(select 1 from devinx_laser.devices d where d.id=p_device_id and d.public_key_fingerprint=p_public_key_fingerprint and d.status='active'),
    (select d.status from devinx_laser.devices d where d.id=p_device_id and d.public_key_fingerprint=p_public_key_fingerprint limit 1),
    exists(select 1 from devinx_laser.pairing_offers o where o.device_id=p_device_id and o.public_key_fingerprint=p_public_key_fingerprint and o.consumed_at is null and o.expires_at>now());
$$;

revoke all on function public.laser_internal_pairing_status(uuid,text) from public;
revoke all on function public.laser_internal_pairing_status(uuid,text) from anon;
revoke all on function public.laser_internal_pairing_status(uuid,text) from authenticated;
grant execute on function public.laser_internal_pairing_status(uuid,text) to service_role;

create or replace function public.laser_internal_claim_pairing(
  p_user_id uuid,
  p_pairing_code_hash text,
  p_display_name text
)
returns table(device_id uuid, status text)
language plpgsql
security definer
set search_path to 'devinx_laser','public'
as $$
declare
  v_offer devinx_laser.pairing_offers%rowtype;
  v_existing devinx_laser.devices%rowtype;
  v_ent devinx_laser.entitlements%rowtype;
  v_is_admin boolean;
  v_active_pcs integer;
  v_name text;
begin
  if p_user_id is null or p_pairing_code_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_claim'; end if;
  v_name:=left(coalesce(nullif(trim(p_display_name),''),'PC Windows'),80);

  select * into v_offer
  from devinx_laser.pairing_offers
  where pairing_code_hash=p_pairing_code_hash and consumed_at is null and expires_at>now()
  for update;

  if not found then raise exception 'pairing_offer_not_found'; end if;

  select * into v_existing
  from devinx_laser.devices
  where id=v_offer.device_id or public_key_fingerprint=v_offer.public_key_fingerprint
  limit 1;

  if found then
    if v_existing.owner_user_id<>p_user_id then raise exception 'device_already_owned'; end if;
    update devinx_laser.pairing_offers set consumed_at=now() where id=v_offer.id;
    return query select v_existing.id,v_existing.status;
    return;
  end if;

  select exists(select 1 from public.devinx_admin_users a where a.user_id=p_user_id) into v_is_admin;

  if not v_is_admin then
    select * into v_ent
    from devinx_laser.entitlements
    where user_id=p_user_id and status='active' and (expires_at is null or expires_at>now());

    if not found then raise exception 'laser_entitlement_required'; end if;

    select count(*) into v_active_pcs
    from devinx_laser.devices
    where owner_user_id=p_user_id and status<>'revoked';

    if v_active_pcs>=v_ent.max_pcs then raise exception 'laser_pc_limit_reached'; end if;
  end if;

  insert into devinx_laser.devices(
    id,owner_user_id,display_name,public_key_pem,public_key_fingerprint,
    status,agent_version,paired_at,remote_control_enabled,last_sequence
  )
  values(
    v_offer.device_id,p_user_id,v_name,v_offer.public_key_pem,v_offer.public_key_fingerprint,
    'active',v_offer.agent_version,now(),false,0
  );

  update devinx_laser.pairing_offers set consumed_at=now() where id=v_offer.id;
  return query select v_offer.device_id,'active'::text;
end;
$$;

revoke all on function public.laser_internal_claim_pairing(uuid,text,text) from public;
revoke all on function public.laser_internal_claim_pairing(uuid,text,text) from anon;
revoke all on function public.laser_internal_claim_pairing(uuid,text,text) from authenticated;
grant execute on function public.laser_internal_claim_pairing(uuid,text,text) to service_role;

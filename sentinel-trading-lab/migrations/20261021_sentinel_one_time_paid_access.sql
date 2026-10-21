-- Prepared only. Apply after BOTH Kiwify checkouts use the one-time prices.
-- No Agent binary change: existing device heartbeat continues calling this RPC.
-- Keep signed Kiwify webhook, account login, Master revoke and refund handling.
create or replace function sentinel_app.refresh_kiwify_prepaid_access(p_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_id uuid;
  v_paid_count integer:=0;
begin
  select a.id into v_id
  from sentinel_app.accounts a
  where lower(a.email)=lower(trim(p_email)) and a.status='active'
  for update;
  if v_id is null then return jsonb_build_object('ok',true,'accountLinked',false); end if;
  if exists(select 1 from sentinel_app.master_owner mo where mo.account_id=v_id)
    then return jsonb_build_object('ok',true,'accountLinked',true,'master',true);
  end if;
  if not exists(select 1 from sentinel_app.kiwify_prepaid_orders o
                where o.customer_email=lower(trim(p_email)))
    then return jsonb_build_object('ok',true,'accountLinked',true,'unchanged',true);
  end if;
  select count(*)::integer into v_paid_count
  from sentinel_app.kiwify_prepaid_orders o
  where o.customer_email=lower(trim(p_email)) and o.state='paid' and o.paid_at is not null;
  update sentinel_app.accounts
  set plan='sentinel-kiwify-one-time',
      agent_enabled=(v_paid_count>0),
      access_expires_at=null,
      updated_at=now()
  where id=v_id;
  return jsonb_build_object('ok',true,'accountLinked',true,
    'paidOrders',v_paid_count,'accessActive',v_paid_count>0,
    'expiresAt',null,'billing','one_time');
end $$;

create or replace function sentinel_app.agent_access_active(p_account_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((
    select exists (
      select 1 from sentinel_app.master_owner mo
      where mo.singleton=true and mo.account_id=a.id
    ) or (
      a.status='active'
      and a.agent_enabled=true
      and a.plan in ('sentinel-kiwify-one-time','sentinel-kiwify-usd50-prepaid-30d','manual')
      and (a.access_expires_at is null or a.access_expires_at>now())
    )
    from sentinel_app.accounts a where a.id=p_account_id
  ),false)
$$;

-- Transfer valid pre-existing paid orders to permanent purchase entitlement.
-- Revoked orders never count as paid. Manual grants remain untouched.
do $$
declare r record;
begin
 for r in select distinct a.email
          from sentinel_app.accounts a
          join sentinel_app.kiwify_prepaid_orders o
            on o.customer_email=lower(trim(a.email))
          where a.status='active'
            and a.role<>'master'
 loop
   perform sentinel_app.refresh_kiwify_prepaid_access(r.email);
 end loop;
end $$;

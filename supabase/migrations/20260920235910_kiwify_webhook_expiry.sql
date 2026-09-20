-- Never grant a recurring Kiwify subscription indefinitely when expiry data is missing.
create or replace function public.process_kiwify_webhook(p_payload jsonb,p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  v_expected_hash text;
  v_expected_product text;
  v_product_id text;
  v_email text;
  v_name text;
  v_event text;
  v_order_status text;
  v_order_id text;
  v_subscription_id text;
  v_subscription_status text;
  v_plan_name text;
  v_currency text;
  v_amount bigint;
  v_access_until timestamptz;
  v_started_at timestamptz;
  v_has_access boolean;
  v_access_text text;
  v_user_id uuid;
  v_existing_source text;
  v_existing_access_until timestamptz;
  v_existing_has_access boolean:=false;
  v_effective_access_until timestamptz;
begin
  select kiwify_token_hash,kiwify_product_id
    into v_expected_hash,v_expected_product
  from public.devinx_integration_settings
  where singleton=true;

  if v_expected_hash is null or p_token_hash is distinct from v_expected_hash then
    raise exception 'webhook unauthorized';
  end if;

  v_product_id:=coalesce(
    p_payload#>>'{Product,product_id}',
    p_payload->>'product_id',
    p_payload#>>'{product,product_id}',
    p_payload#>>'{product,id}',
    p_payload#>>'{order,product_id}'
  );
  if v_product_id is null or v_product_id is distinct from v_expected_product then
    return jsonb_build_object('ok',true,'ignored','product');
  end if;

  v_email:=lower(trim(coalesce(p_payload#>>'{Customer,email}',p_payload->>'email','')));
  if v_email='' then raise exception 'customer email missing'; end if;

  select access_until,has_access
    into v_existing_access_until,v_existing_has_access
  from public.devinx_kiwify_subscriptions
  where email=v_email
  limit 1;

  v_name:=nullif(trim(coalesce(p_payload#>>'{Customer,full_name}',p_payload#>>'{Customer,first_name}','')),'');
  v_event:=lower(coalesce(p_payload->>'webhook_event_type',p_payload->>'event_type',p_payload->>'event',''));
  v_order_status:=lower(coalesce(p_payload->>'order_status',''));
  v_order_id:=nullif(coalesce(p_payload->>'order_id',p_payload->>'order_ref'),'');
  v_subscription_id:=nullif(coalesce(p_payload#>>'{Subscription,subscription_id}',p_payload->>'subscription_id'),'');
  v_subscription_status:=nullif(lower(coalesce(p_payload#>>'{Subscription,status}',p_payload#>>'{subscription,status}','')),'');
  v_plan_name:=nullif(coalesce(p_payload#>>'{Subscription,plan,name}',p_payload#>>'{subscription,plan,name}',''),'');
  v_currency:=upper(nullif(coalesce(p_payload#>>'{Commissions,currency}',p_payload#>>'{Commissions,product_base_price_currency}',''),''));

  if coalesce(p_payload#>>'{Commissions,charge_amount}','')~'^[0-9]+$' then
    v_amount:=(p_payload#>>'{Commissions,charge_amount}')::bigint;
  elsif coalesce(p_payload#>>'{Commissions,product_base_price}','')~'^[0-9]+$' then
    v_amount:=(p_payload#>>'{Commissions,product_base_price}')::bigint;
  else
    v_amount:=null;
  end if;

  begin
    v_access_until:=nullif(coalesce(
      p_payload#>>'{Subscription,customer_access,access_until}',
      p_payload#>>'{subscription,customer_access,access_until}',
      p_payload#>>'{Subscription,next_payment}',
      p_payload#>>'{subscription,next_payment}',
      ''
    ),'')::timestamptz;
  exception when others then
    v_access_until:=null;
  end;

  begin
    v_started_at:=nullif(coalesce(
      p_payload#>>'{Subscription,start_date}',
      p_payload#>>'{subscription,start_date}',
      ''
    ),'')::timestamptz;
  exception when others then
    v_started_at:=null;
  end;

  if v_access_until is null and v_existing_access_until is not null and v_existing_access_until>now() then
    v_access_until:=v_existing_access_until;
  end if;
  v_effective_access_until:=v_access_until;

  v_access_text:=lower(coalesce(
    p_payload#>>'{Subscription,customer_access,has_access}',
    p_payload#>>'{subscription,customer_access,has_access}',
    ''
  ));

  if v_event in ('order_refunded','compra_reembolsada','chargeback')
     or v_order_status in ('refunded','chargedback') then
    v_has_access:=false;
  elsif v_access_text='false' then
    v_has_access:=false;
  elsif v_event='subscription_canceled' then
    v_has_access:=v_effective_access_until is not null and v_effective_access_until>now();
  elsif v_access_text='true'
     or v_event in ('order_approved','compra_aprovada','subscription_renewed')
     or v_order_status='paid' then
    v_has_access:=v_effective_access_until is not null and v_effective_access_until>now();
  elsif v_event='subscription_late' then
    v_has_access:=coalesce(v_existing_has_access,false)
      and v_effective_access_until is not null
      and v_effective_access_until>now();
  else
    v_has_access:=coalesce(v_existing_has_access,false)
      and v_effective_access_until is not null
      and v_effective_access_until>now();
  end if;

  insert into public.devinx_kiwify_subscriptions(
    email,full_name,product_id,order_id,subscription_id,event_type,subscription_status,
    has_access,access_until,plan_name,amount_minor,currency_code,started_at,canceled_at,last_event_at,updated_at
  ) values(
    v_email,v_name,v_product_id,v_order_id,v_subscription_id,v_event,v_subscription_status,
    v_has_access,v_access_until,v_plan_name,v_amount,v_currency,v_started_at,
    case when v_event in ('subscription_canceled','order_refunded','compra_reembolsada','chargeback') then now() else null end,
    now(),now()
  )
  on conflict(email) do update set
    full_name=coalesce(excluded.full_name,devinx_kiwify_subscriptions.full_name),
    product_id=excluded.product_id,
    order_id=coalesce(excluded.order_id,devinx_kiwify_subscriptions.order_id),
    subscription_id=coalesce(excluded.subscription_id,devinx_kiwify_subscriptions.subscription_id),
    event_type=excluded.event_type,
    subscription_status=coalesce(excluded.subscription_status,devinx_kiwify_subscriptions.subscription_status),
    has_access=excluded.has_access,
    access_until=coalesce(excluded.access_until,devinx_kiwify_subscriptions.access_until),
    plan_name=coalesce(excluded.plan_name,devinx_kiwify_subscriptions.plan_name),
    amount_minor=coalesce(excluded.amount_minor,devinx_kiwify_subscriptions.amount_minor),
    currency_code=coalesce(excluded.currency_code,devinx_kiwify_subscriptions.currency_code),
    started_at=coalesce(excluded.started_at,devinx_kiwify_subscriptions.started_at),
    canceled_at=case
      when excluded.canceled_at is not null then excluded.canceled_at
      when excluded.has_access then null
      else devinx_kiwify_subscriptions.canceled_at
    end,
    last_event_at=now(),
    updated_at=now();

  select id into v_user_id from auth.users where lower(email)=v_email limit 1;

  if v_user_id is not null then
    select source into v_existing_source
    from public.devinx_access_entitlements
    where user_id=v_user_id;

    if coalesce(v_existing_source,'')<>'manual' then
      insert into public.devinx_access_entitlements(
        user_id,status,source,expires_at,note,provider_subscription_id,plan_name,
        amount_minor,currency_code,started_at,canceled_at,updated_at
      ) values(
        v_user_id,case when v_has_access then 'active' else 'blocked' end,'kiwify',
        v_access_until,'Sincronizado automaticamente pela Kiwify',v_subscription_id,v_plan_name,
        v_amount,coalesce(v_currency,'BRL'),v_started_at,
        case when v_has_access then null else now() end,now()
      )
      on conflict(user_id) do update set
        status=excluded.status,
        source='kiwify',
        expires_at=excluded.expires_at,
        note=excluded.note,
        provider_subscription_id=coalesce(excluded.provider_subscription_id,devinx_access_entitlements.provider_subscription_id),
        plan_name=coalesce(excluded.plan_name,devinx_access_entitlements.plan_name),
        amount_minor=coalesce(excluded.amount_minor,devinx_access_entitlements.amount_minor),
        currency_code=coalesce(excluded.currency_code,devinx_access_entitlements.currency_code),
        started_at=coalesce(excluded.started_at,devinx_access_entitlements.started_at),
        canceled_at=excluded.canceled_at,
        updated_at=now();
    end if;
  end if;

  return jsonb_build_object('ok',true,'email',v_email,'event',v_event,'access',v_has_access);
end;
$$;

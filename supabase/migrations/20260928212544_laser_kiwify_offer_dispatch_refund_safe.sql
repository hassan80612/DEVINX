create or replace function public.process_kiwify_laser_pc_addon_webhook(p_payload jsonb,p_token_hash text)
returns jsonb language plpgsql security definer
set search_path to 'devinx_laser','public','auth'
as $function$
declare
  v_expected_hash text; v_expected_product text; v_extra_product text; v_intl_product text;
  v_product_id text; v_checkout_link text; v_existing_checkout text; v_email text;
  v_event text; v_order_status text; v_order_id text;
  v_approved boolean:=false; v_reversed boolean:=false;
begin
  select kiwify_laser_token_hash,kiwify_laser_extra_product_id,kiwify_laser_international_product_id
    into v_expected_hash,v_extra_product,v_intl_product
  from public.devinx_integration_settings where singleton=true;
  if v_expected_hash is null or p_token_hash is distinct from v_expected_hash then
    raise exception 'webhook unauthorized';
  end if;

  v_order_id:=nullif(coalesce(
    p_payload->>'order_id',p_payload->>'order_ref',
    p_payload#>>'{order,order_id}',p_payload#>>'{Order,order_id}',
    p_payload#>>'{order,id}',p_payload#>>'{Order,id}',''),'');
  if v_order_id is null then raise exception 'pc_addon_order_id_missing'; end if;

  v_checkout_link:=split_part(regexp_replace(trim(coalesce(
    p_payload->>'checkout_link',p_payload#>>'{Checkout,checkout_link}',
    p_payload#>>'{checkout,checkout_link}','')),'^.*/',''),'?',1);

  if v_checkout_link not in ('IdNEzcp','PR4BNpa') then
    select o.checkout_link into v_existing_checkout
    from devinx_laser.pc_addon_orders o where o.order_id=v_order_id;
    if v_existing_checkout in ('IdNEzcp','PR4BNpa') then v_checkout_link:=v_existing_checkout; end if;
  end if;

  if v_checkout_link='IdNEzcp' then v_expected_product:=v_extra_product;
  elsif v_checkout_link='PR4BNpa' then v_expected_product:=v_intl_product;
  else return jsonb_build_object('ok',true,'ignored','offer'); end if;

  v_product_id:=coalesce(
    p_payload#>>'{Product,product_id}',p_payload->>'product_id',
    p_payload#>>'{product,product_id}',p_payload#>>'{product,id}',p_payload#>>'{order,product_id}');
  if v_product_id is null or v_product_id is distinct from v_expected_product then
    return jsonb_build_object('ok',true,'ignored','product');
  end if;

  v_email:=lower(trim(coalesce(
    p_payload#>>'{Customer,email}',p_payload#>>'{customer,email}',p_payload->>'email','')));
  if v_email='' then
    select o.email into v_email from devinx_laser.pc_addon_orders o where o.order_id=v_order_id;
  end if;
  if coalesce(v_email,'')='' then raise exception 'customer email missing'; end if;

  v_event:=lower(coalesce(p_payload->>'webhook_event_type',p_payload->>'event_type',p_payload->>'event',''));
  v_order_status:=lower(coalesce(p_payload->>'order_status',p_payload#>>'{order,status}',p_payload#>>'{Order,status}',''));
  v_reversed:=v_event in ('order_refunded','compra_reembolsada','chargeback','order_chargeback')
    or v_order_status in ('refunded','chargedback','chargeback');
  v_approved:=not v_reversed and (
    v_event in ('order_approved','compra_aprovada','order_paid','purchase_approved')
    or v_order_status in ('paid','approved'));
  if not v_approved and not v_reversed then
    return jsonb_build_object('ok',true,'ignored','event','event',v_event);
  end if;

  return public.laser_internal_record_pc_addon(v_order_id,v_email,v_product_id,v_checkout_link,v_reversed);
end;$function$;

create or replace function public.process_kiwify_laser_offer_dispatch(p_payload jsonb,p_token_hash text)
returns jsonb language plpgsql security definer
set search_path to 'devinx_laser','public'
as $function$
declare
  v_main_product text; v_extra_product text; v_intl_product text;
  v_product_id text; v_checkout_link text; v_order_id text;
begin
  select kiwify_laser_product_id,kiwify_laser_extra_product_id,kiwify_laser_international_product_id
    into v_main_product,v_extra_product,v_intl_product
  from public.devinx_integration_settings where singleton=true;

  v_product_id:=coalesce(
    p_payload#>>'{Product,product_id}',p_payload->>'product_id',
    p_payload#>>'{product,product_id}',p_payload#>>'{product,id}',p_payload#>>'{order,product_id}');
  v_checkout_link:=split_part(regexp_replace(trim(coalesce(
    p_payload->>'checkout_link',p_payload#>>'{Checkout,checkout_link}',
    p_payload#>>'{checkout,checkout_link}','')),'^.*/',''),'?',1);
  v_order_id:=nullif(coalesce(
    p_payload->>'order_id',p_payload->>'order_ref',
    p_payload#>>'{order,order_id}',p_payload#>>'{Order,order_id}',
    p_payload#>>'{order,id}',p_payload#>>'{Order,id}',''),'');

  if v_checkout_link in ('IdNEzcp','PR4BNpa')
     or (v_order_id is not null and exists(
       select 1 from devinx_laser.pc_addon_orders o where o.order_id=v_order_id
     )) then
    return public.process_kiwify_laser_pc_addon_webhook(p_payload,p_token_hash);
  end if;

  if v_product_id=v_extra_product then
    return public.process_kiwify_laser_extra_webhook(p_payload,p_token_hash);
  elsif v_product_id=v_intl_product then
    return public.process_kiwify_laser_international_webhook(p_payload,p_token_hash);
  elsif v_product_id=v_main_product then
    return public.process_kiwify_laser_webhook(p_payload,p_token_hash);
  end if;
  return jsonb_build_object('ok',true,'ignored','product');
end;$function$;

revoke all on function public.process_kiwify_laser_offer_dispatch(jsonb,text) from public;
grant execute on function public.process_kiwify_laser_offer_dispatch(jsonb,text) to anon,authenticated,service_role;

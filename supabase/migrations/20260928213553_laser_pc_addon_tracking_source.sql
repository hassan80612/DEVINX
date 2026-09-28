
create or replace function public.process_kiwify_laser_pc_addon_webhook(p_payload jsonb,p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'devinx_laser','public','auth'
as $function$
declare
  v_expected_hash text;
  v_extra_product text;
  v_intl_product text;
  v_product_id text;
  v_offer_code text;
  v_tracking_src text;
  v_email text;
  v_event text;
  v_order_status text;
  v_order_id text;
  v_approved boolean:=false;
  v_reversed boolean:=false;
begin
  select kiwify_laser_token_hash,kiwify_laser_extra_product_id,kiwify_laser_international_product_id
    into v_expected_hash,v_extra_product,v_intl_product
  from public.devinx_integration_settings
  where singleton=true;

  if v_expected_hash is null or p_token_hash is distinct from v_expected_hash then
    raise exception 'webhook unauthorized';
  end if;

  v_tracking_src:=lower(trim(coalesce(
    p_payload#>>'{TrackingParameters,src}',
    p_payload#>>'{trackingParameters,src}',
    p_payload#>>'{tracking_parameters,src}',
    ''
  )));
  if v_tracking_src<>'devinx_extra_pc' then
    return jsonb_build_object('ok',true,'ignored','offer');
  end if;

  v_product_id:=coalesce(
    p_payload#>>'{Product,product_id}',p_payload->>'product_id',
    p_payload#>>'{product,product_id}',p_payload#>>'{product,id}',p_payload#>>'{order,product_id}'
  );

  if v_product_id=v_extra_product then
    v_offer_code:='IdNEzcp';
  elsif v_product_id=v_intl_product then
    v_offer_code:='PR4BNpa';
  else
    return jsonb_build_object('ok',true,'ignored','product');
  end if;

  v_email:=lower(trim(coalesce(
    p_payload#>>'{Customer,email}',p_payload#>>'{customer,email}',p_payload->>'email',''
  )));
  if v_email='' then raise exception 'customer email missing'; end if;

  v_event:=lower(coalesce(p_payload->>'webhook_event_type',p_payload->>'event_type',p_payload->>'event',''));
  v_order_status:=lower(coalesce(p_payload->>'order_status',p_payload#>>'{order,status}',p_payload#>>'{Order,status}',''));
  v_order_id:=nullif(coalesce(
    p_payload->>'order_id',p_payload->>'order_ref',
    p_payload#>>'{order,order_id}',p_payload#>>'{Order,order_id}',
    p_payload#>>'{order,id}',p_payload#>>'{Order,id}',''
  ),'');
  if v_order_id is null then raise exception 'pc_addon_order_id_missing'; end if;

  v_reversed:=v_event in ('order_refunded','compra_reembolsada','chargeback','order_chargeback')
    or v_order_status in ('refunded','chargedback','chargeback');
  v_approved:=not v_reversed and (
    v_event in ('order_approved','compra_aprovada','order_paid','purchase_approved')
    or v_order_status in ('paid','approved')
  );

  if not v_approved and not v_reversed then
    return jsonb_build_object('ok',true,'ignored','event','event',v_event);
  end if;

  return public.laser_internal_record_pc_addon(
    v_order_id,v_email,v_product_id,v_offer_code,v_reversed
  );
end;
$function$;

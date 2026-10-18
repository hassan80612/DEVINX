-- Restore original enqueue allowlist exactly.
-- Prepared only; not executed. Stops if the live function has changed.
begin;
do $sentinel_diagnostic_guard$
begin
  if pg_get_functiondef('public.sentinel_enqueue_command(text,uuid,text,jsonb)'::regprocedure) is distinct from $sentinel_expected_definition$CREATE OR REPLACE FUNCTION public.sentinel_enqueue_command(p_session_token text, p_device_id uuid, p_command_type text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a sentinel_app.accounts%rowtype;
  d sentinel_app.devices%rowtype;
  v_hash text;
  v_id uuid;
  v_is_master boolean:=false;
  v_cross_account boolean:=false;
begin
  v_hash:=encode(extensions.digest(coalesce(p_session_token,''),'sha256'),'hex');

  select x.* into a
  from sentinel_app.sessions s
  join sentinel_app.accounts x on x.id=s.account_id
  where s.token_hash=v_hash
    and s.expires_at>now()
    and x.status='active'
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'error','unauthorized');
  end if;

  select exists(
    select 1
    from sentinel_app.master_owner mo
    where mo.singleton=true
      and mo.account_id=a.id
      and a.role='master'
  ) into v_is_master;

  if not sentinel_app.agent_access_active(a.id) and not v_is_master then
    return jsonb_build_object('ok',false,'error','agent_access_required');
  end if;

  if p_command_type<>all(array[
    'control/start','control/pause','control/stop','control/kill',
    'control/reset-kill','control/freeze','control/unfreeze','control/clear-error',
    'mode','settings','diagnostics/market',
    'brokers/iq_option/manual-order','brokers/exnova/manual-order',
    'brokers/iq_option/scan-controls','brokers/exnova/scan-controls',
    'brokers/iq_option/login','brokers/iq_option/session-check','brokers/iq_option/connect',
    'brokers/iq_option/validate-market','brokers/iq_option/disconnect',
    'brokers/exnova/login','brokers/exnova/session-check','brokers/exnova/connect',
    'brokers/exnova/validate-market','brokers/exnova/disconnect'
  ]) then
    return jsonb_build_object('ok',false,'error','comando_nao_permitido');
  end if;

  if p_command_type in (
    'control/reset-kill','control/freeze','control/unfreeze','control/clear-error'
  ) and not v_is_master then
    return jsonb_build_object('ok',false,'error','master_required');
  end if;

  if p_device_id is null then
    select * into d
    from sentinel_app.devices
    where account_id=a.id and status='active'
    order by coalesce(last_seen_at,created_at) desc,created_at asc
    limit 1;
  elsif v_is_master then
    select * into d
    from sentinel_app.devices
    where id=p_device_id and status='active'
    limit 1;
    v_cross_account:=found and d.account_id is distinct from a.id;
  else
    select * into d
    from sentinel_app.devices
    where id=p_device_id
      and account_id=a.id
      and status='active'
    limit 1;
  end if;

  if not found or d.account_id is null then
    return jsonb_build_object('ok',false,'error','pc_nao_vinculado');
  end if;

  if not sentinel_app.agent_access_active(d.account_id) then
    return jsonb_build_object('ok',false,'error','agent_access_inactive');
  end if;

  if v_cross_account and p_command_type not in (
    'control/start','control/pause','control/stop','control/kill',
    'control/reset-kill','control/freeze','control/unfreeze','control/clear-error'
  ) then
    return jsonb_build_object('ok',false,'error','master_cross_account_command_not_allowed');
  end if;

  if d.last_seen_at is null or d.last_seen_at<now()-interval '15 seconds' then
    return jsonb_build_object('ok',false,'error','pc_offline');
  end if;

  if p_command_type in ('brokers/iq_option/login','brokers/exnova/login')
    and coalesce(p_payload->>'userInitiated','false')<>'true' then
    return jsonb_build_object('ok',false,'error','abertura_exige_acao_manual');
  end if;


  if p_command_type in ('brokers/iq_option/manual-order','brokers/exnova/manual-order') then
    if p_device_id is null or v_cross_account or d.account_id<>a.id then
      return jsonb_build_object('ok',false,'error','manual_owner_device_required');
    end if;
    if p_payload->>'confirmed' is distinct from 'true'
      or coalesce(p_payload->>'requestId','') !~* '^[a-f0-9-]{36}$'
      or coalesce(p_payload->>'side','') not in ('CALL','PUT')
      or p_payload->>'deviceId' is distinct from d.id::text
      or p_payload->'context'->>'provider' is distinct from split_part(p_command_type,'/',2)
      or coalesce(p_payload->'context'->>'mode','') not in ('demo','real')
      or p_payload->'context'->>'accountId' is null
      or p_payload->'context'->>'activeId' is null
      or coalesce(p_payload->'context'->>'asset','')=''
      or p_payload->'context'->>'expirationMode' is distinct from 'manual-confirmed'
      or p_payload->'context'->>'manualBrokerExpiryConfirmed' is distinct from 'true'
      or coalesce(p_payload->'context'->>'expirationSeconds','') not in ('30','60','120','300','600','900')
    then return jsonb_build_object('ok',false,'error','manual_confirmation_required');end if;
    begin
      if coalesce(jsonb_typeof(p_payload->'amount'),'null')<>'number'
        or (p_payload->>'amount')::numeric<=0 or (p_payload->>'amount')::numeric>1000000
        or (p_payload->>'amount')::numeric<>round((p_payload->>'amount')::numeric,2)
      then return jsonb_build_object('ok',false,'error','manual_amount_invalid');end if;
      if (p_payload->>'issuedAt')::numeric>extract(epoch from now())*1000+1000
        or (p_payload->>'issuedAt')::numeric<extract(epoch from now())*1000-10000
        or (p_payload->>'expiresAt')::numeric<=extract(epoch from now())*1000
        or (p_payload->>'expiresAt')::numeric>(p_payload->>'issuedAt')::numeric+10000
        or (p_payload->>'expiresAt')::numeric is null or (p_payload->>'issuedAt')::numeric is null
      then return jsonb_build_object('ok',false,'error','manual_command_expired');end if;
    exception when others then
      return jsonb_build_object('ok',false,'error','manual_payload_invalid');
    end;
    perform pg_advisory_xact_lock(hashtextextended(d.id::text||':'||(p_payload->>'requestId'),0));
    select id into v_id from sentinel_app.commands
      where device_id=d.id and command_type in ('brokers/iq_option/manual-order','brokers/exnova/manual-order')
        and payload->>'requestId'=p_payload->>'requestId' limit 1;
    if found then
      if not exists(select 1 from sentinel_app.commands where id=v_id and command_type=p_command_type and payload=p_payload) then
        return jsonb_build_object('ok',false,'error','manual_request_conflict');
      end if;
      return jsonb_build_object('ok',true,'commandId',v_id,'deviceId',d.id,'duplicate',true);
    end if;
  end if;

  insert into sentinel_app.commands(
    account_id,device_id,command_type,payload,status,expires_at
  )
  values(
    d.account_id,d.id,p_command_type,coalesce(p_payload,'{}'::jsonb),
    'queued',case when p_command_type in ('brokers/iq_option/manual-order','brokers/exnova/manual-order') then least(now()+interval '10 seconds',to_timestamp((p_payload->>'expiresAt')::numeric/1000)) else now()+interval '25 seconds' end
  )
  returning id into v_id;

  return jsonb_build_object('ok',true,'commandId',v_id,'deviceId',d.id);
end
$function$
$sentinel_expected_definition$ then
    raise exception 'sentinel_enqueue_command changed; re-review before applying diagnostic patch';
  end if;
end;
$sentinel_diagnostic_guard$;

CREATE OR REPLACE FUNCTION public.sentinel_enqueue_command(p_session_token text, p_device_id uuid, p_command_type text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a sentinel_app.accounts%rowtype;
  d sentinel_app.devices%rowtype;
  v_hash text;
  v_id uuid;
  v_is_master boolean:=false;
  v_cross_account boolean:=false;
begin
  v_hash:=encode(extensions.digest(coalesce(p_session_token,''),'sha256'),'hex');

  select x.* into a
  from sentinel_app.sessions s
  join sentinel_app.accounts x on x.id=s.account_id
  where s.token_hash=v_hash
    and s.expires_at>now()
    and x.status='active'
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'error','unauthorized');
  end if;

  select exists(
    select 1
    from sentinel_app.master_owner mo
    where mo.singleton=true
      and mo.account_id=a.id
      and a.role='master'
  ) into v_is_master;

  if not sentinel_app.agent_access_active(a.id) and not v_is_master then
    return jsonb_build_object('ok',false,'error','agent_access_required');
  end if;

  if p_command_type<>all(array[
    'control/start','control/pause','control/stop','control/kill',
    'control/reset-kill','control/freeze','control/unfreeze','control/clear-error',
    'mode','settings',
    'brokers/iq_option/manual-order','brokers/exnova/manual-order',
    'brokers/iq_option/scan-controls','brokers/exnova/scan-controls',
    'brokers/iq_option/login','brokers/iq_option/session-check','brokers/iq_option/connect',
    'brokers/iq_option/validate-market','brokers/iq_option/disconnect',
    'brokers/exnova/login','brokers/exnova/session-check','brokers/exnova/connect',
    'brokers/exnova/validate-market','brokers/exnova/disconnect'
  ]) then
    return jsonb_build_object('ok',false,'error','comando_nao_permitido');
  end if;

  if p_command_type in (
    'control/reset-kill','control/freeze','control/unfreeze','control/clear-error'
  ) and not v_is_master then
    return jsonb_build_object('ok',false,'error','master_required');
  end if;

  if p_device_id is null then
    select * into d
    from sentinel_app.devices
    where account_id=a.id and status='active'
    order by coalesce(last_seen_at,created_at) desc,created_at asc
    limit 1;
  elsif v_is_master then
    select * into d
    from sentinel_app.devices
    where id=p_device_id and status='active'
    limit 1;
    v_cross_account:=found and d.account_id is distinct from a.id;
  else
    select * into d
    from sentinel_app.devices
    where id=p_device_id
      and account_id=a.id
      and status='active'
    limit 1;
  end if;

  if not found or d.account_id is null then
    return jsonb_build_object('ok',false,'error','pc_nao_vinculado');
  end if;

  if not sentinel_app.agent_access_active(d.account_id) then
    return jsonb_build_object('ok',false,'error','agent_access_inactive');
  end if;

  if v_cross_account and p_command_type not in (
    'control/start','control/pause','control/stop','control/kill',
    'control/reset-kill','control/freeze','control/unfreeze','control/clear-error'
  ) then
    return jsonb_build_object('ok',false,'error','master_cross_account_command_not_allowed');
  end if;

  if d.last_seen_at is null or d.last_seen_at<now()-interval '15 seconds' then
    return jsonb_build_object('ok',false,'error','pc_offline');
  end if;

  if p_command_type in ('brokers/iq_option/login','brokers/exnova/login')
    and coalesce(p_payload->>'userInitiated','false')<>'true' then
    return jsonb_build_object('ok',false,'error','abertura_exige_acao_manual');
  end if;


  if p_command_type in ('brokers/iq_option/manual-order','brokers/exnova/manual-order') then
    if p_device_id is null or v_cross_account or d.account_id<>a.id then
      return jsonb_build_object('ok',false,'error','manual_owner_device_required');
    end if;
    if p_payload->>'confirmed' is distinct from 'true'
      or coalesce(p_payload->>'requestId','') !~* '^[a-f0-9-]{36}$'
      or coalesce(p_payload->>'side','') not in ('CALL','PUT')
      or p_payload->>'deviceId' is distinct from d.id::text
      or p_payload->'context'->>'provider' is distinct from split_part(p_command_type,'/',2)
      or coalesce(p_payload->'context'->>'mode','') not in ('demo','real')
      or p_payload->'context'->>'accountId' is null
      or p_payload->'context'->>'activeId' is null
      or coalesce(p_payload->'context'->>'asset','')=''
      or p_payload->'context'->>'expirationMode' is distinct from 'manual-confirmed'
      or p_payload->'context'->>'manualBrokerExpiryConfirmed' is distinct from 'true'
      or coalesce(p_payload->'context'->>'expirationSeconds','') not in ('30','60','120','300','600','900')
    then return jsonb_build_object('ok',false,'error','manual_confirmation_required');end if;
    begin
      if coalesce(jsonb_typeof(p_payload->'amount'),'null')<>'number'
        or (p_payload->>'amount')::numeric<=0 or (p_payload->>'amount')::numeric>1000000
        or (p_payload->>'amount')::numeric<>round((p_payload->>'amount')::numeric,2)
      then return jsonb_build_object('ok',false,'error','manual_amount_invalid');end if;
      if (p_payload->>'issuedAt')::numeric>extract(epoch from now())*1000+1000
        or (p_payload->>'issuedAt')::numeric<extract(epoch from now())*1000-10000
        or (p_payload->>'expiresAt')::numeric<=extract(epoch from now())*1000
        or (p_payload->>'expiresAt')::numeric>(p_payload->>'issuedAt')::numeric+10000
        or (p_payload->>'expiresAt')::numeric is null or (p_payload->>'issuedAt')::numeric is null
      then return jsonb_build_object('ok',false,'error','manual_command_expired');end if;
    exception when others then
      return jsonb_build_object('ok',false,'error','manual_payload_invalid');
    end;
    perform pg_advisory_xact_lock(hashtextextended(d.id::text||':'||(p_payload->>'requestId'),0));
    select id into v_id from sentinel_app.commands
      where device_id=d.id and command_type in ('brokers/iq_option/manual-order','brokers/exnova/manual-order')
        and payload->>'requestId'=p_payload->>'requestId' limit 1;
    if found then
      if not exists(select 1 from sentinel_app.commands where id=v_id and command_type=p_command_type and payload=p_payload) then
        return jsonb_build_object('ok',false,'error','manual_request_conflict');
      end if;
      return jsonb_build_object('ok',true,'commandId',v_id,'deviceId',d.id,'duplicate',true);
    end if;
  end if;

  insert into sentinel_app.commands(
    account_id,device_id,command_type,payload,status,expires_at
  )
  values(
    d.account_id,d.id,p_command_type,coalesce(p_payload,'{}'::jsonb),
    'queued',case when p_command_type in ('brokers/iq_option/manual-order','brokers/exnova/manual-order') then least(now()+interval '10 seconds',to_timestamp((p_payload->>'expiresAt')::numeric/1000)) else now()+interval '25 seconds' end
  )
  returning id into v_id;

  return jsonb_build_object('ok',true,'commandId',v_id,'deviceId',d.id);
end
$function$


-- Inspect the exact stored definition before committing.
select position('''diagnostics/market''' in pg_get_functiondef('public.sentinel_enqueue_command(text,uuid,text,jsonb)'::regprocedure))>0 as market_diagnostic_allowed;
commit;

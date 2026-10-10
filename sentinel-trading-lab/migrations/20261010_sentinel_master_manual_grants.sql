-- Keep the existing Master console and ALL previously supported actions.
-- Master-only manual grants remain valid without a Kiwify purchase, and
-- revoke-by-email still terminates access immediately.
CREATE OR REPLACE FUNCTION public.sentinel_master_action(p_session_token text, p_action text, p_account_id uuid DEFAULT NULL::uuid, p_device_id uuid DEFAULT NULL::uuid, p_value jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_master sentinel_app.accounts%rowtype;
  v_target sentinel_app.accounts%rowtype;
  v_device sentinel_app.devices%rowtype;
  v_hash text;
  v_is_master boolean:=false;
  v_command_id uuid;
  v_status text;
  v_plan text;
  v_max integer;
  v_command text;
  v_enabled boolean;
  v_expires timestamptz;
  v_email text;
  v_days integer;
begin
  v_hash:=encode(extensions.digest(coalesce(p_session_token,''),'sha256'),'hex');

  select a.* into v_master
  from sentinel_app.sessions s
  join sentinel_app.accounts a on a.id=s.account_id
  where s.token_hash=v_hash
    and s.expires_at>now()
    and a.status='active'
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'error','forbidden');
  end if;

  select exists(
    select 1
    from sentinel_app.master_owner mo
    where mo.singleton=true
      and mo.account_id=v_master.id
      and v_master.role='master'
  ) into v_is_master;

  if not v_is_master then
    return jsonb_build_object('ok',false,'error','forbidden');
  end if;

  if p_account_id is not null then
    select * into v_target
    from sentinel_app.accounts
    where id=p_account_id
    limit 1;

    if not found then
      return jsonb_build_object('ok',false,'error','account_not_found');
    end if;
  end if;

  if p_device_id is not null then
    select * into v_device
    from sentinel_app.devices
    where id=p_device_id
    limit 1;

    if not found then
      return jsonb_build_object('ok',false,'error','device_not_found');
    end if;

    if p_account_id is not null and v_device.account_id is distinct from p_account_id then
      return jsonb_build_object('ok',false,'error','device_account_mismatch');
    end if;
  end if;

  if p_action='set_status' then
    if p_account_id is null then
      return jsonb_build_object('ok',false,'error','account_required');
    end if;
    if v_target.id=v_master.id or v_target.role='master' then
      return jsonb_build_object('ok',false,'error','master_owner_protected');
    end if;

    v_status:=coalesce(p_value->>'status','');
    if v_status not in ('active','suspended','blocked') then
      return jsonb_build_object('ok',false,'error','invalid_status');
    end if;

    update sentinel_app.accounts
    set status=v_status,updated_at=now()
    where id=p_account_id;

    if v_status<>'active' then
      delete from sentinel_app.sessions where account_id=p_account_id;
    end if;

  elsif p_action='set_plan' then
    if p_account_id is null then
      return jsonb_build_object('ok',false,'error','account_required');
    end if;
    if v_target.id=v_master.id or v_target.role='master' then
      return jsonb_build_object('ok',false,'error','master_owner_protected');
    end if;

    v_plan:=left(trim(coalesce(p_value->>'plan','')),64);
    if v_plan='' then
      return jsonb_build_object('ok',false,'error','invalid_plan');
    end if;

    update sentinel_app.accounts
    set plan=v_plan,updated_at=now()
    where id=p_account_id;

  elsif p_action='set_max_devices' then
    if p_account_id is null then
      return jsonb_build_object('ok',false,'error','account_required');
    end if;
    if v_target.id=v_master.id or v_target.role='master' then
      return jsonb_build_object('ok',false,'error','master_owner_protected');
    end if;

    begin
      v_max:=(p_value->>'maxDevices')::integer;
    exception when others then
      v_max:=null;
    end;

    if v_max is null or v_max<1 or v_max>50 then
      return jsonb_build_object('ok',false,'error','invalid_max_devices');
    end if;

    update sentinel_app.accounts
    set max_devices=v_max,updated_at=now()
    where id=p_account_id;

  elsif p_action='set_agent_access' then
    if p_account_id is null then
      return jsonb_build_object('ok',false,'error','account_required');
    end if;
    if v_target.id=v_master.id or v_target.role='master' then
      return jsonb_build_object('ok',false,'error','master_owner_protected');
    end if;

    v_enabled:=coalesce((p_value->>'enabled')::boolean,false);

    begin
      v_expires:=case
        when nullif(trim(coalesce(p_value->>'expiresAt','')),'') is null then null
        else (p_value->>'expiresAt')::timestamptz
      end;
    exception when others then
      return jsonb_build_object('ok',false,'error','invalid_access_expiry');
    end;

    update sentinel_app.accounts
    set agent_enabled=v_enabled,
        plan=case when v_enabled then 'manual' else plan end,
        access_expires_at=case when v_enabled then v_expires else now() end,
        updated_at=now()
    where id=p_account_id;

  elsif p_action='grant_agent_by_email' then
    v_email:=lower(trim(coalesce(p_value->>'email','')));
    if v_email='' then
      return jsonb_build_object('ok',false,'error','email_required');
    end if;

    select * into v_target
    from sentinel_app.accounts
    where lower(email)=v_email
    limit 1;

    if not found then
      return jsonb_build_object('ok',false,'error','account_not_found');
    end if;

    if v_target.id=v_master.id or v_target.role='master' then
      return jsonb_build_object('ok',false,'error','master_owner_protected');
    end if;

    begin
      v_days:=nullif(p_value->>'days','')::integer;
    exception when others then
      v_days:=null;
    end;

    if v_days is not null and (v_days<1 or v_days>3650) then
      return jsonb_build_object('ok',false,'error','invalid_days');
    end if;

    v_expires:=case when v_days is null then null else now()+make_interval(days=>v_days) end;

    update sentinel_app.accounts
    set status='active',
        agent_enabled=true,
        access_expires_at=v_expires,
        plan='manual',
        updated_at=now()
    where id=v_target.id;

    p_account_id:=v_target.id;

  elsif p_action='revoke_agent_by_email' then
    v_email:=lower(trim(coalesce(p_value->>'email','')));
    if v_email='' then
      return jsonb_build_object('ok',false,'error','email_required');
    end if;

    select * into v_target
    from sentinel_app.accounts
    where lower(email)=v_email
    limit 1;

    if not found then
      return jsonb_build_object('ok',false,'error','account_not_found');
    end if;

    if v_target.id=v_master.id or v_target.role='master' then
      return jsonb_build_object('ok',false,'error','master_owner_protected');
    end if;

    update sentinel_app.accounts
    set agent_enabled=false,
        access_expires_at=now(),
        updated_at=now()
    where id=v_target.id;

    p_account_id:=v_target.id;

  elsif p_action='revoke_sessions' then
    if p_account_id is null then
      return jsonb_build_object('ok',false,'error','account_required');
    end if;

    if p_account_id=v_master.id then
      delete from sentinel_app.sessions
      where account_id=p_account_id and token_hash<>v_hash;
    else
      delete from sentinel_app.sessions where account_id=p_account_id;
    end if;

  elsif p_action='revoke_sessions_by_email' then
    v_email:=lower(trim(coalesce(p_value->>'email','')));
    select * into v_target
    from sentinel_app.accounts
    where lower(email)=v_email
    limit 1;

    if not found then
      return jsonb_build_object('ok',false,'error','account_not_found');
    end if;

    if v_target.id=v_master.id then
      delete from sentinel_app.sessions
      where account_id=v_target.id and token_hash<>v_hash;
    else
      delete from sentinel_app.sessions where account_id=v_target.id;
    end if;

    p_account_id:=v_target.id;

  elsif p_action='revoke_device' then
    if p_device_id is null then
      return jsonb_build_object('ok',false,'error','device_required');
    end if;

    update sentinel_app.devices
    set status='revoked',
        pairing_code_hash=null,
        pairing_expires_at=null,
        updated_at=now()
    where id=p_device_id;

    update sentinel_app.commands
    set status='canceled'
    where device_id=p_device_id and status in ('queued','delivered');

  elsif p_action='restore_device' then
    if p_device_id is null then
      return jsonb_build_object('ok',false,'error','device_required');
    end if;

    update sentinel_app.devices
    set status=case when account_id is null then 'pending' else 'active' end,
        updated_at=now()
    where id=p_device_id;

  elsif p_action='device_command' then
    if p_device_id is null then
      return jsonb_build_object('ok',false,'error','device_required');
    end if;

    v_command:=coalesce(p_value->>'command','');

    if v_command not in (
      'control/start','control/pause','control/stop','control/kill',
      'control/freeze','control/unfreeze','control/reset-kill','control/clear-error'
    ) then
      return jsonb_build_object('ok',false,'error','command_not_allowed');
    end if;

    if v_device.account_id is null then
      return jsonb_build_object('ok',false,'error','pc_nao_vinculado');
    end if;

    if v_device.status<>'active' then
      return jsonb_build_object('ok',false,'error','device_not_active');
    end if;

    if not sentinel_app.agent_access_active(v_device.account_id) then
      return jsonb_build_object('ok',false,'error','agent_access_inactive');
    end if;

    if v_device.last_seen_at is null or v_device.last_seen_at<now()-interval '15 seconds' then
      return jsonb_build_object('ok',false,'error','pc_offline');
    end if;

    insert into sentinel_app.commands(
      account_id,device_id,command_type,payload,status,expires_at
    )
    values(
      v_device.account_id,v_device.id,v_command,
      jsonb_build_object('actor','master'),
      'queued',now()+interval '25 seconds'
    )
    returning id into v_command_id;

  else
    return jsonb_build_object('ok',false,'error','unknown_action');
  end if;

  insert into sentinel_app.master_audit(
    actor_account_id,target_account_id,target_device_id,action,payload
  )
  values(
    v_master.id,p_account_id,p_device_id,p_action,coalesce(p_value,'{}'::jsonb)
  );

  return jsonb_build_object(
    'ok',true,
    'commandId',v_command_id,
    'accountId',p_account_id
  );
end
$function$


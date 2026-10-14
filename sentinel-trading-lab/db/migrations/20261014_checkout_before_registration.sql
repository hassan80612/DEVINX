-- Kiwify-first onboarding: link approved payment by SAME registered email.
CREATE OR REPLACE FUNCTION public.sentinel_auth_register(p_email text, p_password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_id uuid;
  v_is_owner boolean:=lower(trim(coalesce(p_email,'')))='hassan80612@gmail.com';
  v_role text:=case when v_is_owner then 'master' else 'user' end;
  v_max integer:=case when v_is_owner then 10 else 1 end;
  v_plan text:=case when v_is_owner then 'development' else 'free' end;
  v_token text;
begin
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(v_email)>254 then
    return jsonb_build_object('ok',false,'error','email_invalido');
  end if;
  if length(coalesce(p_password,''))<8 or length(p_password)>128 then
    return jsonb_build_object('ok',false,'error','senha_minimo_8');
  end if;
  if exists(select 1 from sentinel_app.accounts where lower(email)=v_email) then
    return jsonb_build_object('ok',false,'error','conta_ja_existe');
  end if;

  insert into sentinel_app.accounts(email,password_hash,role,plan,max_devices,agent_enabled,access_expires_at)
  values(
    v_email,
    extensions.crypt(p_password,extensions.gen_salt('bf',12)),
    v_role,v_plan,v_max,v_is_owner,null
  )
  returning id into v_id;

  -- A valid payment can arrive before the buyer finishes account creation.
  -- Reconcile only already verified, product-allowlisted Kiwify receipts.
  PERFORM sentinel_app.refresh_kiwify_prepaid_access(v_email);
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into sentinel_app.sessions(token_hash,account_id,expires_at)
  values(encode(extensions.digest(v_token,'sha256'),'hex'),v_id,now()+interval '30 days');

  return jsonb_build_object(
    'ok',true,'token',v_token,
    'account',jsonb_build_object(
      'id',v_id,'email',v_email,'role',v_role,'plan',v_plan,'maxDevices',v_max,
      'agentEnabled',(select agent_enabled from sentinel_app.accounts where id=v_id),
      'accessExpiresAt',(select access_expires_at from sentinel_app.accounts where id=v_id),
      'accessActive',v_is_owner or (select agent_enabled and access_expires_at>now() from sentinel_app.accounts where id=v_id)
    )
  );
end
$function$
;

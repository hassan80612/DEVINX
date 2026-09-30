create table if not exists public.devinx_product_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null check (product in ('financeiro','laser')),
  source text not null default 'activity',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id,product)
);

create index if not exists devinx_product_memberships_product_idx
  on public.devinx_product_memberships(product,user_id);

alter table public.devinx_product_memberships enable row level security;
revoke all on table public.devinx_product_memberships from public,anon,authenticated;

create or replace function public.register_devinx_product(p_product text)
returns void
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_product text:=lower(trim(coalesce(p_product,'')));
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_product not in ('financeiro','laser') then raise exception 'invalid product'; end if;

  insert into public.devinx_product_memberships(user_id,product,source,created_at,updated_at)
  values(v_uid,v_product,'authenticated_flow',now(),now())
  on conflict(user_id,product) do update set updated_at=now();
end;
$function$;

revoke all on function public.register_devinx_product(text) from public,anon;
grant execute on function public.register_devinx_product(text) to authenticated,service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_product text:=lower(trim(coalesce(new.raw_user_meta_data->>'devinx_product','')));
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;

  if v_product in ('financeiro','laser') then
    insert into public.devinx_product_memberships(user_id,product,source,created_at,updated_at)
    values(new.id,v_product,'signup',now(),now())
    on conflict(user_id,product) do update set updated_at=now();
  end if;

  return new;
end;
$function$;

insert into public.devinx_product_memberships(user_id,product,source)
select distinct u.id,'financeiro','inferred_existing'
from auth.users u
left join public.profiles p on p.id=u.id
where
  p.onboarded_at is not null
  or exists(select 1 from public.devinx_trial_claims t where t.user_id=u.id)
  or exists(select 1 from public.devinx_access_entitlements e where e.user_id=u.id)
  or exists(select 1 from public.devinx_email_access_grants g where g.email=lower(u.email))
  or exists(select 1 from public.devinx_kiwify_subscriptions k where k.email=lower(u.email))
  or exists(select 1 from public.devinx_kiwify_pass_access k where k.email=lower(u.email))
  or exists(select 1 from public.devinx_admin_users a where a.user_id=u.id)
on conflict(user_id,product) do nothing;

insert into public.devinx_product_memberships(user_id,product,source)
select distinct u.id,'laser','inferred_existing'
from auth.users u
where
  exists(select 1 from devinx_laser.entitlements e where e.user_id=u.id)
  or exists(select 1 from devinx_laser.devices d where d.owner_user_id=u.id)
  or exists(select 1 from devinx_laser.mentor_sessions m where m.mentor_user_id=u.id)
  or exists(select 1 from devinx_laser.email_access_grants g where g.email=lower(u.email))
  or exists(select 1 from devinx_laser.kiwify_subscriptions k where k.email=lower(u.email))
  or exists(select 1 from devinx_laser.kiwify_pass_access k where k.email=lower(u.email))
  or exists(select 1 from public.devinx_admin_users a where a.user_id=u.id)
on conflict(user_id,product) do nothing;

create or replace function public.admin_list_devinx_product_memberships()
returns table(user_id uuid,email text,financeiro boolean,laser boolean)
language sql
security definer
set search_path to 'public','auth'
as $function$
select
  u.id,
  lower(u.email)::text,
  coalesce(bool_or(m.product='financeiro'),false),
  coalesce(bool_or(m.product='laser'),false)
from auth.users u
left join public.devinx_product_memberships m on m.user_id=u.id
where public.is_devinx_admin()
group by u.id,u.email
having count(m.product)>0
order by lower(u.email);
$function$;

revoke all on function public.admin_list_devinx_product_memberships() from public,anon;
grant execute on function public.admin_list_devinx_product_memberships() to authenticated,service_role;

create or replace function public.admin_list_devinx_customers()
returns table(
  email text,user_id uuid,account_exists boolean,created_at timestamptz,last_sign_in_at timestamptz,
  onboarded_at timestamptz,access_status text,access_source text,expires_at timestamptz,is_admin boolean,
  manual_grant boolean,kiwify_customer boolean,kiwify_status text,plan_name text,amount_minor bigint,
  currency_code text,last_event_at timestamptz
)
language sql
security definer
set search_path to 'public','auth'
as $function$
with emails as (
  select lower(u.email) email
  from auth.users u
  where u.email is not null
    and (
      exists(select 1 from public.devinx_product_memberships pm where pm.user_id=u.id and pm.product='financeiro')
      or exists(select 1 from public.devinx_admin_users a where a.user_id=u.id)
    )
  union select email from public.devinx_email_access_grants
  union select email from public.devinx_kiwify_subscriptions
  union select email from public.devinx_kiwify_pass_access
),
base as (
  select
    e.email,u.id as user_id,(u.id is not null) as account_exists,u.created_at,u.last_sign_in_at,p.onboarded_at,
    ent.status as ent_status,ent.source as ent_source,ent.expires_at as ent_expires,
    g.status as grant_status,g.expires_at as grant_expires,(g.email is not null) as manual_grant,
    (k.email is not null or pa.email is not null) as kiwify_customer,
    k.subscription_status as recurring_status,k.has_access as kiwify_has_access,k.access_until as kiwify_access_until,
    pa.has_access as pass_has_access,pa.access_until as pass_access_until,
    k.plan_name as recurring_plan_name,k.amount_minor as recurring_amount_minor,
    k.currency_code as recurring_currency_code,k.last_event_at as recurring_last_event_at,
    pa.plan_name as pass_plan_name,pa.amount_minor as pass_amount_minor,
    pa.currency_code as pass_currency_code,pa.last_event_at as pass_last_event_at,
    tr.id as trial_id,tr.expires_at as trial_expires,
    exists(select 1 from public.devinx_admin_users a where a.user_id=u.id) as is_admin
  from emails e
  left join auth.users u on lower(u.email)=e.email
  left join public.profiles p on p.id=u.id
  left join public.devinx_access_entitlements ent on ent.user_id=u.id
  left join public.devinx_email_access_grants g on g.email=e.email
  left join public.devinx_kiwify_subscriptions k on k.email=e.email
  left join public.devinx_kiwify_pass_access pa on pa.email=e.email
  left join public.devinx_trial_claims tr on tr.user_id=u.id
)
select
  b.email,b.user_id,b.account_exists,b.created_at,b.last_sign_in_at,b.onboarded_at,
  case
    when b.ent_source='manual' then b.ent_status
    when b.manual_grant then b.grant_status
    when b.ent_status='active' and b.ent_expires is not null and b.ent_expires>now() then 'active'
    when b.kiwify_has_access and b.kiwify_access_until is not null and b.kiwify_access_until>now() then 'active'
    when b.pass_has_access and b.pass_access_until is not null and b.pass_access_until>now() then 'active'
    when b.trial_id is not null and b.trial_expires>now() then 'active'
    when b.trial_id is not null then 'blocked'
    when b.ent_status is not null then 'blocked'
    when b.kiwify_customer then 'blocked'
    else 'none'
  end::text,
  case
    when b.ent_source='manual' then 'manual'
    when b.manual_grant then 'manual'
    when b.ent_status='active' and b.ent_expires is not null and b.ent_expires>now() then coalesce(b.ent_source,'account')
    when b.kiwify_has_access and b.kiwify_access_until is not null and b.kiwify_access_until>now() then 'kiwify'
    when b.pass_has_access and b.pass_access_until is not null and b.pass_access_until>now() then 'kiwify_pass'
    when b.trial_id is not null then 'trial'
    when b.ent_status is not null then coalesce(b.ent_source,'account')
    when b.recurring_status is not null then 'kiwify'
    when b.kiwify_customer then 'kiwify_pass'
    else 'none'
  end::text,
  case
    when b.ent_source='manual' then b.ent_expires
    when b.manual_grant then b.grant_expires
    when b.ent_status='active' and b.ent_expires is not null and b.ent_expires>now() then b.ent_expires
    when b.kiwify_has_access and b.kiwify_access_until is not null and b.kiwify_access_until>now() then b.kiwify_access_until
    when b.pass_has_access and b.pass_access_until is not null and b.pass_access_until>now() then b.pass_access_until
    when b.trial_id is not null then b.trial_expires
    when b.ent_status is not null then b.ent_expires
    when b.kiwify_access_until is not null then b.kiwify_access_until
    else b.pass_access_until
  end,
  b.is_admin,b.manual_grant,b.kiwify_customer,
  case
    when b.kiwify_has_access and b.kiwify_access_until is not null and b.kiwify_access_until>now() then b.recurring_status
    when b.pass_has_access and b.pass_access_until is not null and b.pass_access_until>now() then 'prepaid'
    else coalesce(b.recurring_status,case when b.pass_plan_name is not null then 'prepaid' end)
  end::text,
  case
    when b.kiwify_has_access and b.kiwify_access_until is not null and b.kiwify_access_until>now() then b.recurring_plan_name
    when b.pass_has_access and b.pass_access_until is not null and b.pass_access_until>now() then b.pass_plan_name
    else coalesce(b.recurring_plan_name,b.pass_plan_name)
  end::text,
  case
    when b.kiwify_has_access and b.kiwify_access_until is not null and b.kiwify_access_until>now() then b.recurring_amount_minor
    when b.pass_has_access and b.pass_access_until is not null and b.pass_access_until>now() then b.pass_amount_minor
    else coalesce(b.recurring_amount_minor,b.pass_amount_minor)
  end::bigint,
  case
    when b.kiwify_has_access and b.kiwify_access_until is not null and b.kiwify_access_until>now() then b.recurring_currency_code
    when b.pass_has_access and b.pass_access_until is not null and b.pass_access_until>now() then b.pass_currency_code
    else coalesce(b.recurring_currency_code,b.pass_currency_code)
  end::text,
  greatest(coalesce(b.recurring_last_event_at,'epoch'::timestamptz),coalesce(b.pass_last_event_at,'epoch'::timestamptz))
from base b
where public.is_devinx_admin()
order by greatest(
  coalesce(b.recurring_last_event_at,'epoch'::timestamptz),
  coalesce(b.pass_last_event_at,'epoch'::timestamptz),
  coalesce(b.last_sign_in_at,'epoch'::timestamptz),
  coalesce(b.created_at,'epoch'::timestamptz)
) desc,b.email;
$function$;

create or replace function public.admin_delete_devinx_user(p_user_id uuid,p_confirm_email text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare target_email text;
begin
  if not exists(select 1 from public.devinx_admin_users a where a.user_id=auth.uid()) then raise exception 'forbidden'; end if;
  if exists(select 1 from public.devinx_admin_users a where a.user_id=p_user_id) then raise exception 'admin account cannot be deleted'; end if;
  select email::text into target_email from auth.users where id=p_user_id;
  if target_email is null then raise exception 'user not found'; end if;
  if lower(trim(coalesce(p_confirm_email,''))) <> lower(target_email) then raise exception 'email confirmation mismatch'; end if;
  if exists(select 1 from public.devinx_product_memberships pm where pm.user_id=p_user_id and pm.product='laser') then
    raise exception 'shared account has laser membership';
  end if;
  delete from auth.users where id=p_user_id;
end;
$function$;

revoke all on function public.admin_delete_devinx_user(uuid,text) from public,anon;
grant execute on function public.admin_delete_devinx_user(uuid,text) to authenticated,service_role;

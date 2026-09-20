-- Daily goal source metadata and atomic creation for automatic/manual daily targets.
alter table public.goals
  add column if not exists goal_source text not null default 'manual',
  add column if not exists target_date date;

alter table public.goals
  drop constraint if exists goals_goal_source_check;
alter table public.goals
  add constraint goals_goal_source_check
  check (goal_source in ('manual','daily_reserve_auto','daily_reserve_manual'));

update public.goals
set goal_source='daily_reserve_auto',
    target_date=coalesce(
      target_date,
      case
        when name ~ '^__devinx_daily_reserve__:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          then split_part(name,':',2)::date
        else null
      end
    )
where name like '__devinx_daily_reserve__:%';

create or replace function public.replace_active_goal_v2(
  p_name text,
  p_period text,
  p_basis text,
  p_target_minor bigint,
  p_source text default 'manual',
  p_target_date date default null
)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  new_id uuid;
  resolved_name text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_target_minor is null or p_target_minor<=0 then raise exception 'invalid target'; end if;
  if p_period not in ('daily','weekly','monthly') then raise exception 'invalid period'; end if;
  if p_basis not in ('gross','operational_net','savings','payoff') then raise exception 'invalid basis'; end if;
  if p_source not in ('manual','daily_reserve_auto','daily_reserve_manual') then raise exception 'invalid source'; end if;

  resolved_name:=coalesce(
    nullif(trim(p_name),''),
    case p_source
      when 'daily_reserve_auto' then '__devinx_daily_reserve__'
      when 'daily_reserve_manual' then '__devinx_daily_manual__'
      else '__devinx_default_goal__'
    end
  );

  update public.goals set is_active=false where user_id=uid and is_active=true;

  insert into public.goals(
    user_id,name,period,basis,target_minor,is_active,goal_source,target_date
  )
  values(
    uid,resolved_name,p_period,p_basis,p_target_minor,true,p_source,p_target_date
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.replace_active_goal_v2(text,text,text,bigint,text,date) from public,anon;
grant execute on function public.replace_active_goal_v2(text,text,text,bigint,text,date) to authenticated;

create or replace function public.get_dashboard_snapshot()
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public','auth'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode='28000';
  end if;

  if not public.has_devinx_access() then
    raise exception 'access denied' using errcode='42501';
  end if;

  return jsonb_build_object(
    'profile', coalesce((
      select to_jsonb(x)
      from (
        select daily_goal_target_date,dashboard_chart_period
        from public.profiles
        where id=v_uid
      ) x
    ), '{}'::jsonb),
    'goal', (
      select to_jsonb(x)
      from (
        select id,name,target_minor,basis,period,goal_source,target_date
        from public.goals
        where user_id=v_uid and is_active=true
        order by created_at desc
        limit 1
      ) x
    ),
    'bills', coalesce((
      select jsonb_agg(to_jsonb(x))
      from (
        select id,amount_minor,due_day,start_month,installment_count,created_at
        from public.recurring_bills
        where user_id=v_uid and is_active=true
      ) x
    ), '[]'::jsonb),
    'bill_payments', coalesce((
      select jsonb_agg(to_jsonb(x))
      from (
        select recurring_bill_id,amount_minor,due_month,paid_on
        from public.recurring_bill_payments
        where user_id=v_uid
      ) x
    ), '[]'::jsonb),
    'bill_overrides', coalesce((
      select jsonb_agg(to_jsonb(x))
      from (
        select recurring_bill_id,due_month,amount_minor,due_day
        from public.recurring_bill_month_overrides
        where user_id=v_uid
      ) x
    ), '[]'::jsonb),
    'card_installments', coalesce((
      select jsonb_agg(to_jsonb(x))
      from (
        select id,amount_minor,billing_month,due_date,paid_at
        from public.card_installments
        where user_id=v_uid
      ) x
    ), '[]'::jsonb),
    'card_payments', coalesce((
      select jsonb_agg(to_jsonb(x))
      from (
        select amount_minor,paid_on
        from public.card_bill_payments
        where user_id=v_uid
      ) x
    ), '[]'::jsonb),
    'debt_payments', coalesce((
      select jsonb_agg(to_jsonb(x))
      from (
        select debt_id,amount_minor,paid_on
        from public.debt_payments
        where user_id=v_uid
      ) x
    ), '[]'::jsonb),
    'reserve_entries', coalesce((
      select jsonb_agg(to_jsonb(x))
      from (
        select kind,amount_minor,occurred_on,future_plan_id
        from public.reserve_entries
        where user_id=v_uid
      ) x
    ), '[]'::jsonb),
    'future_plans', coalesce((
      select jsonb_agg(to_jsonb(x))
      from (
        select id,kind,name,amount_minor,category_id,due_date,recurrence,reserve_enabled,is_active
        from public.future_plans
        where user_id=v_uid
      ) x
    ), '[]'::jsonb),
    'future_settlements', coalesce((
      select jsonb_agg(to_jsonb(x))
      from (
        select plan_id,due_date,amount_minor,settled_on
        from public.future_plan_settlements
        where user_id=v_uid
      ) x
    ), '[]'::jsonb),
    'transactions', coalesce((
      select jsonb_agg(to_jsonb(x))
      from (
        select type,amount_minor,source_type,source_id,occurred_on,created_at
        from public.transactions
        where user_id=v_uid
      ) x
    ), '[]'::jsonb),
    'work_sessions', coalesce((
      select jsonb_agg(to_jsonb(x))
      from (
        select gross_income_minor,energy_cost_minor,extra_work_cost_minor,worked_on,created_at
        from public.work_sessions
        where user_id=v_uid
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_dashboard_snapshot() from public;
revoke all on function public.get_dashboard_snapshot() from anon;
grant execute on function public.get_dashboard_snapshot() to authenticated;

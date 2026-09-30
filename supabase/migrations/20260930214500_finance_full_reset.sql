-- Finance-only destructive reset.
-- Intentionally preserves auth, access/subscriptions, trial state, product memberships,
-- Store data, Laser Control data, profile preferences, and admin/integration settings.

create or replace function public.reset_my_finance(p_confirm text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_confirm is distinct from 'RESET' then
    raise exception 'confirmation required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  -- Children/history first so every finance module is reset atomically.
  delete from public.future_plan_settlements where user_id=uid;
  delete from public.recurring_bill_payments where user_id=uid;
  delete from public.recurring_bill_month_overrides where user_id=uid;
  delete from public.card_bill_payments where user_id=uid;
  delete from public.card_installments where user_id=uid;
  delete from public.card_purchases where user_id=uid;
  delete from public.debt_payments where user_id=uid;
  delete from public.work_sessions where user_id=uid;
  delete from public.reserve_entries where user_id=uid;
  delete from public.reserve_purchase_goals where user_id=uid;
  delete from public.transactions where user_id=uid;

  -- Finance setup and commitments.
  delete from public.goals where user_id=uid;
  delete from public.recurring_bills where user_id=uid;
  delete from public.credit_cards where user_id=uid;
  delete from public.debts where user_id=uid;
  delete from public.future_plans where user_id=uid;
  delete from public.income_sources where user_id=uid;
  delete from public.vehicles where user_id=uid;
  delete from public.finance_categories where user_id=uid;

  -- Keep locale/currency/timezone/theme/onboarding/access; clear only finance goal horizon.
  update public.profiles
  set daily_goal_target_date=null,
      updated_at=now()
  where id=uid;

  return true;
end;
$$;

revoke all on function public.reset_my_finance(text) from public,anon;
grant execute on function public.reset_my_finance(text) to authenticated;

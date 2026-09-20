-- Require an active DevinX entitlement in addition to row ownership.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'transactions','work_sessions','goals','finance_categories',
    'recurring_bills','recurring_bill_payments','recurring_bill_month_overrides',
    'credit_cards','card_purchases','card_installments','card_bill_payments',
    'reserve_entries','reserve_purchase_goals','debts','debt_payments',
    'vehicles','income_sources'
  ]
  loop
    execute format('drop policy if exists devinx_subscription_gate on public.%I',v_table);
    execute format('drop policy if exists devinx_access_restrictive on public.%I',v_table);
    execute format(
      'create policy devinx_access_restrictive on public.%I as restrictive for all to authenticated using ((select public.has_devinx_access())) with check ((select public.has_devinx_access()))',
      v_table
    );
  end loop;
end
$$;

create or replace function public.archive_credit_card(p_card_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.has_devinx_access() then raise exception 'access blocked'; end if;

  if exists(
    select 1
    from public.card_installments i
    join public.card_purchases p on p.id=i.purchase_id
    where p.card_id=p_card_id and i.user_id=uid and i.paid_at is null
  ) then
    raise exception 'card has open installments';
  end if;

  update public.credit_cards
  set is_active=false
  where id=p_card_id and user_id=uid and is_active=true;

  if not found then raise exception 'card not found'; end if;
end;
$$;

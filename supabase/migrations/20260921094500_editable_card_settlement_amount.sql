-- Allow card statement settlement with the actual amount paid while preserving
-- the original installment values that compose the statement.
create or replace function public.settle_card_bill_amount(
  p_card_id uuid,
  p_statement_month date,
  p_amount_minor bigint,
  p_paid_on date default current_date
)
returns bigint
language plpgsql
security invoker
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  expected_total bigint;
  month_start date:=date_trunc('month',p_statement_month)::date;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_amount_minor is null or p_amount_minor<=0 then raise exception 'invalid amount'; end if;
  if not exists(select 1 from public.credit_cards c where c.id=p_card_id and c.user_id=uid) then
    raise exception 'invalid card';
  end if;

  select coalesce(sum(i.amount_minor),0)
    into expected_total
  from public.card_installments i
  join public.card_purchases p on p.id=i.purchase_id
  where i.user_id=uid
    and p.card_id=p_card_id
    and i.billing_month=month_start
    and i.paid_at is null;

  if expected_total<=0 then raise exception 'no open statement'; end if;

  insert into public.card_bill_payments(user_id,card_id,statement_month,amount_minor,paid_on)
  values(uid,p_card_id,month_start,p_amount_minor,coalesce(p_paid_on,current_date))
  on conflict(card_id,statement_month)
  do update set amount_minor=excluded.amount_minor,paid_on=excluded.paid_on;

  update public.card_installments i
  set paid_at=now()
  from public.card_purchases p
  where i.purchase_id=p.id
    and i.user_id=uid
    and p.card_id=p_card_id
    and i.billing_month=month_start
    and i.paid_at is null;

  return p_amount_minor;
end;
$$;

revoke all on function public.settle_card_bill_amount(uuid,date,bigint,date) from public,anon;
grant execute on function public.settle_card_bill_amount(uuid,date,bigint,date) to authenticated;

create or replace function public.update_card_bill_payment(
  p_payment_id uuid,
  p_amount_minor bigint,
  p_paid_on date default current_date
)
returns void
language plpgsql
security invoker
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_amount_minor is null or p_amount_minor<=0 then raise exception 'invalid amount'; end if;

  update public.card_bill_payments
  set amount_minor=p_amount_minor,
      paid_on=coalesce(p_paid_on,current_date)
  where id=p_payment_id and user_id=uid;

  if not found then raise exception 'card payment not found'; end if;
end;
$$;

revoke all on function public.update_card_bill_payment(uuid,bigint,date) from public,anon;
grant execute on function public.update_card_bill_payment(uuid,bigint,date) to authenticated;

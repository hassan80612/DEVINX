update public.recurring_bills b
set is_active=false
where b.is_active=true
  and b.installment_count is null
  and not exists (
    select 1 from public.recurring_bill_payments p
    where p.recurring_bill_id=b.id
  )
  and not exists (
    select 1 from public.recurring_bill_month_overrides o
    where o.recurring_bill_id=b.id
  )
  and exists (
    select 1
    from public.recurring_bills x
    where x.user_id=b.user_id
      and x.id<>b.id
      and x.is_active=true
      and x.installment_count is not null
      and lower(trim(x.name))=lower(trim(b.name))
      and x.amount_minor=b.amount_minor
      and x.due_day=b.due_day
      and x.start_month=b.start_month
  );
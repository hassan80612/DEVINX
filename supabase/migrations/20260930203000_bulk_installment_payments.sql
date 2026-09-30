-- Atomic bulk settlement for recurring installments and card installments.
-- Supports arbitrary selection order, partial payments, and settlement discounts.

create or replace function public.register_recurring_bill_batch(
  p_items jsonb,
  p_paid_on date default current_date
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  item jsonb;
  b public.recurring_bills%rowtype;
  v_bill_id uuid;
  v_due_month date;
  v_amount bigint;
  v_settle boolean;
  v_expected bigint;
  v_paid bigint;
  v_remaining bigint;
  v_override_amount bigint;
  v_override_due_day integer;
  v_key text;
  v_seen text[] := array[]::text[];
  v_count integer := 0;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items required';
  end if;
  if jsonb_array_length(p_items) > 500 then raise exception 'too many items'; end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_bill_id := (item->>'bill_id')::uuid;
      v_due_month := date_trunc('month',(item->>'due_month')::date)::date;
      v_amount := (item->>'amount_minor')::bigint;
      v_settle := coalesce((item->>'settle')::boolean,true);
    exception when others then
      raise exception 'invalid item';
    end;

    if v_amount is null or v_amount <= 0 then raise exception 'invalid amount'; end if;
    v_key := v_bill_id::text || '|' || v_due_month::text;
    if v_key = any(v_seen) then raise exception 'duplicate installment'; end if;
    v_seen := array_append(v_seen,v_key);

    select * into b
    from public.recurring_bills
    where id=v_bill_id and user_id=uid and is_active=true
    for update;
    if not found then raise exception 'bill not found'; end if;

    if v_due_month < b.start_month
       or (b.installment_count is not null
           and v_due_month >= (b.start_month + make_interval(months=>b.installment_count))::date) then
      raise exception 'installment outside schedule';
    end if;

    v_override_amount := null;
    v_override_due_day := null;
    select o.amount_minor,o.due_day
      into v_override_amount,v_override_due_day
    from public.recurring_bill_month_overrides o
    where o.user_id=uid and o.recurring_bill_id=v_bill_id and o.due_month=v_due_month
    limit 1;

    v_expected := coalesce(v_override_amount,b.amount_minor);
    select coalesce(sum(p.amount_minor),0)::bigint into v_paid
    from public.recurring_bill_payments p
    where p.user_id=uid and p.recurring_bill_id=v_bill_id and p.due_month=v_due_month;

    v_remaining := greatest(0,v_expected-v_paid);
    if v_remaining <= 0 then raise exception 'installment already settled'; end if;
    if v_amount > v_remaining then raise exception 'payment exceeds installment balance'; end if;

    insert into public.recurring_bill_payments(
      user_id,recurring_bill_id,due_month,amount_minor,paid_on,paid_at
    )
    values(
      uid,v_bill_id,v_due_month,v_amount,coalesce(p_paid_on,current_date),
      (coalesce(p_paid_on,current_date)::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo'
    );

    if v_settle and v_amount < v_remaining then
      insert into public.recurring_bill_month_overrides(
        user_id,recurring_bill_id,due_month,amount_minor,due_day
      )
      values(uid,v_bill_id,v_due_month,v_paid+v_amount,coalesce(v_override_due_day,b.due_day))
      on conflict(recurring_bill_id,due_month)
      do update set
        amount_minor=excluded.amount_minor,
        due_day=coalesce(public.recurring_bill_month_overrides.due_day,excluded.due_day),
        updated_at=now();
    end if;

    v_count := v_count+1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.register_recurring_bill_batch(jsonb,date) from public,anon;
grant execute on function public.register_recurring_bill_batch(jsonb,date) to authenticated;

create or replace function public.register_card_installment_batch(
  p_items jsonb,
  p_paid_on date default current_date
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  item jsonb;
  inst public.card_installments%rowtype;
  purchase public.card_purchases%rowtype;
  v_installment_id uuid;
  v_amount bigint;
  v_settle boolean;
  v_paid bigint;
  v_remaining bigint;
  v_key text;
  v_seen text[] := array[]::text[];
  v_count integer := 0;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items required';
  end if;
  if jsonb_array_length(p_items) > 500 then raise exception 'too many items'; end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_installment_id := (item->>'installment_id')::uuid;
      v_amount := (item->>'amount_minor')::bigint;
      v_settle := coalesce((item->>'settle')::boolean,true);
    exception when others then
      raise exception 'invalid item';
    end;

    if v_amount is null or v_amount <= 0 then raise exception 'invalid amount'; end if;
    v_key := v_installment_id::text;
    if v_key = any(v_seen) then raise exception 'duplicate installment'; end if;
    v_seen := array_append(v_seen,v_key);

    select * into inst
    from public.card_installments
    where id=v_installment_id and user_id=uid
    for update;
    if not found then raise exception 'installment not found'; end if;
    if inst.paid_at is not null then raise exception 'installment already settled'; end if;

    select * into purchase
    from public.card_purchases
    where id=inst.purchase_id and user_id=uid;
    if not found then raise exception 'purchase not found'; end if;

    select coalesce(sum(t.amount_minor),0)::bigint into v_paid
    from public.transactions t
    where t.user_id=uid
      and t.source_type='card_installment_payment'
      and t.source_id=inst.id;

    v_remaining := greatest(0,inst.amount_minor-v_paid);
    if v_remaining <= 0 then raise exception 'installment already settled'; end if;
    if v_amount > v_remaining then raise exception 'payment exceeds installment balance'; end if;

    insert into public.transactions(
      user_id,type,category_id,description,amount_minor,occurred_on,payment_method,
      is_avoidable,is_recurring,source_type,source_id
    )
    values(
      uid,'expense',purchase.category_id,coalesce(purchase.description,'Cartão'),v_amount,
      coalesce(p_paid_on,current_date),null,purchase.is_avoidable,false,
      'card_installment_payment',inst.id
    );

    if v_settle or v_paid+v_amount >= inst.amount_minor then
      update public.card_installments
      set paid_at=((coalesce(p_paid_on,current_date)::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo')
      where id=inst.id and user_id=uid;
    end if;

    v_count := v_count+1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.register_card_installment_batch(jsonb,date) from public,anon;
grant execute on function public.register_card_installment_batch(jsonb,date) to authenticated;

create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  debt_id uuid not null references public.debts(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  paid_on date not null default current_date,
  payment_method text,
  created_at timestamptz not null default now()
);

alter table public.debt_payments enable row level security;

create policy debt_payments_select_own on public.debt_payments for select using (auth.uid() = user_id);
create policy debt_payments_insert_own on public.debt_payments for insert with check (auth.uid() = user_id);
create policy debt_payments_update_own on public.debt_payments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy debt_payments_delete_own on public.debt_payments for delete using (auth.uid() = user_id);

create index if not exists debt_payments_user_date_idx on public.debt_payments(user_id, paid_on desc);
create index if not exists debt_payments_debt_idx on public.debt_payments(debt_id);

create or replace function public.register_debt_payment(
  p_debt_id uuid,
  p_amount_minor bigint,
  p_paid_on date default current_date,
  p_payment_method text default 'pix'
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  d public.debts%rowtype;
  next_outstanding bigint;
  installment_decrement integer := 0;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_amount_minor is null or p_amount_minor <= 0 then raise exception 'invalid amount'; end if;

  select * into d from public.debts where id = p_debt_id and user_id = uid and is_active = true for update;
  if not found then raise exception 'debt not found'; end if;
  if p_amount_minor > d.outstanding_minor then raise exception 'payment exceeds outstanding balance'; end if;

  next_outstanding := d.outstanding_minor - p_amount_minor;
  if d.installment_minor is not null and d.installment_minor > 0 and p_amount_minor >= d.installment_minor then
    installment_decrement := greatest(1, floor(p_amount_minor::numeric / d.installment_minor::numeric)::integer);
  end if;

  insert into public.debt_payments(user_id, debt_id, amount_minor, paid_on, payment_method)
  values(uid, p_debt_id, p_amount_minor, coalesce(p_paid_on,current_date), nullif(p_payment_method,''));

  insert into public.transactions(user_id, type, category_id, description, amount_minor, occurred_on, payment_method, is_avoidable, is_recurring)
  values(uid, 'expense', 'debt_payment', 'Pagamento: ' || d.name, p_amount_minor, coalesce(p_paid_on,current_date), nullif(p_payment_method,''), false, false);

  update public.debts
  set outstanding_minor = next_outstanding,
      installments_remaining = case when installments_remaining is null then null else greatest(0, installments_remaining - installment_decrement) end,
      is_active = next_outstanding > 0
  where id = p_debt_id and user_id = uid;
end;
$$;

revoke all on function public.register_debt_payment(uuid,bigint,date,text) from public, anon;
grant execute on function public.register_debt_payment(uuid,bigint,date,text) to authenticated;

alter function public.complete_initial_setup(jsonb,jsonb) security invoker;

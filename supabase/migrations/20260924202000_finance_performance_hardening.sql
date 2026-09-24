-- Performance-only hardening. No finance values or access semantics are changed.

create index if not exists debt_payments_source_transaction_id_idx
  on public.debt_payments(source_transaction_id);
create index if not exists future_plan_settlements_reserve_entry_id_idx
  on public.future_plan_settlements(reserve_entry_id);
create index if not exists future_plan_settlements_transaction_id_idx
  on public.future_plan_settlements(transaction_id);
create index if not exists reserve_entries_future_plan_id_idx
  on public.reserve_entries(future_plan_id);

alter policy "debt_payments_select_own"
  on public.debt_payments
  using ((select auth.uid()) = user_id);

alter policy "debt_payments_insert_own"
  on public.debt_payments
  with check ((select auth.uid()) = user_id);

alter policy "debt_payments_update_own"
  on public.debt_payments
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "debt_payments_delete_own"
  on public.debt_payments
  using ((select auth.uid()) = user_id);

drop index if exists public.debt_payments_user_date_idx;

-- Harden internal Laser Control tables and RPC grants without changing runtime flows.

alter table devinx_laser.kiwify_pass_access enable row level security;
alter table devinx_laser.kiwify_pass_orders enable row level security;
alter table devinx_laser.kiwify_subscriptions enable row level security;
alter table devinx_laser.mentor_credit_orders enable row level security;
alter table devinx_laser.mentor_usage_ledger enable row level security;
alter table devinx_laser.webrtc_signals enable row level security;

revoke all on table devinx_laser.kiwify_pass_access from anon,authenticated;
revoke all on table devinx_laser.kiwify_pass_orders from anon,authenticated;
revoke all on table devinx_laser.kiwify_subscriptions from anon,authenticated;
revoke all on table devinx_laser.mentor_credit_orders from anon,authenticated;
revoke all on table devinx_laser.mentor_usage_ledger from anon,authenticated;
revoke all on table devinx_laser.webrtc_signals from anon,authenticated;

revoke execute on function public.recompute_laser_kiwify_pass_access(text) from public,anon,authenticated;

revoke execute on function public.process_kiwify_laser_webhook(jsonb,text) from authenticated;
revoke execute on function public.process_kiwify_laser_international_webhook(jsonb,text) from authenticated;
revoke execute on function public.process_kiwify_laser_extra_webhook(jsonb,text) from authenticated;
revoke execute on function public.process_kiwify_laser_offer_dispatch(jsonb,text) from authenticated;
revoke execute on function public.process_kiwify_laser_pc_addon_webhook(jsonb,text) from authenticated;

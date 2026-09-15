alter table public.work_sessions add column if not exists extra_work_cost_minor bigint not null default 0 check(extra_work_cost_minor>=0);

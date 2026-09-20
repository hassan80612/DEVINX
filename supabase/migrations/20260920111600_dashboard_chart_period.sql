alter table public.profiles
  add column if not exists dashboard_chart_period text not null default '1m';

update public.profiles
set dashboard_chart_period='1m'
where dashboard_chart_period not in ('3d','7d','1m','3m','6m','12m');

alter table public.profiles
  drop constraint if exists profiles_dashboard_chart_period_check;

alter table public.profiles
  add constraint profiles_dashboard_chart_period_check
  check (dashboard_chart_period in ('3d','7d','1m','3m','6m','12m'));

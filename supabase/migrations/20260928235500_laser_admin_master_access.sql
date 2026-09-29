-- Laser Control master: independent manual access by email.
-- Applied to production on 2026-09-28. This file records the production schema change.

create table if not exists devinx_laser.email_access_grants(
  email text primary key,
  status text not null default 'active' check(status in ('active','blocked')),
  plan_id text not null default 'control' check(plan_id in ('control','mentor')),
  max_pcs integer not null default 1 check(max_pcs between 1 and 25),
  expires_at timestamptz,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table devinx_laser.email_access_grants enable row level security;
revoke all on table devinx_laser.email_access_grants from public,anon,authenticated;
grant all on table devinx_laser.email_access_grants to service_role;

-- The production definitions for the functions below are intentionally kept
-- behind authenticated admin RPCs. Every admin entry point checks is_devinx_admin().
-- See the live database migration history:
--   laser_admin_master_access
--   laser_admin_manual_mentor_credit_reset

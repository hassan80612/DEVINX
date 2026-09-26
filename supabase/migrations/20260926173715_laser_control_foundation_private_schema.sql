-- DevinX Laser Control private foundation.
-- Applied to the DevinX Supabase project as migration 20260926173715.
-- All Laser Control data is isolated in a non-exposed schema.

create schema if not exists devinx_laser;

revoke all on schema devinx_laser from public;
revoke all on schema devinx_laser from anon;
revoke all on schema devinx_laser from authenticated;

create table if not exists devinx_laser.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null,
  status text not null default 'active' check (status in ('active','blocked','expired')),
  source text not null default 'manual' check (source in ('manual','trial','checkout','master')),
  max_pcs integer not null check (max_pcs between 1 and 100),
  max_machines integer not null check (max_machines between 1 and 500),
  max_mobile_devices integer not null check (max_mobile_devices between 1 and 500),
  max_active_operators integer not null check (max_active_operators between 1 and 100),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at)
);

create table if not exists devinx_laser.devices (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  platform text not null default 'windows' check (platform in ('windows')),
  adapter text not null default 'lightburn-udp-legacy'
    check (adapter in ('lightburn-udp-legacy','lightburn-rest')),
  fingerprint_hash text not null check (fingerprint_hash ~ '^[0-9a-f]{64}$'),
  public_key_fingerprint text,
  status text not null default 'pending' check (status in ('pending','active','revoked')),
  agent_version text,
  capabilities jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  paired_at timestamptz,
  remote_control_enabled boolean not null default false,
  local_arm_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id,fingerprint_hash)
);

create table if not exists devinx_laser.pairing_tickets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  ticket_hash text not null unique check (ticket_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  device_id uuid references devinx_laser.devices(id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table if not exists devinx_laser.mobile_devices (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  display_name text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(owner_user_id,device_hash)
);

create table if not exists devinx_laser.control_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references devinx_laser.devices(id) on delete cascade,
  mobile_device_id uuid references devinx_laser.mobile_devices(id) on delete set null,
  status text not null default 'active' check (status in ('active','released','expired','revoked')),
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > acquired_at)
);

create unique index if not exists devinx_laser_one_active_session_per_device
  on devinx_laser.control_sessions(device_id)
  where status='active';

create table if not exists devinx_laser.commands (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references devinx_laser.devices(id) on delete cascade,
  session_id uuid references devinx_laser.control_sessions(id) on delete set null,
  command_type text not null
    check (command_type in ('status','frame','pause','resume','stop','start')),
  payload jsonb not null default '{}'::jsonb,
  idempotency_key uuid not null default gen_random_uuid(),
  status text not null default 'queued'
    check (status in ('queued','delivered','acknowledged','rejected','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  rejection_reason text,
  unique(device_id,idempotency_key),
  check (expires_at > created_at)
);

create table if not exists devinx_laser.command_events (
  id bigint generated always as identity primary key,
  command_id uuid not null references devinx_laser.commands(id) on delete cascade,
  device_id uuid not null references devinx_laser.devices(id) on delete cascade,
  event_type text not null check (event_type in ('created','delivered','accepted','rejected','completed','expired')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists devinx_laser_devices_owner_idx on devinx_laser.devices(owner_user_id);
create index if not exists devinx_laser_devices_last_seen_idx on devinx_laser.devices(last_seen_at desc);
create index if not exists devinx_laser_pairing_expiry_idx on devinx_laser.pairing_tickets(expires_at);
create index if not exists devinx_laser_commands_device_status_idx on devinx_laser.commands(device_id,status,created_at desc);
create index if not exists devinx_laser_events_command_idx on devinx_laser.command_events(command_id,created_at);

alter table devinx_laser.entitlements enable row level security;
alter table devinx_laser.devices enable row level security;
alter table devinx_laser.pairing_tickets enable row level security;
alter table devinx_laser.mobile_devices enable row level security;
alter table devinx_laser.control_sessions enable row level security;
alter table devinx_laser.commands enable row level security;
alter table devinx_laser.command_events enable row level security;

revoke all on all tables in schema devinx_laser from public;
revoke all on all tables in schema devinx_laser from anon;
revoke all on all tables in schema devinx_laser from authenticated;
revoke all on all sequences in schema devinx_laser from public;
revoke all on all sequences in schema devinx_laser from anon;
revoke all on all sequences in schema devinx_laser from authenticated;

comment on schema devinx_laser is
  'Private DevinX Laser Control data. No direct Data API exposure; use audited, explicitly granted RPCs only.';

comment on column devinx_laser.devices.local_arm_until is
  'Physical/local authorization window required before a future remote START command can be accepted.';

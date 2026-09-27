-- Source record for live migration: laser_control_mentor_sessions_and_entitlement_gate
-- Applied to Supabase project jubiwhtnhxluetzkzomm on 2026-09-27.

alter table devinx_laser.devices
  add column if not exists connection_mode text not null default 'owned',
  add column if not exists access_expires_at timestamptz;

alter table devinx_laser.entitlements
  add column if not exists owner_access boolean not null default true,
  add column if not exists mentor_access boolean not null default false,
  add column if not exists mentor_billing_mode text not null default 'disabled',
  add column if not exists mentor_max_concurrent integer not null default 1;

create table if not exists devinx_laser.mentor_pairing_offers(
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null,
  display_name text not null,
  public_key_pem text not null,
  public_key_fingerprint text not null,
  pairing_code_hash text not null unique,
  nonce_hash text not null unique,
  source_ip_hash text not null,
  agent_version text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  claimed_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists devinx_laser.mentor_sessions(
  id uuid primary key default gen_random_uuid(),
  mentor_user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references devinx_laser.devices(id) on delete cascade,
  status text not null default 'active',
  billing_mode text not null,
  billing_state text not null,
  opened_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  end_reason text,
  created_at timestamptz not null default now()
);

alter table devinx_laser.mentor_pairing_offers enable row level security;
alter table devinx_laser.mentor_sessions enable row level security;

-- Full live implementation also defines:
-- public.get_laser_access_status()
-- public.laser_internal_user_can_control_device()
-- public.laser_internal_store_mentor_offer()
-- public.laser_internal_claim_mentor()
-- public.laser_internal_mentor_status()
-- public.laser_internal_close_mentor_session()
-- public.laser_internal_list_devices()
-- and entitlement-aware replacements for remote-session / command / device-auth RPCs.
-- Keep this file as the repository marker for the live migration; function source
-- is versioned alongside the Edge Functions and in subsequent schema snapshots.

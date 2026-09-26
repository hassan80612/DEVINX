-- Applied to DevinX Supabase as migration 20260926174153.
-- Refines the empty pairing foundation so the Agent can offer a code before a user account is known.

drop table if exists devinx_laser.pairing_tickets;

alter table devinx_laser.devices
  drop constraint if exists devices_owner_user_id_fingerprint_hash_key;

drop index if exists devinx_laser.devinx_laser_devices_public_key_fingerprint_uidx;

alter table devinx_laser.devices
  drop column if exists fingerprint_hash,
  add column if not exists public_key_pem text,
  add column if not exists credential_hash text,
  add column if not exists credential_issued_at timestamptz,
  add column if not exists credential_revoked_at timestamptz;

alter table devinx_laser.devices
  alter column public_key_fingerprint set not null;

create unique index if not exists devinx_laser_devices_public_key_fingerprint_uidx
  on devinx_laser.devices(public_key_fingerprint);

create table if not exists devinx_laser.pairing_offers (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null,
  public_key_pem text not null,
  public_key_fingerprint text not null check (public_key_fingerprint ~ '^[0-9a-f]{64}$'),
  pairing_code_hash text not null unique check (pairing_code_hash ~ '^[0-9a-f]{64}$'),
  nonce_hash text not null unique check (nonce_hash ~ '^[0-9a-f]{64}$'),
  source_ip_hash text not null check (source_ip_hash ~ '^[0-9a-f]{64}$'),
  agent_version text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

alter table devinx_laser.pairing_offers enable row level security;
revoke all on table devinx_laser.pairing_offers from public;
revoke all on table devinx_laser.pairing_offers from anon;
revoke all on table devinx_laser.pairing_offers from authenticated;

create index if not exists devinx_laser_pairing_offers_expiry_idx
  on devinx_laser.pairing_offers(expires_at);

create index if not exists devinx_laser_pairing_offers_fingerprint_created_idx
  on devinx_laser.pairing_offers(public_key_fingerprint,created_at desc);

create index if not exists devinx_laser_pairing_offers_ip_created_idx
  on devinx_laser.pairing_offers(source_ip_hash,created_at desc);

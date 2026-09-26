-- Granular rollback for migration 20260926174153.
-- Safe while the Laser Control schema contains no production pairing/device data.
-- Full product rollback should instead drop the complete devinx_laser schema.

drop table if exists devinx_laser.pairing_offers;

drop index if exists devinx_laser.devinx_laser_devices_public_key_fingerprint_uidx;

alter table devinx_laser.devices
  add column if not exists fingerprint_hash text;

update devinx_laser.devices
set fingerprint_hash=public_key_fingerprint
where fingerprint_hash is null;

alter table devinx_laser.devices
  alter column fingerprint_hash set not null,
  alter column public_key_fingerprint drop not null,
  drop column if exists public_key_pem,
  drop column if exists credential_hash,
  drop column if exists credential_issued_at,
  drop column if exists credential_revoked_at;

alter table devinx_laser.devices
  add constraint devices_owner_user_id_fingerprint_hash_key
  unique(owner_user_id,fingerprint_hash);

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

alter table devinx_laser.pairing_tickets enable row level security;
revoke all on table devinx_laser.pairing_tickets from public;
revoke all on table devinx_laser.pairing_tickets from anon;
revoke all on table devinx_laser.pairing_tickets from authenticated;

create index if not exists devinx_laser_pairing_expiry_idx
  on devinx_laser.pairing_tickets(expires_at);
create index if not exists devinx_laser_pairing_device_idx
  on devinx_laser.pairing_tickets(device_id);
create index if not exists devinx_laser_pairing_owner_idx
  on devinx_laser.pairing_tickets(owner_user_id);

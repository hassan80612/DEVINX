-- Granular rollback for migration 20260926174502.
-- Full Laser rollback should drop the complete devinx_laser schema instead.

alter table devinx_laser.devices
  drop constraint if exists devices_public_key_fingerprint_check,
  alter column public_key_pem drop not null,
  drop column if exists last_sequence,
  add column if not exists credential_hash text,
  add column if not exists credential_issued_at timestamptz,
  add column if not exists credential_revoked_at timestamptz;

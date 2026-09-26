-- Applied to DevinX Supabase as migration 20260926174502.
-- Uses the Agent ECDSA keypair itself as device authentication; no reusable device secret is issued.

alter table devinx_laser.devices
  drop column if exists credential_hash,
  drop column if exists credential_issued_at,
  drop column if exists credential_revoked_at,
  add column if not exists last_sequence bigint not null default 0 check (last_sequence >= 0);

alter table devinx_laser.devices
  alter column public_key_pem set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='devices_public_key_fingerprint_check'
      and conrelid='devinx_laser.devices'::regclass
  ) then
    alter table devinx_laser.devices
      add constraint devices_public_key_fingerprint_check
      check (public_key_fingerprint ~ '^[0-9a-f]{64}$');
  end if;
end
$$;

-- Sentinel 67.21 / shared database conservative phase-2 cleanup.
-- The owner explicitly approved permanent deletion of the historic backup.
-- Verified no references from active functions/views/triggers/cron or foreign keys.
SET lock_timeout = '3s';
SET statement_timeout = '30s';

-- This schema is the September 15, 2026 backup, NOT public or sentinel_app.
DROP SCHEMA IF EXISTS backup_20260915_pre_free CASCADE;

-- Never remove active devices, paired pending devices, queued commands, or
-- devices referenced by audit history. Device-specific state is FK CASCADE.
DELETE FROM sentinel_app.devices d
WHERE (
       (d.status='pending' AND d.account_id IS NULL)
       OR d.status='revoked'
      )
  AND COALESCE(d.last_seen_at,d.created_at) < now()-interval '7 days'
  AND NOT EXISTS (
    SELECT 1 FROM sentinel_app.commands c WHERE c.device_id=d.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM sentinel_app.master_audit a WHERE a.target_device_id=d.id
  );

-- Expired login sessions only; never remove unexpired, however old their last
-- seen date might be. Keep authentication and connected Agent unchanged.
DELETE FROM sentinel_app.sessions WHERE expires_at < now();

-- Small daily cleanup; no extra Agent polls/heartbeat and no new application
-- dependencies. This mirrors only the already performed safe deletions.
SELECT cron.schedule(
 'sentinel_stale_identity_retention_daily',
 '53 6 * * *',
 $job$DO $cleanup$
 BEGIN
  DELETE FROM sentinel_app.sessions WHERE expires_at < now();
  DELETE FROM sentinel_app.devices d
  WHERE ((d.status='pending' AND d.account_id IS NULL) OR d.status='revoked')
    AND COALESCE(d.last_seen_at,d.created_at) < now()-interval '7 days'
    AND NOT EXISTS (SELECT 1 FROM sentinel_app.commands c WHERE c.device_id=d.id)
    AND NOT EXISTS (SELECT 1 FROM sentinel_app.master_audit a WHERE a.target_device_id=d.id);
 END
 $cleanup$;$job$
);
RESET statement_timeout;
RESET lock_timeout;

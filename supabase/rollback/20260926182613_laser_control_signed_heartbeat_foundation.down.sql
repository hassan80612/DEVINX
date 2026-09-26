-- Rollback for migration 20260926182613.
drop function if exists public.laser_internal_admin_list_devices(uuid);
drop function if exists public.laser_internal_accept_heartbeat(uuid,bigint,text,text,jsonb);
drop function if exists public.laser_internal_get_device_auth(uuid);
alter table devinx_laser.devices drop column if exists last_telemetry;

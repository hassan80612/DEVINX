-- Rollback for migration 20260926175918.
drop function if exists public.laser_internal_accept_telemetry(uuid,bigint,text,text,boolean,boolean,text,text,integer,text,timestamptz);
drop function if exists public.laser_internal_device_auth_context(uuid);
drop table if exists devinx_laser.device_state;

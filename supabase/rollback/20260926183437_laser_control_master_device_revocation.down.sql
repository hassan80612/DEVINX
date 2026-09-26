-- Rollback for migration 20260926183437.
drop function if exists public.laser_internal_admin_set_device_access(uuid,uuid,text);

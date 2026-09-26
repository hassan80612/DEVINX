-- Rollback companion for 20260926170000_laser_control_foundation.sql
-- Run ONLY if the corresponding Laser Control migration was actually applied.
-- Current foundation stores all Laser Control database objects in this private schema.

drop schema if exists devinx_laser cascade;

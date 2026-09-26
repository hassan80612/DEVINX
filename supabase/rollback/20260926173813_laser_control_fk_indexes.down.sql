-- Granular rollback for migration 20260926173813.
drop index if exists devinx_laser.devinx_laser_command_events_device_idx;
drop index if exists devinx_laser.devinx_laser_commands_owner_idx;
drop index if exists devinx_laser.devinx_laser_commands_session_idx;
drop index if exists devinx_laser.devinx_laser_control_sessions_mobile_idx;
drop index if exists devinx_laser.devinx_laser_control_sessions_owner_idx;
drop index if exists devinx_laser.devinx_laser_pairing_device_idx;
drop index if exists devinx_laser.devinx_laser_pairing_owner_idx;

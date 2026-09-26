-- Applied as migration 20260926173813 after Supabase performance advisor review.

create index if not exists devinx_laser_command_events_device_idx
  on devinx_laser.command_events(device_id);

create index if not exists devinx_laser_commands_owner_idx
  on devinx_laser.commands(owner_user_id);

create index if not exists devinx_laser_commands_session_idx
  on devinx_laser.commands(session_id);

create index if not exists devinx_laser_control_sessions_mobile_idx
  on devinx_laser.control_sessions(mobile_device_id);

create index if not exists devinx_laser_control_sessions_owner_idx
  on devinx_laser.control_sessions(owner_user_id);

create index if not exists devinx_laser_pairing_device_idx
  on devinx_laser.pairing_tickets(device_id);

create index if not exists devinx_laser_pairing_owner_idx
  on devinx_laser.pairing_tickets(owner_user_id);

-- Emergency rollback for Laser Control Realtime.
update devinx_laser.remote_sessions
set status='closed',
    remote_input_enabled=false,
    input_token=null,
    revision=revision+1,
    closed_at=now(),
    updated_at=now()
where status='active';

update devinx_laser.commands
set status='expired',
    rejection_reason=coalesce(rejection_reason,'realtime_rollback')
where status in('queued','delivered');

drop function if exists public.laser_internal_agent_uninstall_device(uuid);
drop function if exists public.laser_internal_enqueue_session_command(uuid,uuid,uuid,text,uuid);
drop function if exists public.laser_internal_agent_next_session_command(uuid);
drop function if exists public.laser_internal_agent_remote_session(uuid);
drop function if exists public.laser_internal_close_remote_session(uuid,uuid);
drop function if exists public.laser_internal_set_remote_input(uuid,uuid,boolean);
drop function if exists public.laser_internal_open_remote_session(uuid,uuid);

drop table if exists devinx_laser.remote_sessions;

drop function if exists public.admin_update_site_visibility(boolean,boolean);
drop function if exists public.admin_get_site_visibility();
drop function if exists public.get_public_site_visibility();

alter table public.devinx_settings
  drop column if exists laser_public_visible,
  drop column if exists finance_public_visible;

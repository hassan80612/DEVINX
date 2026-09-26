-- Emergency rollback for Laser Control v0.6 dedicated commands.
update devinx_laser.devices
set remote_control_enabled=false,
    local_arm_until=null,
    updated_at=now()
where remote_control_enabled=true or local_arm_until is not null;

update devinx_laser.commands
set status='expired',
    rejection_reason=coalesce(rejection_reason,'v06_rollback')
where status in ('queued','delivered');

revoke all on function public.laser_internal_agent_set_remote_arm(uuid,boolean) from service_role;
revoke all on function public.laser_internal_enqueue_command(uuid,uuid,text,uuid) from service_role;
revoke all on function public.laser_internal_agent_next_command(uuid) from service_role;
revoke all on function public.laser_internal_agent_ack_command(uuid,uuid,boolean,text) from service_role;
revoke all on function public.laser_internal_command_status(uuid,uuid) from service_role;

drop function if exists public.laser_internal_agent_set_remote_arm(uuid,boolean);
drop function if exists public.laser_internal_enqueue_command(uuid,uuid,text,uuid);
drop function if exists public.laser_internal_agent_next_command(uuid);
drop function if exists public.laser_internal_agent_ack_command(uuid,uuid,boolean,text);
drop function if exists public.laser_internal_command_status(uuid,uuid);

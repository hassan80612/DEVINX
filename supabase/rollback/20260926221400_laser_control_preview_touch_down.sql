update devinx_laser.devices
set remote_control_enabled=false,local_arm_until=null,updated_at=now()
where remote_control_enabled=true or local_arm_until is not null;

drop function if exists public.laser_internal_set_preview_touch(uuid,uuid,boolean);
drop function if exists public.laser_internal_queue_preview_tap(uuid,uuid,double precision,double precision);
drop function if exists public.laser_internal_preview_control_state(uuid,bigint);
drop function if exists public.laser_internal_agent_set_local_arm(uuid,boolean);

alter table devinx_laser.preview_state
  drop column if exists touch_event_at,
  drop column if exists touch_event,
  drop column if exists touch_event_seq,
  drop column if exists touch_enabled;

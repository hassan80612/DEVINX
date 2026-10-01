-- Explicit permissions for the Laser Master administrative RPCs.

revoke execute on function public.admin_get_laser_ops_snapshot(integer,integer) from anon;
revoke execute on function public.admin_list_laser_live_presence(integer) from anon;
revoke execute on function public.admin_list_laser_devices() from anon;
revoke execute on function public.admin_list_laser_sessions(integer) from anon;
revoke execute on function public.admin_laser_device_action(uuid,text) from anon;
revoke execute on function public.admin_laser_close_session(text,uuid) from anon;
revoke execute on function public.admin_set_laser_mentor_credits_by_email(text,integer) from anon;
revoke execute on function public.admin_laser_close_user_sessions(text) from anon;
revoke execute on function public.admin_laser_cleanup_expired() from anon;

create index if not exists laser_funnel_events_user_idx
  on devinx_laser.funnel_events(user_id)
  where user_id is not null;

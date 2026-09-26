revoke all on function public.laser_internal_set_preview_request(uuid,uuid,boolean) from service_role;
revoke all on function public.laser_internal_preview_request_state(uuid) from service_role;
revoke all on function public.laser_internal_record_preview_frame(uuid,integer,integer,integer,timestamptz) from service_role;
revoke all on function public.laser_internal_preview_meta(uuid,uuid) from service_role;

drop function if exists public.laser_internal_set_preview_request(uuid,uuid,boolean);
drop function if exists public.laser_internal_preview_request_state(uuid);
drop function if exists public.laser_internal_record_preview_frame(uuid,integer,integer,integer,timestamptz);
drop function if exists public.laser_internal_preview_meta(uuid,uuid);

drop table if exists devinx_laser.preview_state;

-- Before deleting the bucket row, empty the private bucket through the Storage Admin API
-- so the underlying objects are actually removed. Once empty:
delete from storage.buckets where id='devinx-laser-preview';

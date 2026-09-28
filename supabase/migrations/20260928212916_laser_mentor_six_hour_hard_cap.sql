create or replace function public.laser_guard_mentor_device_expiry()
returns trigger
language plpgsql
security definer
set search_path to 'devinx_laser','public'
as $function$
declare
  v_anchor timestamptz;
  v_max_expiry timestamptz;
begin
  if new.connection_mode='mentor' then
    v_anchor:=coalesce(new.paired_at,new.created_at,now());
    v_max_expiry:=v_anchor+interval '6 hours';

    if new.access_expires_at is null or new.access_expires_at>v_max_expiry then
      new.access_expires_at:=v_max_expiry;
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_laser_guard_mentor_device_expiry on devinx_laser.devices;
create trigger trg_laser_guard_mentor_device_expiry
before insert or update of connection_mode,access_expires_at,paired_at
on devinx_laser.devices
for each row
execute function public.laser_guard_mentor_device_expiry();

update devinx_laser.devices d
set access_expires_at=least(
  d.access_expires_at,
  coalesce(d.paired_at,d.created_at,now())+interval '6 hours'
)
where d.connection_mode='mentor'
  and d.access_expires_at is not null
  and d.access_expires_at>coalesce(d.paired_at,d.created_at,now())+interval '6 hours';

revoke all on function public.laser_guard_mentor_device_expiry() from public,anon,authenticated;

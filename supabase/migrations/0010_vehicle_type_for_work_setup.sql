alter table public.vehicles add column if not exists vehicle_type text not null default 'car';
alter table public.vehicles drop constraint if exists vehicles_vehicle_type_check;
alter table public.vehicles add constraint vehicles_vehicle_type_check check (vehicle_type in ('car','motorcycle','bicycle'));

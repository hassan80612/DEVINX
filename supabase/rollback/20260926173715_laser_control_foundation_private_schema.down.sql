-- Full rollback for migration 20260926173715.
-- Removes the isolated Laser Control schema and every object inside it.
drop schema if exists devinx_laser cascade;

-- Rebuild only the historically bloated indexes of the VetorizeAI funnel table.
-- This table has only ~19 live rows, while old indexes occupy ~6.6 MiB.
-- This is a physical index rewrite; event data, constraints and queries remain identical.
SET lock_timeout='3s';
SET statement_timeout='30s';
REINDEX TABLE public.funnel_events;
RESET statement_timeout;
RESET lock_timeout;

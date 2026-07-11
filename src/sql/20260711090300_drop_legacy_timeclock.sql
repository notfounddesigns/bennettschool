-- ============================================================================
-- Migration 4: Post-cutover teardown  (DO NOT run with the others)
-- ============================================================================
-- Apply only after:
--   1. All app writes go to timeclock_intervals.
--   2. All app reads go to timeclock_intervals (or you're keeping the compat
--      views long-term — in that case only run the DROP TABLE lines).
--   3. You've verified production behavior for at least one full pay/report
--      cycle.
-- ============================================================================

-- Legacy data copies (rollback safety net)
DROP TABLE IF EXISTS public.timeclock_breaks_legacy;
DROP TABLE IF EXISTS public.timeclock_entries_legacy;

-- Compat views — drop only once nothing selects from the old names
-- DROP VIEW IF EXISTS public.timeclock_breaks;
-- DROP VIEW IF EXISTS public.timeclock_entries;

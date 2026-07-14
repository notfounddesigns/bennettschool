-- ============================================================================
-- Hours tab views
-- ============================================================================
-- Wraps the three ad-hoc queries in /queries as views so the admin "Hours"
-- tab can select them directly via PostgREST, the same way the app already
-- reads from profiles_view / timeclock_status. Run this against the
-- Supabase project's SQL editor like the other migrations in this folder.
-- ============================================================================

CREATE OR REPLACE VIEW public.v_hours_by_profile AS
-- queries/hours_by_profile.sql
SELECT
  p.id,
  p.name,
  p.homebase_id,
  COALESCE(SUM(CASE WHEN h.type_id IN (1, 3) THEN h.hours ELSE 0 END), 0) as in_person_hours,
  COALESCE(SUM(CASE WHEN h.type_id = 2 THEN h.hours ELSE 0 END), 0) as de_hours,
  COALESCE(SUM(h.hours), 0) as total_hours
FROM public.profiles p
LEFT JOIN public.hours h ON p.homebase_id = h.homebase_id
WHERE h.date::date <= CURRENT_DATE
GROUP BY p.id, p.name, p.homebase_id
ORDER BY p.name;

CREATE OR REPLACE VIEW public.v_timeclock_hours_since_july_1 AS
-- queries/timeclock_hours_since_july_1.sql
SELECT
  p.id,
  p.name,
  p.homebase_id,
  COALESCE(
    SUM(
      EXTRACT(EPOCH FROM (te.clock_out - te.clock_in)) / 3600 -
      COALESCE(
        (SELECT EXTRACT(EPOCH FROM SUM(tb.break_end - tb.break_start)) / 3600
         FROM public.timeclock_breaks tb
         WHERE tb.entry_id = te.id AND tb.break_end IS NOT NULL),
        0
      )
    ),
    0
  )::numeric(10, 2) as net_hours
FROM public.profiles p
LEFT JOIN public.timeclock_entries te ON p.homebase_id = te.homebase_id
  AND te.date >= '2026-07-01'
  AND te.clock_out IS NOT NULL
GROUP BY p.id, p.name, p.homebase_id
ORDER BY p.name;

CREATE OR REPLACE VIEW public.v_duplicate_student_hours AS
-- queries/detect_duplicate_hours.sql
SELECT
  h.homebase_id,
  p.name,
  h.date,
  h.type_id,
  h.module,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(h.id) as entry_ids,
  ARRAY_AGG(h.hours) as hours_values
FROM public.hours h
JOIN public.profiles p ON p.homebase_id = h.homebase_id
GROUP BY h.homebase_id, p.name, h.date, h.type_id, h.module
HAVING COUNT(*) > 1
ORDER BY p.name, h.date DESC;

-- These views select through to profiles/hours/timeclock_entries, which
-- already have RLS policies covering the mgmt/admin role — no additional
-- grants needed here.

-- ============================================================================
-- Migration 2: Unify timeclock_entries + timeclock_breaks into one table
-- ============================================================================
-- Strategy:
--   1. Create timeclock_intervals (shifts and breaks as rows, breaks parented
--      to their shift).
--   2. Copy data across, preserving original UUIDs so photo paths, links, and
--      any external references keep working.
--   3. Rename old tables to *_legacy (kept for rollback; drop later).
--   4. Recreate timeclock_entries / timeclock_breaks as read-only compat
--      views so existing SELECTs keep working during cutover.
--   5. Redefine the timeclock_status view over the new table.
--
-- BEFORE RUNNING:
--   - Capture the current status view definition to reconcile with the one
--     below:  SELECT pg_get_viewdef('public.timeclock_status', true);
--   - Capture existing RLS policies on the old tables so they can be
--     recreated on timeclock_intervals:
--       SELECT * FROM pg_policies
--       WHERE tablename IN ('timeclock_entries','timeclock_breaks');
--
-- AFTER CUTOVER: point all app WRITES at timeclock_intervals. The compat
-- views are readable but not writable (no INSTEAD OF triggers on purpose —
-- writes should move to the new table, not linger on the old names).
-- ============================================================================

-- The status view depends on the old tables; drop it first so it doesn't
-- silently follow them through the rename and read stale data.
DROP VIEW IF EXISTS public.timeclock_status;

-- ----------------------------------------------------------------------------
-- 1. New unified table
-- ----------------------------------------------------------------------------
CREATE TABLE public.timeclock_intervals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  homebase_id bigint NOT NULL,
  kind text NOT NULL CHECK (kind IN ('shift', 'break')),
  parent_id uuid,
  date date NOT NULL DEFAULT CURRENT_DATE,
  start_at timestamptz NOT NULL DEFAULT now(),
  end_at timestamptz,
  start_photo_path text,
  end_photo_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT timeclock_intervals_pkey PRIMARY KEY (id),
  CONSTRAINT timeclock_intervals_homebase_id_fkey
    FOREIGN KEY (homebase_id) REFERENCES public.profiles(homebase_id),
  CONSTRAINT timeclock_intervals_parent_id_fkey
    FOREIGN KEY (parent_id) REFERENCES public.timeclock_intervals(id)
    ON DELETE CASCADE,
  CONSTRAINT timeclock_intervals_kind_parent_check CHECK (
    (kind = 'shift' AND parent_id IS NULL) OR
    (kind = 'break' AND parent_id IS NOT NULL)
  ),
  CONSTRAINT timeclock_intervals_end_after_start_check
    CHECK (end_at IS NULL OR end_at > start_at)
);

CREATE INDEX timeclock_intervals_homebase_date_idx
  ON public.timeclock_intervals (homebase_id, date);
CREATE INDEX timeclock_intervals_parent_idx
  ON public.timeclock_intervals (parent_id)
  WHERE parent_id IS NOT NULL;
-- Fast "who is currently clocked in / on break" lookups
CREATE INDEX timeclock_intervals_open_idx
  ON public.timeclock_intervals (homebase_id, kind, start_at DESC)
  WHERE end_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2. Data migration (UUIDs preserved)
-- ----------------------------------------------------------------------------
INSERT INTO public.timeclock_intervals
  (id, homebase_id, kind, parent_id, date, start_at, end_at,
   start_photo_path, end_photo_path, created_at)
SELECT
  e.id, e.homebase_id, 'shift', NULL, e.date, e.clock_in, e.clock_out,
  e.clock_in_photo_path, e.clock_out_photo_path, e.created_at
FROM public.timeclock_entries e;

INSERT INTO public.timeclock_intervals
  (id, homebase_id, kind, parent_id, date, start_at, end_at,
   start_photo_path, end_photo_path, created_at)
SELECT
  b.id, e.homebase_id, 'break', b.entry_id, e.date, b.break_start, b.break_end,
  b.break_start_photo_path, b.break_end_photo_path, b.created_at
FROM public.timeclock_breaks b
JOIN public.timeclock_entries e ON e.id = b.entry_id;

-- Sanity check: row counts must match or the whole migration rolls back.
DO $$
DECLARE
  old_count bigint;
  new_count bigint;
BEGIN
  SELECT (SELECT count(*) FROM public.timeclock_entries)
       + (SELECT count(*) FROM public.timeclock_breaks) INTO old_count;
  SELECT count(*) FROM public.timeclock_intervals INTO new_count;
  IF old_count <> new_count THEN
    RAISE EXCEPTION
      'timeclock migration count mismatch: legacy=% new=%. Likely orphaned breaks (entry_id with no matching entry). Investigate before re-running.',
      old_count, new_count;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Park the old tables (drop in a later migration once cutover is verified)
-- ----------------------------------------------------------------------------
ALTER TABLE public.timeclock_entries RENAME TO timeclock_entries_legacy;
ALTER TABLE public.timeclock_breaks RENAME TO timeclock_breaks_legacy;

-- ----------------------------------------------------------------------------
-- 4. Read-only compatibility views under the old names
-- ----------------------------------------------------------------------------
CREATE VIEW public.timeclock_entries AS
SELECT
  id,
  homebase_id,
  start_at AS clock_in,
  end_at   AS clock_out,
  date,
  created_at,
  start_photo_path AS clock_in_photo_path,
  end_photo_path   AS clock_out_photo_path
FROM public.timeclock_intervals
WHERE kind = 'shift';

CREATE VIEW public.timeclock_breaks AS
SELECT
  id,
  parent_id AS entry_id,
  start_at  AS break_start,
  end_at    AS break_end,
  created_at,
  start_photo_path AS break_start_photo_path,
  end_photo_path   AS break_end_photo_path
FROM public.timeclock_intervals
WHERE kind = 'break';

-- ----------------------------------------------------------------------------
-- 5. Status view over the new table
-- ----------------------------------------------------------------------------
-- One row per active profile: 'on_break' > 'clocked_in' > 'clocked_out',
-- derived purely from open intervals — no state to drift.
-- Reconcile columns with the captured definition of your previous view.
CREATE VIEW public.timeclock_status AS
WITH open_intervals AS (
  SELECT DISTINCT ON (homebase_id)
    homebase_id, id, kind, parent_id, start_at, date
  FROM public.timeclock_intervals
  WHERE end_at IS NULL
  ORDER BY homebase_id,
           (kind = 'break') DESC,  -- an open break outranks its open shift
           start_at DESC
)
SELECT
  p.homebase_id,
  p.name,
  CASE
    WHEN o.kind = 'break' THEN 'on_break'
    WHEN o.kind = 'shift' THEN 'clocked_in'
    ELSE 'clocked_out'
  END AS status,
  o.start_at AS since,
  COALESCE(o.parent_id, o.id) AS current_shift_id,
  o.date AS shift_date
FROM public.profiles p
LEFT JOIN open_intervals o ON o.homebase_id = p.homebase_id
WHERE p.is_active;

-- ----------------------------------------------------------------------------
-- 6. Row Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE public.timeclock_intervals ENABLE ROW LEVEL SECURITY;

-- Recreate your policies from the old tables here. Placeholder examples —
-- replace with the actual policies captured in the pre-flight step:
--
-- CREATE POLICY "students read own intervals"
--   ON public.timeclock_intervals FOR SELECT
--   USING (homebase_id = (SELECT homebase_id FROM public.profiles
--                         WHERE id = auth.uid()));
--
-- CREATE POLICY "service role full access"
--   ON public.timeclock_intervals FOR ALL
--   USING (auth.role() = 'service_role');

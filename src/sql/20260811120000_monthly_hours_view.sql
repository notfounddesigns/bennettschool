-- ============================================================================
-- monthly_hours_view — per-student, per-month hour rollup for the hours export
-- ============================================================================
--
-- One row per (student, month) for every month from the tracking cutover to the
-- current month, so the export-hours edge function can select a month instead of
-- fetching whole tables and aggregating in TypeScript:
--
--   supabase.from('monthly_hours_view')
--     .select('*')
--     .eq('month_start', '2026-08-01')
--     .eq('role_id', 1)
--     .order('name')
--
-- A view cannot take parameters, so the month is a column rather than an
-- argument. Rows exist for every student in every month, zeros included, so the
-- export never silently drops a student.
--
-- Rules encoded here (previously spread through the edge function):
--   * Tracking cutover — legacy_hours carries each student's lump-sum total
--     through 2026-06-30, so tracked rows before 2026-07-01 are not counted;
--     counting them would double the lump sum.
--   * timeclock_entries supersedes `hours` on any day both have a row.
--   * Soft-deleted rows (hours < 0) are excluded.
--   * The current month stops at today; past months use the whole month.
--   * prev_total_hours is cumulative through the last day of the prior month
--     (legacy plus every tracked month before this one), NOT that single month.
--
-- day_hours is a 31-element array of in-person hours, one slot per calendar day,
-- NULL where there are no hours and for slots past the end of the month or past
-- today. It maps straight onto template columns B–AF.

CREATE OR REPLACE VIEW public.monthly_hours_view AS
WITH cutover AS (
  SELECT '2026-07-01'::date AS start_date
),
months AS (
  SELECT
    gs::date                                                   AS month_start,
    (gs + INTERVAL '1 month' - INTERVAL '1 day')::date          AS month_end,
    -- Current month stops at today; past months use the whole month.
    LEAST((gs + INTERVAL '1 month' - INTERVAL '1 day')::date,
          CURRENT_DATE)                                        AS window_end
  FROM cutover c,
       generate_series(c.start_date,
                       date_trunc('month', CURRENT_DATE)::date,
                       INTERVAL '1 month') gs
),
-- Read profiles directly rather than profiles_view: that view selects
-- combined.homebase_id off a LEFT JOIN, so a student with no hours at all comes
-- back with a NULL homebase_id.
students AS (
  SELECT p.homebase_id::numeric AS homebase_id, p.name, p.role_id
  FROM public.profiles p
  WHERE p.is_active
    AND p.role_id <> 3
    AND p.name <> 'test student'::text
),

-- ── Daily source rows ───────────────────────────────────────────────────────
-- homebase_id is cast on every join: `hours` stores it as numeric while
-- timeclock_entries stores bigint.

timeclock_daily AS (
  SELECT te.homebase_id::numeric AS homebase_id,
         te.date::date           AS day,
         SUM(COALESCE(te.hours_worked, 0))::numeric AS hours
  FROM public.timeclock_entries te, cutover c
  WHERE te.date::date >= c.start_date
  GROUP BY 1, 2
),
manual_daily AS (
  SELECT h.homebase_id::numeric AS homebase_id,
         h.date::date           AS day,
         SUM(h.hours)::numeric  AS hours
  FROM public.hours h, cutover c
  WHERE h.date::date >= c.start_date
    AND h.hours >= 0
  GROUP BY 1, 2
),
-- The timeclock is authoritative for any day it covers. An open shift
-- (clock_out NULL) contributes 0 hours and still suppresses a manual row.
in_person_daily AS (
  SELECT homebase_id, day, hours FROM timeclock_daily
  UNION ALL
  SELECT m.homebase_id, m.day, m.hours
  FROM manual_daily m
  WHERE NOT EXISTS (
    SELECT 1 FROM timeclock_daily t
    WHERE t.homebase_id = m.homebase_id AND t.day = m.day
  )
),
de_daily AS (
  SELECT d.homebase_id::numeric AS homebase_id,
         d.date::date           AS day,
         SUM(d.hours)::numeric  AS hours
  FROM public.de_hours d, cutover c
  WHERE d.date::date >= c.start_date
    AND d.is_active
  GROUP BY 1, 2
),

-- ── Monthly aggregates ──────────────────────────────────────────────────────

in_person_month AS (
  SELECT ip.homebase_id, m.month_start, SUM(ip.hours) AS hours
  FROM in_person_daily ip
  JOIN months m ON ip.day BETWEEN m.month_start AND m.window_end
  GROUP BY 1, 2
),
de_month AS (
  SELECT de.homebase_id, m.month_start, SUM(de.hours) AS hours
  FROM de_daily de
  JOIN months m ON de.day BETWEEN m.month_start AND m.window_end
  GROUP BY 1, 2
),

-- ── Day-by-day grid (template columns B–AF) ─────────────────────────────────

day_cells AS (
  SELECT
    s.homebase_id,
    m.month_start,
    g.day_num,
    CASE
      -- Slots past the end of a short month, or past today in the current
      -- month, stay blank. Both are covered by one comparison because the
      -- generated date spills past month_end.
      WHEN (m.month_start + (g.day_num - 1) * INTERVAL '1 day')::date > m.window_end
        THEN NULL
      ELSE ROUND(NULLIF(COALESCE(ip.hours, 0), 0), 2)
    END AS hours
  FROM students s
  CROSS JOIN months m
  CROSS JOIN generate_series(1, 31) AS g(day_num)
  LEFT JOIN in_person_daily ip
         ON ip.homebase_id = s.homebase_id
        AND ip.day = (m.month_start + (g.day_num - 1) * INTERVAL '1 day')::date
),
day_hours AS (
  SELECT homebase_id, month_start,
         array_agg(hours ORDER BY day_num) AS day_hours
  FROM day_cells
  GROUP BY 1, 2
),

-- ── Assemble ────────────────────────────────────────────────────────────────

per_month AS (
  SELECT
    s.homebase_id,
    s.name,
    s.role_id,
    m.month_start,
    m.month_end,
    m.window_end,
    COALESCE(ipm.hours, 0) AS in_person_hours,
    COALESCE(dem.hours, 0) AS de_hours,
    dh.day_hours
  FROM students s
  CROSS JOIN months m
  LEFT JOIN in_person_month ipm ON ipm.homebase_id = s.homebase_id
                              AND ipm.month_start = m.month_start
  LEFT JOIN de_month       dem ON dem.homebase_id = s.homebase_id
                              AND dem.month_start = m.month_start
  LEFT JOIN day_hours       dh ON dh.homebase_id  = s.homebase_id
                              AND dh.month_start  = m.month_start
),
with_prior AS (
  SELECT
    pm.*,
    COALESCE(lh.hours::numeric, 0) AS legacy_hours,
    -- Every tracked month strictly before this one. NULL on a student's first
    -- month, which is what makes prev_total_hours equal legacy_hours there.
    COALESCE(SUM(pm.in_person_hours + pm.de_hours) OVER (
      PARTITION BY pm.homebase_id
      ORDER BY pm.month_start
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ), 0) AS prior_tracked_hours
  FROM per_month pm
  LEFT JOIN public.legacy_hours lh ON lh.homebase_id::numeric = pm.homebase_id
)
SELECT
  w.homebase_id::bigint AS homebase_id,
  w.name,
  w.role_id,
  w.month_start,
  w.month_end,
  w.window_end,
  ROUND(w.legacy_hours, 2)     AS legacy_hours,
  ROUND(w.de_hours, 2)         AS de_hours,
  ROUND(w.in_person_hours, 2)  AS in_person_hours,
  -- Template column AI. Labelled "Previous Month's Total" in the spreadsheet,
  -- but it is the cumulative total through the last day of the prior month.
  ROUND(w.legacy_hours + w.prior_tracked_hours, 2) AS prev_total_hours,
  -- Template column AJ.
  ROUND(w.legacy_hours + w.prior_tracked_hours
        + w.de_hours + w.in_person_hours, 2)       AS overall_total_hours,
  -- Template columns B–AF: 31 slots, in-person hours, NULL where blank.
  w.day_hours
FROM with_prior w;

COMMENT ON VIEW public.monthly_hours_view IS
  'Per-student, per-month hour rollup for the hours export. One row per student '
  'per month from the 2026-07-01 tracking cutover onward. prev_total_hours is '
  'cumulative through the end of the prior month (legacy_hours plus all earlier '
  'tracked months), not that single month. day_hours is 31 slots of in-person '
  'hours for template columns B-AF.';

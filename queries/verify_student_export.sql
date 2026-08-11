-- Verify Export Totals for One Student
-- Reproduces what the `export-hours` edge function should write for a single
-- student and month, so the spreadsheet can be checked against the database.
--
-- Mirrors the export's rules:
--   * 2026-07-01 tracking cutover — legacy_hours carries the lump-sum total
--     through 2026-06-30, so tracked rows before that date are not counted.
--   * timeclock_entries supersedes `hours` on any day both have a row.
--   * soft-deleted rows (hours < 0) are excluded.
--   * the current month stops at today; past months use the whole month.
--
-- Edit the two marked values in `bounds`. To find a homebase_id:
--   SELECT homebase_id, name FROM public.profiles WHERE name ILIKE '%mathis%';

WITH bounds AS (
  SELECT
    696969::numeric                               AS homebase_id,   -- ← student
    date_trunc('month', '2026-08-01'::date)::date  AS month_start,   -- ← any date in the month
    '2026-07-01'::date                             AS tracking_start
),
b AS (
  SELECT
    bounds.*,
    LEAST(
      (bounds.month_start + INTERVAL '1 month' - INTERVAL '1 day')::date,
      CURRENT_DATE
    ) AS month_end
  FROM bounds
),

-- In-person hours per day, from the timeclock. An open shift (clock_out NULL)
-- lands here as 0 hours and still suppresses a manual `hours` row for that day,
-- which is what the export does.
timeclock_daily AS (
  SELECT te.date::date AS day, SUM(COALESCE(te.hours_worked, 0))::numeric AS hours
  FROM public.timeclock_entries te, b
  WHERE te.homebase_id::numeric = b.homebase_id
    AND te.date::date BETWEEN b.tracking_start AND b.month_end
  GROUP BY 1
),

-- In-person hours per day, manually entered.
hours_daily AS (
  SELECT h.date::date AS day, SUM(h.hours)::numeric AS hours
  FROM public.hours h, b
  WHERE h.homebase_id::numeric = b.homebase_id
    AND h.date::date BETWEEN b.tracking_start AND b.month_end
    AND h.hours >= 0
  GROUP BY 1
),

-- Timeclock wins on any day present in both sources.
in_person AS (
  SELECT day, hours FROM timeclock_daily
  UNION ALL
  SELECT hd.day, hd.hours
  FROM hours_daily hd
  WHERE NOT EXISTS (SELECT 1 FROM timeclock_daily td WHERE td.day = hd.day)
),

de AS (
  SELECT d.date::date AS day, SUM(d.hours)::numeric AS hours
  FROM public.de_hours d, b
  WHERE d.homebase_id::numeric = b.homebase_id
    AND d.date::date BETWEEN b.tracking_start AND b.month_end
    AND d.hours >= 0
  GROUP BY 1
),

totals AS (
  SELECT
    COALESCE((SELECT SUM(hours) FROM in_person, b WHERE day >= b.month_start), 0) AS cur_in_person,
    COALESCE((SELECT SUM(hours) FROM de,        b WHERE day >= b.month_start), 0) AS cur_de,
    COALESCE((SELECT SUM(hours) FROM in_person, b WHERE day <  b.month_start), 0) AS prior_in_person,
    COALESCE((SELECT SUM(hours) FROM de,        b WHERE day <  b.month_start), 0) AS prior_de
)

SELECT
  b.homebase_id::bigint AS homebase_id,
  p.name,
  ROUND(COALESCE(lh.hours::numeric, 0), 2)   AS legacy_hours,
  ROUND(t.cur_de, 2)                         AS cur_month_de_hours,
  ROUND(t.cur_in_person, 2)                  AS cur_month_in_person_hours,
  -- Column AI: cumulative total through the last day of the prior month.
  ROUND(COALESCE(lh.hours::numeric, 0) + t.prior_in_person + t.prior_de, 2)
                                             AS prev_total_hours,
  -- Column AJ: prev_total + this month's DE + this month's in-person.
  ROUND(COALESCE(lh.hours::numeric, 0) + t.prior_in_person + t.prior_de
        + t.cur_de + t.cur_in_person, 2)     AS overall_total_hours
FROM b
CROSS JOIN totals t
JOIN public.profiles p ON p.homebase_id::numeric = b.homebase_id
LEFT JOIN public.legacy_hours lh ON lh.homebase_id::numeric = b.homebase_id;


-- ============================================================================
-- Day-by-day backup, for when a total disagrees and you need to see where.
-- Same student/month — edit the two values again.
-- ============================================================================
-- WITH b AS (
--   SELECT 696969::numeric AS homebase_id,
--          '2026-08-01'::date AS month_start,
--          '2026-08-31'::date AS month_end
-- )
-- SELECT day, source, hours FROM (
--   SELECT te.date::date AS day, 'timeclock' AS source,
--          SUM(COALESCE(te.hours_worked, 0))::numeric AS hours
--   FROM public.timeclock_entries te, b
--   WHERE te.homebase_id::numeric = b.homebase_id
--     AND te.date::date BETWEEN b.month_start AND b.month_end
--   GROUP BY 1
--   UNION ALL
--   SELECT h.date::date, 'hours (manual)', SUM(h.hours)::numeric
--   FROM public.hours h, b
--   WHERE h.homebase_id::numeric = b.homebase_id
--     AND h.date::date BETWEEN b.month_start AND b.month_end
--     AND h.hours >= 0
--   GROUP BY 1
--   UNION ALL
--   SELECT d.date::date, 'de_hours', SUM(d.hours)::numeric
--   FROM public.de_hours d, b
--   WHERE d.homebase_id::numeric = b.homebase_id
--     AND d.date::date BETWEEN b.month_start AND b.month_end
--     AND d.hours >= 0
--   GROUP BY 1
-- ) x
-- ORDER BY day, source;

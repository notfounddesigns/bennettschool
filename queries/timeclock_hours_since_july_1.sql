-- Timeclock Hours Since July 1, 2026 (Minus Breaks)
-- Calculates net hours worked by subtracting break time from clock in/out duration
-- Only includes entries with clock_out timestamps

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
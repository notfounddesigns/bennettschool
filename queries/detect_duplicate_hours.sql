-- Detect Duplicate Student Hours
-- Finds records that appear to be duplicates based on:
-- - Same student (homebase_id)
-- - Same date
-- - Same type_id
-- - Same module

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
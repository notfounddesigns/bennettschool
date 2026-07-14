-- Hours by Profile (In-Person vs. DE)
-- Returns total hours for each profile split by type_id
-- In-person: type_id 1 and 3
-- DE hours: type_id 2

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
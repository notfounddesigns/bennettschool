-- ============================================================================
-- Migration 5: grades soft delete
-- ============================================================================
-- Deleting a grade from the portal must not destroy the record — the row stays
-- and is_active flips to false, so an accidental delete is recoverable and the
-- history is still there for reporting. Every existing row is live, so the
-- column backfills to true.
--
-- Safe to re-run: every step is idempotent, and the uniqueness swap below
-- tolerates the key being named differently or missing entirely.
-- ============================================================================

ALTER TABLE public.grades
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ----------------------------------------------------------------------------
-- Re-scope the uniqueness key to active rows
-- ----------------------------------------------------------------------------
-- Full-table uniqueness on (homebase_id, project, category, date) would let a
-- soft-deleted row hold that slot forever, so the same grade could never be
-- re-entered after a delete. Swap it for the same key restricted to active
-- rows.
--
-- Matched by column set rather than by name: depending on which earlier
-- migrations this database actually got, the key may be the named constraint
-- from migration 1, a Postgres auto-named one, a bare unique index, or absent.
-- When it is absent nothing is created — introducing uniqueness that was never
-- there could fail on pre-existing duplicate rows. See the note at the bottom.
DO $$
DECLARE
  idx oid;
  con_name text;
  swapped boolean := false;
BEGIN
  FOR idx IN
    SELECT i.indexrelid
    FROM pg_index i
    WHERE i.indrelid = 'public.grades'::regclass
      AND i.indisunique
      AND i.indpred IS NULL          -- already-partial keys are ours; leave them
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM unnest(i.indkey::int2[]) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
      ) = ARRAY['category', 'date', 'homebase_id', 'project']
  LOOP
    -- A primary key over those columns is left alone: dropping it would take
    -- the table's identity with it. Soft delete still works, but re-entering a
    -- deleted grade will conflict — resolve that by hand if it ever comes up.
    IF EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = idx AND c.contype = 'p') THEN
      RAISE NOTICE 'grades: primary key covers (homebase_id, project, category, date); left as-is';
      CONTINUE;
    END IF;

    SELECT c.conname INTO con_name
    FROM pg_constraint c
    WHERE c.conindid = idx AND c.contype = 'u';

    IF con_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.grades DROP CONSTRAINT %I', con_name);
    ELSE
      EXECUTE format('DROP INDEX %s', idx::regclass);
    END IF;
    swapped := true;
  END LOOP;

  IF swapped THEN
    EXECUTE '
      CREATE UNIQUE INDEX IF NOT EXISTS grades_student_project_category_date_key
        ON public.grades (homebase_id, project, category, date)
        WHERE is_active';
  END IF;
END $$;

-- Every read path filters on is_active and orders by date.
CREATE INDEX IF NOT EXISTS grades_active_idx
  ON public.grades (homebase_id, date DESC)
  WHERE is_active;

-- ----------------------------------------------------------------------------
-- OPTIONAL: adding the uniqueness key if this database never got one
-- ----------------------------------------------------------------------------
-- Without it, duplicate (homebase_id, project, category, date) rows are
-- possible, and an edit or delete from the portal matches on those four
-- columns — so it would hit every duplicate at once. To close that off, first
-- check for existing duplicates:
--
--   SELECT homebase_id, project, category, date, count(*)
--   FROM public.grades WHERE is_active
--   GROUP BY 1,2,3,4 HAVING count(*) > 1;
--
-- Resolve any rows it returns, then:
--
--   CREATE UNIQUE INDEX grades_student_project_category_date_key
--     ON public.grades (homebase_id, project, category, date)
--     WHERE is_active;

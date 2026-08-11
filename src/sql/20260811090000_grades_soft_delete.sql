-- ============================================================================
-- Migration 5: grades soft delete
-- ============================================================================
-- Deleting a grade from the portal must not destroy the record — the row stays
-- and is_active flips to false, so an accidental delete is recoverable and the
-- history is still there for reporting. Every existing row is live, so the
-- column backfills to true.
--
-- Safe to re-run: every step is idempotent, and the uniqueness swap below is
-- matched by column set rather than by name, so it works whatever this
-- database's key is currently called (or if it has none).
--
-- Requires PG15+ for NULLS NOT DISTINCT (Supabase is PG15+).
-- ============================================================================

ALTER TABLE public.grades
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ----------------------------------------------------------------------------
-- 1. Retire the old uniqueness key
-- ----------------------------------------------------------------------------
-- (homebase_id, project, category, date) is too strict: a student who retakes
-- a test has two legitimate rows on the same day for the same project. It is
-- also too loose in the other direction — being a full-table key, a
-- soft-deleted row would hold its slot forever and that grade could never be
-- re-entered.
--
-- Matched by column set, in any order and under any name, so this catches the
-- constraint from migration 1, a Postgres auto-named one, a bare unique index,
-- or the partial index left by an earlier run of this migration.
DO $$
DECLARE
  idx oid;
  con_name text;
BEGIN
  FOR idx IN
    SELECT i.indexrelid
    FROM pg_index i
    WHERE i.indrelid = 'public.grades'::regclass
      AND i.indisunique
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM unnest(i.indkey::int2[]) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
      ) = ARRAY['category', 'date', 'homebase_id', 'project']
  LOOP
    -- A primary key over those columns is left alone: dropping it would take
    -- the table's identity with it. It would still block retakes, so if this
    -- notice ever fires the key needs redesigning by hand.
    IF EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = idx AND c.contype = 'p') THEN
      RAISE NOTICE 'grades: primary key covers (homebase_id, project, category, date); left as-is — retakes will still be rejected';
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
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Add score to the key, scoped to active rows
-- ----------------------------------------------------------------------------
-- Retakes differ by score, so they no longer collide. Restricting the index to
-- active rows means a soft-deleted grade can be re-entered as-is.
--
-- NULLS NOT DISTINCT so a missing project/category/score still counts as a
-- collision — the default (NULLs always distinct) would wave those rows past.
DO $$
DECLARE
  dup_groups bigint;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = 'public.grades'::regclass
      AND i.indisunique
      AND i.indpred IS NOT NULL
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM unnest(i.indkey::int2[]) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
      ) = ARRAY['category', 'date', 'homebase_id', 'project', 'score']
  ) THEN
    RAISE NOTICE 'grades: active-row uniqueness on (homebase_id, project, category, date, score) already present';
    RETURN;
  END IF;

  -- Fail loudly rather than half-applying: duplicates have to be resolved by a
  -- human, since which copy to keep is a judgement call.
  SELECT count(*) INTO dup_groups FROM (
    SELECT 1 FROM public.grades WHERE is_active
    GROUP BY homebase_id, project, category, date, score
    HAVING count(*) > 1
  ) d;

  IF dup_groups > 0 THEN
    RAISE EXCEPTION USING
      MESSAGE = format('grades: %s duplicate active row group(s) block the new uniqueness key', dup_groups),
      HINT = 'List them with: SELECT homebase_id, project, category, date, score, count(*) FROM public.grades WHERE is_active GROUP BY 1,2,3,4,5 HAVING count(*) > 1;  Delete or correct the extras, then re-run this migration.';
  END IF;

  CREATE UNIQUE INDEX grades_student_project_category_date_score_key
    ON public.grades (homebase_id, project, category, date, score)
    NULLS NOT DISTINCT
    WHERE is_active;
END $$;

-- Every read path filters on is_active and orders by date.
CREATE INDEX IF NOT EXISTS grades_active_idx
  ON public.grades (homebase_id, date DESC)
  WHERE is_active;

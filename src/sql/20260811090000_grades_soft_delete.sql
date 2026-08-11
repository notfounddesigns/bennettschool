-- ============================================================================
-- Migration 5: grades soft delete
-- ============================================================================
-- Deleting a grade from the portal must not destroy the record — the row stays
-- and is_active flips to false, so an accidental delete is recoverable and the
-- history is still there for reporting. Every existing row is live, so the
-- column backfills to true.
--
-- The old uniqueness key (homebase_id, project, category, date) counted
-- soft-deleted rows, which would block re-entering a grade after deleting it.
-- It is replaced with the same key scoped to active rows only.
-- ============================================================================

ALTER TABLE public.grades
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.grades
  DROP CONSTRAINT grades_student_project_category_date_key;

CREATE UNIQUE INDEX grades_student_project_category_date_key
  ON public.grades (homebase_id, project, category, date)
  WHERE is_active;

-- Every read path filters on is_active and orders by date.
CREATE INDEX grades_active_idx
  ON public.grades (homebase_id, date DESC)
  WHERE is_active;

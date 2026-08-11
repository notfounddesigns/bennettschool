-- ============================================================================
-- de_hours: soft delete via is_active
-- ============================================================================
--
-- Replaces the hours = -1 soft-delete sentinel with an explicit is_active flag.
-- The sentinel overwrote the row's hours value, so a removal destroyed the
-- original number and could not be undone; it also collided with the
-- hours >= 0 filters that every read had to remember to apply.

-- 1. The column ------------------------------------------------------------

ALTER TABLE public.de_hours
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2. Backfill previously "removed" rows ------------------------------------
--
-- Rows carrying the old sentinel become inactive. Their original hours value is
-- not recoverable — it was overwritten with -1 at removal time.

UPDATE public.de_hours SET is_active = false WHERE hours < 0;

-- 3. Index for the read path -----------------------------------------------
--
-- Every read filters homebase_id together with is_active.

CREATE INDEX IF NOT EXISTS de_hours_homebase_active_idx
  ON public.de_hours (homebase_id, is_active);


-- ============================================================================
-- 4. RLS — CHECK THIS BEFORE ASSUMING THE APP BUGS ARE FIXED
-- ============================================================================
--
-- The app has no Supabase auth session: login goes through the `auth-login`
-- edge function and every browser request carries the publishable key, so all
-- reads and writes run as the `anon` role. If `de_hours` has RLS enabled
-- without anon INSERT/UPDATE policies, then:
--
--   * inserts fail with 401/42501 — this is the "save failed" on new entries;
--   * updates match zero rows and return 200 with an empty body, so a removal
--     reports success and changes nothing — this is "DE hours are not deleting".
--
-- Adding is_active does not fix either of those. Compare de_hours against
-- `hours`, which the same code paths wrote to successfully before the switch:
--
--   SELECT relname, relrowsecurity
--   FROM pg_class
--   WHERE relname IN ('hours', 'de_hours');
--
--   SELECT tablename, policyname, roles, cmd, qual, with_check
--   FROM pg_policies
--   WHERE tablename IN ('hours', 'de_hours')
--   ORDER BY tablename, cmd;
--
-- If `hours` has anon policies that `de_hours` lacks, mirror them. The
-- statements below are the shape to use — uncomment and align the role and
-- predicates with whatever `hours` actually has rather than applying blind,
-- since these grant the browser client unrestricted write access to the table.
--
-- ALTER TABLE public.de_hours ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "anon read de_hours"   ON public.de_hours
--   FOR SELECT TO anon USING (true);
-- CREATE POLICY "anon insert de_hours" ON public.de_hours
--   FOR INSERT TO anon WITH CHECK (true);
-- CREATE POLICY "anon update de_hours" ON public.de_hours
--   FOR UPDATE TO anon USING (true) WITH CHECK (true);


-- ============================================================================
-- 5. Other things that would produce "save failed" on insert
-- ============================================================================
--
-- If the policies match and inserts still fail, the payload and the schema
-- disagree. The app sends exactly: homebase_id, date, hours, module, platform,
-- verified. Look for a NOT NULL column with no default that is missing from
-- that list (a copied type_id is the likely candidate), or a CHECK constraint
-- rejecting the value — `hours` carries hours_positive_check (hours > 0), and a
-- copy of it on de_hours would also have blocked the old hours = -1 removal:
--
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'de_hours'
--   ORDER BY ordinal_position;
--
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.de_hours'::regclass;
--
-- The client now surfaces PostgREST's own message instead of a bare
-- "Save failed", so the failing constraint should name itself in the UI.


-- ============================================================================
-- 6. Re-run monthly_hours_view after this file
-- ============================================================================
--
-- 20260811120000_monthly_hours_view.sql now filters de_daily on `d.is_active`
-- instead of `d.hours >= 0`, so it has to be applied after this migration adds
-- the column. If the view was already created against the old predicate, re-run
-- that file or the export keeps counting removed rows.

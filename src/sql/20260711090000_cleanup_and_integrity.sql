-- ============================================================================
-- Migration 1: Cleanup, type unification, and integrity constraints
-- ============================================================================
-- Run order matters. This migration must run before the timeclock_intervals
-- migration.
--
-- PRE-FLIGHT CHECKS (run these manually first; the migration fails loudly if
-- data violates the new constraints, which is intentional):
--
--   -- Duplicate grades that would violate the new unique constraint:
--   SELECT homebase_id, project, category, date, count(*)
--   FROM grades GROUP BY 1,2,3,4 HAVING count(*) > 1;
--
--   -- hours rows that would violate NOT NULL / CHECK:
--   SELECT count(*) FROM hours
--   WHERE homebase_id IS NULL OR hours IS NULL OR hours <= 0;
--
--   -- Duplicate hours rows that would violate the idempotent-sync unique index:
--   SELECT homebase_id, date, type_id, module, platform, count(*)
--   FROM hours GROUP BY 1,2,3,4,5 HAVING count(*) > 1;
--
--   -- needs_attention_items rows referencing profiles that don't exist:
--   SELECT n.* FROM needs_attention_items n
--   LEFT JOIN profiles p ON p.homebase_id = n.homebase_id
--   WHERE p.homebase_id IS NULL;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Drop dead migration artifacts
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.hours_new;
DROP TABLE IF EXISTS public.hours_bkup;

-- ----------------------------------------------------------------------------
-- 2. Lookup tables: make type_id / role_id the real primary keys
-- ----------------------------------------------------------------------------
-- hour_types: drop unused identity id, promote type_id to PK
ALTER TABLE public.hour_types DROP CONSTRAINT hour_types_pkey;
ALTER TABLE public.hour_types DROP COLUMN id;
ALTER TABLE public.hour_types ADD CONSTRAINT hour_types_pkey PRIMARY KEY (type_id);
ALTER TABLE public.hour_types ADD CONSTRAINT hour_types_name_key UNIQUE (name);

-- roles: same treatment
ALTER TABLE public.roles DROP CONSTRAINT roles_pkey;
ALTER TABLE public.roles DROP COLUMN id;
ALTER TABLE public.roles ALTER COLUMN role_id SET NOT NULL;
ALTER TABLE public.roles ALTER COLUMN role_name SET NOT NULL;
ALTER TABLE public.roles ADD CONSTRAINT roles_pkey PRIMARY KEY (role_id);
ALTER TABLE public.roles ADD CONSTRAINT roles_role_name_key UNIQUE (role_name);

-- ----------------------------------------------------------------------------
-- 3. Unify homebase_id on bigint everywhere
-- ----------------------------------------------------------------------------
-- Dependent FKs must be dropped before altering the referenced column type.
ALTER TABLE public.hours DROP CONSTRAINT fk_hours_profile;
ALTER TABLE public.timeclock_entries
  DROP CONSTRAINT timeclock_entries_homebase_id_fkey;

ALTER TABLE public.profiles
  ALTER COLUMN homebase_id TYPE bigint USING homebase_id::bigint;
ALTER TABLE public.hours
  ALTER COLUMN homebase_id TYPE bigint USING homebase_id::bigint;
ALTER TABLE public.grades
  ALTER COLUMN homebase_id TYPE bigint USING homebase_id::bigint;

-- Re-add the FKs against the retyped column
ALTER TABLE public.hours
  ADD CONSTRAINT hours_homebase_id_fkey
  FOREIGN KEY (homebase_id) REFERENCES public.profiles(homebase_id);
ALTER TABLE public.timeclock_entries
  ADD CONSTRAINT timeclock_entries_homebase_id_fkey
  FOREIGN KEY (homebase_id) REFERENCES public.profiles(homebase_id);

-- ----------------------------------------------------------------------------
-- 4. Missing foreign keys
-- ----------------------------------------------------------------------------
ALTER TABLE public.grades
  ADD CONSTRAINT grades_homebase_id_fkey
  FOREIGN KEY (homebase_id) REFERENCES public.profiles(homebase_id);

ALTER TABLE public.needs_attention_items
  ADD CONSTRAINT needs_attention_items_homebase_id_fkey
  FOREIGN KEY (homebase_id) REFERENCES public.profiles(homebase_id);

ALTER TABLE public.hours
  ADD CONSTRAINT hours_type_id_fkey
  FOREIGN KEY (type_id) REFERENCES public.hour_types(type_id);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_id_fkey
  FOREIGN KEY (role_id) REFERENCES public.roles(role_id);

-- ----------------------------------------------------------------------------
-- 5. grades: uniqueness (enables ON CONFLICT upserts)
-- ----------------------------------------------------------------------------
ALTER TABLE public.grades
  ADD CONSTRAINT grades_student_project_category_date_key
  UNIQUE (homebase_id, project, category, date);

-- ----------------------------------------------------------------------------
-- 6. hours: tighten nullability, sanity checks, idempotent-sync uniqueness
-- ----------------------------------------------------------------------------
ALTER TABLE public.hours ALTER COLUMN homebase_id SET NOT NULL;
ALTER TABLE public.hours ALTER COLUMN hours SET NOT NULL;
ALTER TABLE public.hours ALTER COLUMN date SET NOT NULL;
ALTER TABLE public.hours ADD CONSTRAINT hours_positive_check CHECK (hours > 0);

-- Unique index treats NULL module/platform as equal so re-running the sync
-- cannot double-insert. Requires PG15+ (Supabase is PG15+).
CREATE UNIQUE INDEX hours_sync_idempotency_key
  ON public.hours (homebase_id, date, type_id, module, platform)
  NULLS NOT DISTINCT;

CREATE INDEX hours_homebase_date_idx ON public.hours (homebase_id, date);

-- OPTIONAL (breaking rename — coordinate with app code before uncommenting):
-- the column is a timestamptz named "date", which invites bugs next to
-- timeclock date columns that are actual dates.
-- ALTER TABLE public.hours RENAME COLUMN date TO logged_at;

-- ----------------------------------------------------------------------------
-- 7. needs_attention_items: resolution tracking + operational indexes
-- ----------------------------------------------------------------------------
ALTER TABLE public.needs_attention_items
  ADD COLUMN resolved_by bigint REFERENCES public.profiles(homebase_id);

-- Fast dashboard query over open items only
CREATE INDEX needs_attention_open_idx
  ON public.needs_attention_items (homebase_id, date)
  WHERE NOT is_resolved;

-- The detector job cannot file duplicate open items for the same problem
CREATE UNIQUE INDEX needs_attention_open_unique
  ON public.needs_attention_items (homebase_id, date, type)
  WHERE NOT is_resolved;

-- NOTE: student_name stays for now, but reads should join to profiles.name.
-- Drop the column once the app no longer selects it:
-- ALTER TABLE public.needs_attention_items DROP COLUMN student_name;

-- ----------------------------------------------------------------------------
-- 8. audit_log: indexes it will need as it grows
-- ----------------------------------------------------------------------------
CREATE INDEX audit_log_created_at_idx ON public.audit_log (created_at DESC);
CREATE INDEX audit_log_actor_idx ON public.audit_log (actor_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 9. sync_log: distinguish "failed" from "nothing to sync"
-- ----------------------------------------------------------------------------
ALTER TABLE public.sync_log
  ADD COLUMN status text NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'partial', 'failed')),
  ADD COLUMN error text;

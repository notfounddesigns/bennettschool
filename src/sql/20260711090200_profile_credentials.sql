-- ============================================================================
-- Migration 3: Split credentials out of profiles
-- ============================================================================
-- BREAKING for any code that reads password_hash / pin_hash from profiles.
-- Update auth code paths to read from profile_credentials before applying,
-- or apply and update in the same deploy.
-- ============================================================================

CREATE TABLE public.profile_credentials (
  homebase_id bigint NOT NULL,
  password_hash text,
  pin_hash text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_credentials_pkey PRIMARY KEY (homebase_id),
  CONSTRAINT profile_credentials_homebase_id_fkey
    FOREIGN KEY (homebase_id) REFERENCES public.profiles(homebase_id)
    ON DELETE CASCADE
);

-- Only carry over rows that actually have a credential set
INSERT INTO public.profile_credentials (homebase_id, password_hash, pin_hash)
SELECT homebase_id, password_hash, pin_hash
FROM public.profiles
WHERE password_hash IS NOT NULL OR pin_hash IS NOT NULL;

ALTER TABLE public.profiles DROP COLUMN password_hash;
ALTER TABLE public.profiles DROP COLUMN pin_hash;

-- Lock the credentials table down hard: no client access at all.
-- Only the service role (which bypasses RLS) can touch it.
ALTER TABLE public.profile_credentials ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: RLS enabled + zero policies = deny all
-- for anon/authenticated clients.

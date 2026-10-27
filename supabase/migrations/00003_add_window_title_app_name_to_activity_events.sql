-- 00003_add_window_title_app_name_to_activity_events.sql
-- Adds window_title and app_name columns to activity_events
-- and a timestamp column alias for the API route.

ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS window_title TEXT,
  ADD COLUMN IF NOT EXISTS app_name TEXT,
  ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ
    GENERATED ALWAYS AS (recorded_at) STORED;

-- Index for manager dashboard queries (org + timestamp range)
CREATE INDEX IF NOT EXISTS activity_events_org_recorded_idx
  ON public.activity_events (organization_id, recorded_at DESC);

-- Index for per-user timeline lookups
CREATE INDEX IF NOT EXISTS activity_events_user_recorded_idx
  ON public.activity_events (user_id, recorded_at DESC);

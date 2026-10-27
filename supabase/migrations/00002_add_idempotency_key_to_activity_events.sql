-- 00002_add_idempotency_key_to_activity_events.sql
-- Add idempotency_key to activity_events table for deduplicating sync batches

ALTER TABLE public.activity_events 
ADD COLUMN IF NOT EXISTS idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS activity_events_idempotency_key_idx 
ON public.activity_events (idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- 00007_preapproved_managers.sql
-- Allow pre-approved manager profile slots before auth account creation

-- 1. Ensure profiles.id has gen_random_uuid() default
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 2. Drop foreign key constraint from profiles.id to auth.users(id) if present
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'public.profiles'::regclass 
    AND confrelid = 'auth.users'::regclass 
    AND contype = 'f';
  
  IF fk_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.profiles DROP CONSTRAINT ' || quote_ident(fk_name);
  END IF;
END $$;

-- 3. Security Definer RPC to claim pre-approved manager slot
CREATE OR REPLACE FUNCTION public.claim_preapproved_manager(
  p_preapproved_id UUID,
  p_new_user_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_username TEXT
)
RETURNS JSONB AS $$
BEGIN
  -- 1. Insert/upsert profile for the new authenticated user first to satisfy foreign keys
  INSERT INTO public.profiles (id, email, full_name, username, role, approval_status, updated_at)
  VALUES (
    p_new_user_id,
    p_email,
    p_full_name,
    p_username,
    'manager',
    'approved',
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      username = EXCLUDED.username,
      role = 'manager',
      approval_status = 'approved',
      updated_at = now();

  -- 2. If distinct pre-approved slot, transfer related team records
  IF p_preapproved_id IS NOT NULL AND p_preapproved_id <> p_new_user_id THEN
    -- Transfer organization memberships
    UPDATE public.organization_members
    SET user_id = p_new_user_id
    WHERE user_id = p_preapproved_id;

    -- Transfer manager notifications
    UPDATE public.manager_notifications
    SET manager_id = p_new_user_id
    WHERE manager_id = p_preapproved_id;

    -- Transfer daily reports
    UPDATE public.daily_reports
    SET manager_id = p_new_user_id
    WHERE manager_id = p_preapproved_id;

    -- Transfer work sessions & time entries if any
    UPDATE public.work_sessions
    SET user_id = p_new_user_id
    WHERE user_id = p_preapproved_id;

    UPDATE public.time_entries
    SET user_id = p_new_user_id
    WHERE user_id = p_preapproved_id;

    -- Remove placeholder profile slot
    DELETE FROM public.profiles WHERE id = p_preapproved_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

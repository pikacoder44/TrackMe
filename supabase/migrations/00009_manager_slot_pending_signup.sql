-- Migration 00009: Add is_pending_signup tracking for pre-approved manager slots

-- 1. Add is_pending_signup column to public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_pending_signup BOOLEAN NOT NULL DEFAULT false;

-- 2. Mark any manager profile that does not exist in auth.users as pending sign-up
UPDATE public.profiles p
SET is_pending_signup = true
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
  AND (p.role = 'manager' OR p.approval_status = 'approved');

-- 3. Update claim_preapproved_manager function to set is_pending_signup = false
CREATE OR REPLACE FUNCTION public.claim_preapproved_manager(
  p_preapproved_id UUID,
  p_new_user_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_username TEXT
)
RETURNS JSONB AS $$
BEGIN
  -- 1. Insert/upsert profile for the new authenticated user
  INSERT INTO public.profiles (
    id, email, full_name, username, role, approval_status, is_pending_signup, updated_at
  )
  VALUES (
    p_new_user_id,
    p_email,
    p_full_name,
    p_username,
    'manager',
    'approved',
    false,
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      username = EXCLUDED.username,
      role = 'manager',
      approval_status = 'approved',
      is_pending_signup = false,
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

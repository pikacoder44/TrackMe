-- Migration 00008: Fix Profiles RLS for Manager Slots and Super Admin Provisioning

-- 1. Ensure RLS is enabled on public.profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Explicit RLS policy allowing Super Admins to insert any profile
DROP POLICY IF EXISTS "Allow super admins to insert any profile" ON public.profiles;
CREATE POLICY "Allow super admins to insert any profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
  )
);

-- 3. Explicit RLS policy allowing Super Admins to update any profile
DROP POLICY IF EXISTS "Allow super admins to update any profile" ON public.profiles;
CREATE POLICY "Allow super admins to update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
  )
);

-- 4. Explicit RLS policy allowing Super Admins to view all profiles
DROP POLICY IF EXISTS "Allow super admins to view all profiles" ON public.profiles;
CREATE POLICY "Allow super admins to view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
  )
);

-- 5. SECURITY DEFINER RPC to provision pre-approved manager slots safely
CREATE OR REPLACE FUNCTION public.provision_manager_slot(
  p_full_name TEXT,
  p_username TEXT,
  p_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_existing_id UUID;
  v_result JSONB;
BEGIN
  -- Verify caller is super admin
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Forbidden: Only super admins can provision manager slots.';
  END IF;

  -- Check existing profile
  SELECT id INTO v_existing_id
  FROM public.profiles
  WHERE lower(username) = lower(p_username) OR lower(email) = lower(p_email)
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.profiles
    SET full_name = COALESCE(p_full_name, full_name),
        role = 'manager',
        approval_status = 'approved',
        email = lower(p_email),
        username = lower(p_username)
    WHERE id = v_existing_id
    RETURNING jsonb_build_object(
      'id', id,
      'fullName', full_name,
      'username', username,
      'email', email
    ) INTO v_result;
  ELSE
    INSERT INTO public.profiles (
      id,
      full_name,
      username,
      email,
      role,
      approval_status
    )
    VALUES (
      gen_random_uuid(),
      p_full_name,
      lower(p_username),
      lower(p_email),
      'manager',
      'approved'
    )
    RETURNING jsonb_build_object(
      'id', id,
      'fullName', full_name,
      'username', username,
      'email', email
    ) INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_manager_slot(TEXT, TEXT, TEXT) TO authenticated;

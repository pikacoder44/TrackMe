-- 00005_super_admin_and_org_settings.sql
-- Migration: Add 'super_admin' role, require_approval setting to organizations, and Super Admin access policies

-- 1. Add 'super_admin' to user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';

-- 2. Add require_approval to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS require_approval BOOLEAN NOT NULL DEFAULT true;

-- 3. Add role column to profiles for global RBAC indexing
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'employee';

-- Sync profiles.role with organization_members role
UPDATE public.profiles p
SET role = m.role
FROM public.organization_members m
WHERE p.id = m.user_id AND m.role = 'owner';

-- 4. Function to check if authenticated user is a super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 5. Update join_org_by_team_code to respect organizations.require_approval
CREATE OR REPLACE FUNCTION public.join_org_by_team_code(p_user_id UUID, p_team_code TEXT)
RETURNS JSONB AS $$
DECLARE
  v_org_id UUID;
  v_org_name TEXT;
  v_require_approval BOOLEAN;
  v_status approval_status;
BEGIN
  SELECT id, name, COALESCE(require_approval, true)
  INTO v_org_id, v_org_name, v_require_approval
  FROM public.organizations
  WHERE UPPER(TRIM(team_code)) = UPPER(TRIM(p_team_code))
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid team secret code.');
  END IF;

  IF v_require_approval THEN
    v_status := 'pending';
  ELSE
    v_status := 'approved';
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role, approval_status)
  VALUES (v_org_id, p_user_id, 'employee', v_status)
  ON CONFLICT (organization_id, user_id) DO UPDATE
  SET approval_status = CASE 
        WHEN public.organization_members.approval_status = 'approved' THEN 'approved'
        ELSE v_status
      END,
      updated_at = timezone('utc'::text, now());

  UPDATE public.profiles
  SET approval_status = CASE 
        WHEN public.profiles.approval_status = 'approved' THEN 'approved'
        ELSE v_status
      END,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true, 
    'organization_id', v_org_id, 
    'organization_name', v_org_name,
    'approval_status', v_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RLS Policies: Allow super_admin global visibility and management
DROP POLICY IF EXISTS "Super Admins can view all organizations" ON public.organizations;
CREATE POLICY "Super Admins can view all organizations"
ON public.organizations FOR SELECT
USING (public.is_super_admin());

DROP POLICY IF EXISTS "Super Admins can insert organizations" ON public.organizations;
CREATE POLICY "Super Admins can insert organizations"
ON public.organizations FOR INSERT
WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Super Admins can update all organizations" ON public.organizations;
CREATE POLICY "Super Admins can update all organizations"
ON public.organizations FOR UPDATE
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Super Admins can view all members" ON public.organization_members;
CREATE POLICY "Super Admins can view all members"
ON public.organization_members FOR SELECT
USING (public.is_super_admin());

DROP POLICY IF EXISTS "Super Admins can manage all members" ON public.organization_members;
CREATE POLICY "Super Admins can manage all members"
ON public.organization_members FOR ALL
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

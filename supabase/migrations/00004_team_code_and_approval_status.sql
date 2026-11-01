-- 00004_team_code_and_approval_status.sql
-- Migration: Add team_code to organizations, approval_status and username to profiles and organization_members

-- 1. Ensure approval_status enum exists
DO $$ BEGIN
  CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Add team_code to organizations
ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS team_code TEXT UNIQUE;

-- 3. Add username and approval_status to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS approval_status approval_status NOT NULL DEFAULT 'pending';

-- 4. Add approval_status to organization_members
ALTER TABLE public.organization_members 
  ADD COLUMN IF NOT EXISTS approval_status approval_status NOT NULL DEFAULT 'pending';

-- 5. Helper function to generate a random 6-character team code (e.g. TRACK-8821)
CREATE OR REPLACE FUNCTION public.generate_team_code()
RETURNS TEXT AS $$
DECLARE
  new_code TEXT;
  exists_code BOOLEAN;
BEGIN
  LOOP
    new_code := 'TRACK-' || lpad(floor(random() * 9000 + 1000)::text, 4, '0');
    SELECT EXISTS (SELECT 1 FROM public.organizations WHERE team_code = new_code) INTO exists_code;
    IF NOT exists_code THEN
      RETURN new_code;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 6. Populate default/existing organizations with team_code if null
UPDATE public.organizations 
SET team_code = public.generate_team_code() 
WHERE team_code IS NULL;

-- Make sure existing owners, admins, and managers are marked as approved
UPDATE public.organization_members
SET approval_status = 'approved'
WHERE approval_status IS NULL OR role IN ('owner', 'admin', 'manager');

UPDATE public.profiles
SET approval_status = 'approved'
WHERE id IN (
  SELECT user_id FROM public.organization_members WHERE role IN ('owner', 'admin', 'manager')
);

-- 7. Update handle_new_user trigger to populate username and approval_status
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, username, approval_status)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'username',
    COALESCE((new.raw_user_meta_data->>'approval_status')::approval_status, 'pending')
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
      username = COALESCE(EXCLUDED.username, public.profiles.username),
      updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Security Definer RPC: Resolve email by username (case-insensitive) for login
CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username TEXT)
RETURNS TEXT AS $$
  SELECT email FROM public.profiles 
  WHERE LOWER(username) = LOWER(TRIM(p_username)) 
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 9. Security Definer RPC: Verify team code
CREATE OR REPLACE FUNCTION public.verify_team_code(p_team_code TEXT)
RETURNS TABLE (organization_id UUID, organization_name TEXT) AS $$
  SELECT id, name FROM public.organizations 
  WHERE UPPER(TRIM(team_code)) = UPPER(TRIM(p_team_code)) 
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 10. Security Definer RPC: Join user to organization via team code
CREATE OR REPLACE FUNCTION public.join_org_by_team_code(p_user_id UUID, p_team_code TEXT)
RETURNS JSONB AS $$
DECLARE
  v_org_id UUID;
  v_org_name TEXT;
BEGIN
  SELECT id, name INTO v_org_id, v_org_name
  FROM public.organizations
  WHERE UPPER(TRIM(team_code)) = UPPER(TRIM(p_team_code))
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid team secret code.');
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role, approval_status)
  VALUES (v_org_id, p_user_id, 'employee', 'pending')
  ON CONFLICT (organization_id, user_id) DO UPDATE
  SET approval_status = 'pending',
      updated_at = timezone('utc'::text, now());

  UPDATE public.profiles
  SET approval_status = 'pending',
      updated_at = timezone('utc'::text, now())
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'organization_id', v_org_id, 'organization_name', v_org_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Allow managers to manage organization members (including approval_status)
DROP POLICY IF EXISTS "Owners, admins, and managers can manage organization members" ON public.organization_members;
CREATE POLICY "Owners, admins, and managers can manage organization members"
ON public.organization_members FOR ALL
USING (
  public.is_org_member(organization_id) AND
  public.get_user_role(organization_id) IN ('owner', 'admin', 'manager')
)
WITH CHECK (
  public.is_org_member(organization_id) AND
  public.get_user_role(organization_id) IN ('owner', 'admin', 'manager')
);

-- 12. Allow managers to update team_code for their organization
DROP POLICY IF EXISTS "Owners, admins, and managers can update their organization" ON public.organizations;
CREATE POLICY "Owners, admins, and managers can update their organization"
ON public.organizations FOR UPDATE
USING (
  public.is_org_member(id) AND
  public.get_user_role(id) IN ('owner', 'admin', 'manager')
)
WITH CHECK (
  public.is_org_member(id) AND
  public.get_user_role(id) IN ('owner', 'admin', 'manager')
);

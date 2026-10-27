-- 00001_initial_schema.sql
-- Initial schema for TrackMe with Multi-Tenant Organization Isolation and RLS

-- 1. Create Custom ENUM Types
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('owner', 'admin', 'manager', 'employee');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE session_status AS ENUM ('active', 'paused', 'completed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE time_entry_type AS ENUM ('manual', 'automatic', 'break');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Organizations Table
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Profiles Table (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Organization Members (roles: owner, admin, manager, employee)
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'employee',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(organization_id, user_id)
);

-- 5. Projects Table
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. Work Sessions Table (clock-in, clock-out, status)
CREATE TABLE IF NOT EXISTS public.work_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  status session_status NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  ended_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Unique partial index to ensure only one active or paused session per user at any time
CREATE UNIQUE INDEX IF NOT EXISTS unique_user_open_session_idx 
ON public.work_sessions (user_id) 
WHERE (status IN ('active', 'paused'));

-- 7. Time Entries Table
CREATE TABLE IF NOT EXISTS public.time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.work_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  entry_type time_entry_type NOT NULL DEFAULT 'automatic',
  approval_status approval_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. Activity Events Table
CREATE TABLE IF NOT EXISTS public.activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.work_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. Trigger for New User Profile Auto-Creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
      updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 10. Security Definer Helper Functions for RLS
CREATE OR REPLACE FUNCTION public.is_org_member(lookup_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.organization_members
    WHERE organization_id = lookup_org_id 
      AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_org_ids()
RETURNS SETOF UUID AS $$
BEGIN
  RETURN QUERY
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_role(lookup_org_id UUID)
RETURNS user_role AS $$
  SELECT role
  FROM public.organization_members
  WHERE organization_id = lookup_org_id 
    AND user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 11. Enable Row Level Security (RLS)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

-- 12. RLS Policies

-- Profiles
DROP POLICY IF EXISTS "Users can view own profile or org member profiles" ON public.profiles;
CREATE POLICY "Users can view own profile or org member profiles"
ON public.profiles FOR SELECT
USING (
  id = auth.uid() OR
  id IN (
    SELECT om.user_id 
    FROM public.organization_members om
    WHERE om.organization_id IN (SELECT public.get_user_org_ids())
  )
);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
WITH CHECK (id = auth.uid());

-- Organizations
DROP POLICY IF EXISTS "Members can view their organizations" ON public.organizations;
CREATE POLICY "Members can view their organizations"
ON public.organizations FOR SELECT
USING (public.is_org_member(id));

DROP POLICY IF EXISTS "Owners and admins can update their organization" ON public.organizations;
CREATE POLICY "Owners and admins can update their organization"
ON public.organizations FOR UPDATE
USING (
  public.is_org_member(id) AND
  public.get_user_role(id) IN ('owner', 'admin')
)
WITH CHECK (
  public.is_org_member(id) AND
  public.get_user_role(id) IN ('owner', 'admin')
);

DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
CREATE POLICY "Authenticated users can create organizations"
ON public.organizations FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Organization Members
DROP POLICY IF EXISTS "Members can view members in their organizations" ON public.organization_members;
CREATE POLICY "Members can view members in their organizations"
ON public.organization_members FOR SELECT
USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Owners and admins can manage organization members" ON public.organization_members;
CREATE POLICY "Owners and admins can manage organization members"
ON public.organization_members FOR ALL
USING (
  public.is_org_member(organization_id) AND
  public.get_user_role(organization_id) IN ('owner', 'admin')
)
WITH CHECK (
  public.is_org_member(organization_id) AND
  public.get_user_role(organization_id) IN ('owner', 'admin')
);

DROP POLICY IF EXISTS "First member (creator) can add themselves as owner" ON public.organization_members;
CREATE POLICY "First member (creator) can add themselves as owner"
ON public.organization_members FOR INSERT
WITH CHECK (
  user_id = auth.uid()
);

-- Projects
DROP POLICY IF EXISTS "Members can view organization projects" ON public.projects;
CREATE POLICY "Members can view organization projects"
ON public.projects FOR SELECT
USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Owners, admins, and managers can manage projects" ON public.projects;
CREATE POLICY "Owners, admins, and managers can manage projects"
ON public.projects FOR ALL
USING (
  public.is_org_member(organization_id) AND
  public.get_user_role(organization_id) IN ('owner', 'admin', 'manager')
)
WITH CHECK (
  public.is_org_member(organization_id) AND
  public.get_user_role(organization_id) IN ('owner', 'admin', 'manager')
);

-- Work Sessions
DROP POLICY IF EXISTS "Members can view their own sessions or managers/admins can view org sessions" ON public.work_sessions;
CREATE POLICY "Members can view their own sessions or managers/admins can view org sessions"
ON public.work_sessions FOR SELECT
USING (
  public.is_org_member(organization_id) AND (
    user_id = auth.uid() OR
    public.get_user_role(organization_id) IN ('owner', 'admin', 'manager')
  )
);

DROP POLICY IF EXISTS "Users can insert their own work sessions in member orgs" ON public.work_sessions;
CREATE POLICY "Users can insert their own work sessions in member orgs"
ON public.work_sessions FOR INSERT
WITH CHECK (
  public.is_org_member(organization_id) AND
  user_id = auth.uid()
);

DROP POLICY IF EXISTS "Users can update their own work sessions or managers can update" ON public.work_sessions;
CREATE POLICY "Users can update their own work sessions or managers can update"
ON public.work_sessions FOR UPDATE
USING (
  public.is_org_member(organization_id) AND (
    user_id = auth.uid() OR
    public.get_user_role(organization_id) IN ('owner', 'admin', 'manager')
  )
)
WITH CHECK (
  public.is_org_member(organization_id) AND (
    user_id = auth.uid() OR
    public.get_user_role(organization_id) IN ('owner', 'admin', 'manager')
  )
);

-- Time Entries
DROP POLICY IF EXISTS "Members can view own entries or managers/admins can view org entries" ON public.time_entries;
CREATE POLICY "Members can view own entries or managers/admins can view org entries"
ON public.time_entries FOR SELECT
USING (
  public.is_org_member(organization_id) AND (
    user_id = auth.uid() OR
    public.get_user_role(organization_id) IN ('owner', 'admin', 'manager')
  )
);

DROP POLICY IF EXISTS "Users can create their own time entries" ON public.time_entries;
CREATE POLICY "Users can create their own time entries"
ON public.time_entries FOR INSERT
WITH CHECK (
  public.is_org_member(organization_id) AND
  user_id = auth.uid()
);

DROP POLICY IF EXISTS "Users can update own entries or managers can approve/update" ON public.time_entries;
CREATE POLICY "Users can update own entries or managers can approve/update"
ON public.time_entries FOR UPDATE
USING (
  public.is_org_member(organization_id) AND (
    user_id = auth.uid() OR
    public.get_user_role(organization_id) IN ('owner', 'admin', 'manager')
  )
)
WITH CHECK (
  public.is_org_member(organization_id) AND (
    user_id = auth.uid() OR
    public.get_user_role(organization_id) IN ('owner', 'admin', 'manager')
  )
);

-- Activity Events
DROP POLICY IF EXISTS "Members can view their own activity or managers/admins can view org activity" ON public.activity_events;
CREATE POLICY "Members can view their own activity or managers/admins can view org activity"
ON public.activity_events FOR SELECT
USING (
  public.is_org_member(organization_id) AND (
    user_id = auth.uid() OR
    public.get_user_role(organization_id) IN ('owner', 'admin', 'manager')
  )
);

DROP POLICY IF EXISTS "Users can insert their own activity events" ON public.activity_events;
CREATE POLICY "Users can insert their own activity events"
ON public.activity_events FOR INSERT
WITH CHECK (
  public.is_org_member(organization_id) AND
  user_id = auth.uid()
);

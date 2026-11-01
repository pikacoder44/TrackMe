-- 00006_daily_reports_and_team_colors.sql
-- Migration: Add team color accent, daily_reports table, and manager_notifications table

-- 1. Add color column to public.organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#3B82F6';

-- 2. Create public.daily_reports table
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Index for speedy daily lookup
CREATE INDEX IF NOT EXISTS idx_daily_reports_org_date 
  ON public.daily_reports(organization_id, report_date);

-- 3. Create public.manager_notifications table for 24-hour cool-down tracking
CREATE TABLE IF NOT EXISTS public.manager_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  notified_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_manager_notifications_mgr_time 
  ON public.manager_notifications(manager_id, notified_at DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manager_notifications ENABLE ROW LEVEL SECURITY;

-- Super admins and organization members can view reports
DROP POLICY IF EXISTS "Members and super admins can view daily reports" ON public.daily_reports;
CREATE POLICY "Members and super admins can view daily reports"
ON public.daily_reports FOR SELECT
USING (
  public.is_super_admin() OR public.is_org_member(organization_id)
);

-- Managers and super admins can insert daily reports
DROP POLICY IF EXISTS "Managers and super admins can upload daily reports" ON public.daily_reports;
CREATE POLICY "Managers and super admins can upload daily reports"
ON public.daily_reports FOR INSERT
WITH CHECK (
  public.is_super_admin() OR (
    public.is_org_member(organization_id) AND
    public.get_user_role(organization_id) IN ('owner', 'admin', 'manager', 'super_admin')
  )
);

-- Super admins can view and record manager notifications
DROP POLICY IF EXISTS "Super admins can manage manager notifications" ON public.manager_notifications;
CREATE POLICY "Super admins can manage manager notifications"
ON public.manager_notifications FOR ALL
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Managers can view own notifications" ON public.manager_notifications;
CREATE POLICY "Managers can view own notifications"
ON public.manager_notifications FOR SELECT
USING (manager_id = auth.uid());

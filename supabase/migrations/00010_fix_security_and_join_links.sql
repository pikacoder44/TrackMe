-- Migration 00010: Fix organization_members RLS – owner self-insert allowed only when no owner exists yet

-- Replace the permissive "First member (creator) can add themselves as owner" policy
-- with one that enforces the organization truly has no members yet, preventing
-- a logged-in user from inserting themselves as 'owner' into an existing organization.

DROP POLICY IF EXISTS "First member (creator) can add themselves as owner" ON public.organization_members;

CREATE POLICY "First member (creator) can add themselves as owner"
ON public.organization_members FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = organization_members.organization_id
  )
);


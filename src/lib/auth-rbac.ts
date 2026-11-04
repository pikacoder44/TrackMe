import type { SupabaseClient, User } from '@supabase/supabase-js'

export type SystemRole = 'super_admin' | 'manager' | 'employee'
export type LegacyRole = 'owner' | 'admin' | 'manager' | 'employee' | 'super_admin'

/**
 * Maps system and legacy roles to standard redirect destinations.
 * - super_admin -> /admin/dashboard
 * - manager (including owner/admin) -> /dashboard
 * - employee -> /install
 */
export function getRoleHome(role: string | null | undefined): string {
  if (!role) return '/login'
  const normalized = role.toLowerCase().trim()
  if (normalized === 'super_admin') return '/admin/dashboard'
  if (['manager', 'owner', 'admin', 'employee'].includes(normalized)) return '/dashboard'
  return '/dashboard'
}

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role?.toLowerCase().trim() === 'super_admin'
}

export function isManager(role: string | null | undefined): boolean {
  if (!role) return false
  const normalized = role.toLowerCase().trim()
  return ['manager', 'owner', 'admin', 'super_admin'].includes(normalized)
}

export function isEmployee(role: string | null | undefined): boolean {
  return role?.toLowerCase().trim() === 'employee'
}

/**
 * Resolves the effective system role for a user.
 * Checks profile role first, then organization_memberships.
 */
export async function resolveUserSystemRole(
  supabase: SupabaseClient,
  user: User
): Promise<{
  role: SystemRole
  organizationId: string | null
  approvalStatus: 'approved' | 'pending' | 'rejected'
}> {
  // 1. Check profile role and metadata
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, approval_status')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role === 'super_admin') {
    return {
      role: 'super_admin',
      organizationId: null,
      approvalStatus: 'approved',
    }
  }

  // 2. Check organization_members
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id, role, approval_status')
    .eq('user_id', user.id)

  if (memberships && memberships.length > 0) {
    const hasSuperAdmin = memberships.some((m) => m.role === 'super_admin')
    if (hasSuperAdmin) {
      return {
        role: 'super_admin',
        organizationId: memberships[0].organization_id,
        approvalStatus: 'approved',
      }
    }

    const managerMembership = memberships.find((m) =>
      ['manager', 'owner', 'admin'].includes(m.role)
    )
    if (managerMembership) {
      return {
        role: 'manager',
        organizationId: managerMembership.organization_id,
        approvalStatus: (managerMembership.approval_status as 'approved' | 'pending' | 'rejected') || 'approved',
      }
    }

    const first = memberships[0]
    return {
      role: 'employee',
      organizationId: first.organization_id,
      approvalStatus: (first.approval_status as 'approved' | 'pending' | 'rejected') || 'pending',
    }
  }

  return {
    role: (profile?.role as SystemRole) || 'employee',
    organizationId: null,
    approvalStatus: (profile?.approval_status as 'approved' | 'pending' | 'rejected') || 'pending',
  }
}

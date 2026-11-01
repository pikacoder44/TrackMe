import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveUserSystemRole } from '@/lib/auth-rbac'
import { AdminDashboardClient } from './admin-dashboard-client'
import { getCandidateManagers } from './actions'

interface ProfileData {
  id: string
  full_name: string | null
  username: string | null
  email: string
  role?: string
  approval_status?: string | null
  is_pending_signup?: boolean | null
}

interface MemberRecord {
  id: string
  organization_id: string
  user_id: string
  role: string
  approval_status: string | null
  created_at: string
  profile?: ProfileData | null
}

interface DailyReportRecord {
  id: string
  organization_id: string
  manager_id: string
  file_url: string
  file_name: string
  report_date: string
  created_at: string
}

interface NotificationRecord {
  id: string
  manager_id: string
  organization_id: string | null
  notified_at: string
}

export default async function AdminDashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { role } = await resolveUserSystemRole(supabase, user)
  if (role !== 'super_admin') {
    redirect(role === 'manager' ? '/dashboard' : '/install')
  }

  const adminClient = createAdminClient()
  const db = adminClient || supabase

  const todayStr = new Date().toISOString().slice(0, 10)
  // eslint-disable-next-line react-hooks/purity
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Fetch organizations, members, today's reports, notifications, candidate managers, and profiles
  const [orgsResult, membersResult, reportsResult, noticesResult, candidateManagers, profilesResult] = await Promise.all([
    db
      .from('organizations')
      .select('id, name, slug, team_code, color, created_at')
      .order('name'),
    db
      .from('organization_members')
      .select('id, organization_id, user_id, role, approval_status, created_at'),
    db
      .from('daily_reports')
      .select('id, organization_id, manager_id, file_url, file_name, report_date, created_at')
      .eq('report_date', todayStr),
    db
      .from('manager_notifications')
      .select('id, manager_id, organization_id, notified_at')
      .gte('notified_at', twentyFourHoursAgo)
      .order('notified_at', { ascending: false }),
    getCandidateManagers(),
    db
      .from('profiles')
      .select('id, full_name, username, email, role, approval_status, is_pending_signup'),
  ])

  const rawOrgs = orgsResult.data || []
  const rawMembers = (membersResult.data as unknown as MemberRecord[]) || []
  const rawReports = (reportsResult.data as DailyReportRecord[]) || []
  const rawNotices = (noticesResult.data as NotificationRecord[]) || []
  const rawProfiles = (profilesResult.data as ProfileData[]) || []

  // Build a lookup map of profiles by user_id to match members without requiring an inner join on auth.users
  const profilesMap = new Map<string, ProfileData>()
  rawProfiles.forEach((p) => {
    profilesMap.set(p.id, p)
  })

  // Supplement map with candidate managers
  candidateManagers.forEach((c) => {
    if (!profilesMap.has(c.id)) {
      profilesMap.set(c.id, {
        id: c.id,
        full_name: c.fullName,
        username: c.username,
        email: c.email,
        role: 'manager',
        approval_status: 'approved',
        is_pending_signup: c.isPendingSignup,
      })
    }
  })

  // Transform data for the interactive accordion
  const teams = rawOrgs.map((org) => {
    const orgMembers = rawMembers.filter((m) => m.organization_id === org.id)

    // Exclude platform roles from team roster counting
    const isExcludedRole = (r: string) => r === 'super_admin' || r === 'owner'

    // Find primary manager for this team (strictly excluding super_admin and owner)
    const managerMember = orgMembers.find(
      (m) => !isExcludedRole(m.role) && (m.role === 'manager' || m.role === 'admin')
    )

    let managerInfo = null
    if (managerMember) {
      const mgrId = managerMember.user_id
      const matchedProfile = profilesMap.get(mgrId) || managerMember.profile || null

      if (matchedProfile) {
        const todayReport = rawReports.find(
          (r) => r.organization_id === org.id && r.manager_id === mgrId
        )
        const recentNotice = rawNotices.find(
          (n) => n.manager_id === mgrId && (!n.organization_id || n.organization_id === org.id)
        )

        managerInfo = {
          userId: mgrId,
          fullName: matchedProfile.full_name || matchedProfile.username || (matchedProfile.email ? matchedProfile.email.split('@')[0] : 'Manager'),
          username: matchedProfile.username || (matchedProfile.email ? matchedProfile.email.split('@')[0] : 'manager'),
          email: matchedProfile.email || '',
          isPendingSignup: Boolean(matchedProfile.is_pending_signup),
          hasUploadedToday: Boolean(todayReport),
          todayReport: todayReport
            ? {
                id: todayReport.id,
                fileUrl: todayReport.file_url,
                fileName: todayReport.file_name,
                createdAt: todayReport.created_at,
              }
            : null,
          isNotifiedToday: Boolean(recentNotice),
          lastNotifiedAt: recentNotice ? recentNotice.notified_at : null,
        }
      }
    }

    const employeeMembers = orgMembers
      .filter((m) => !isExcludedRole(m.role) && m.role === 'employee')
      .map((m) => {
        const prof = profilesMap.get(m.user_id) || m.profile || null
        return {
          id: m.id,
          userId: m.user_id,
          fullName: prof?.full_name || prof?.username || prof?.email?.split('@')[0] || 'Employee',
          username: prof?.username || prof?.email?.split('@')[0] || 'unknown',
          email: prof?.email || '',
          role: m.role,
          approvalStatus: m.approval_status || 'approved',
        }
      })

    // Total members = 1 manager (if assigned) + employee count (strictly excluding super_admin and owner)
    const managerCount = managerInfo ? 1 : 0
    const totalCount = managerCount + employeeMembers.length

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      teamCode: org.team_code,
      color: org.color || '#3B82F6',
      createdAt: org.created_at,
      totalCount,
      manager: managerInfo,
      members: employeeMembers,
    }
  })

  return (
    <AdminDashboardClient
      teams={teams}
      candidateManagers={candidateManagers}
    />
  )
}

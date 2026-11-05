import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  TeamDashboardClient,
  type EmployeeStatus,
  type ManagerActivityEvent,
} from './dashboard-client'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PendingApprovals, type PendingMember } from '@/components/dashboard/pending-approvals'
import { DailyReportUploader } from '@/components/dashboard/daily-report-uploader'

interface MemberWithProfile {
  id: string
  user_id: string
  role: string
  approval_status?: string | null
  created_at?: string
  profile: { full_name: string | null; email: string; username?: string | null } | null
}

interface WorkSession {
  id: string
  user_id: string
  status: string
  started_at: string
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch current user's organization membership
  const { data: userMemberships } = await supabase
    .from('organization_members')
    .select('role, organization_id, organization:organizations(id, name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)

  let membership = userMemberships?.[0] || null

  // Fallback: If no organization membership found, check for a legacy profile or team slot
  if (!membership || !membership.organization_id) {
    const adminClient = createAdminClient()
    if (adminClient) {
      const userEmail = user.email || ''
      const userMetadata = user.user_metadata || {}
      const usernameVal = userMetadata.username || (userEmail ? userEmail.split('@')[0] : '')

      // Query profiles for any matching slot that has an organization_id or legacy association
      let legacyProfileQuery = adminClient
        .from('profiles')
        .select('id, email, username, role')
        .neq('id', user.id)

      if (usernameVal) {
        legacyProfileQuery = legacyProfileQuery.or(`email.ilike.${userEmail},username.ilike.${usernameVal}`)
      } else if (userEmail) {
        legacyProfileQuery = legacyProfileQuery.ilike('email', userEmail)
      }

      const { data: legacyProfiles } = await legacyProfileQuery

      if (legacyProfiles && legacyProfiles.length > 0) {
        const legacyProfileIds = legacyProfiles.map((p) => p.id)

        // Find existing organization_members record associated with the legacy slot
        const { data: legacyMemberships } = await adminClient
          .from('organization_members')
          .select('organization_id, role, approval_status, organization:organizations(id, name)')
          .in('user_id', legacyProfileIds)
          .order('created_at', { ascending: false })
          .limit(1)

        const legacyMembership = legacyMemberships?.[0] || null

        if (legacyMembership?.organization_id) {
          const orgIdToBind = legacyMembership.organization_id

          // Upsert organization_members for active authenticated user
          await adminClient.from('organization_members').upsert(
            {
              organization_id: orgIdToBind,
              user_id: user.id,
              role: legacyMembership.role || 'manager',
              approval_status: legacyMembership.approval_status || 'approved',
            },
            { onConflict: 'organization_id,user_id' }
          )

          // Update profiles table for current user using admin client
          await adminClient
            .from('profiles')
            .update({
              role: 'manager',
              approval_status: 'approved',
            })
            .eq('id', user.id)

          // Clean up legacy profile placeholders to prevent duplicates
          await adminClient
            .from('profiles')
            .delete()
            .in('id', legacyProfileIds)

          membership = {
            role: legacyMembership.role || 'manager',
            organization_id: orgIdToBind,
            organization: legacyMembership.organization,
          }
        }
      }
    }
  }

  if (!membership || !membership.organization_id) {
    return (
      <div className="max-w-5xl mx-auto py-12">
        <Card>
          <CardHeader>
            <CardTitle>No Active Organization</CardTitle>
            <CardDescription>
              You must be a member of an organization to view team activity and telemetry.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const orgId = membership.organization_id
  const orgName =
    (membership.organization as unknown as { id: string; name: string } | null)?.name ??
    'Organization'

  // Fetch team members, active sessions, and recent telemetry events (last 12 hours)
  // eslint-disable-next-line react-hooks/purity
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()

  const todayDateStr = new Date().toISOString().slice(0, 10)

  const [membersResult, sessionsResult, todayReportResult] = await Promise.all([
    supabase
      .from('organization_members')
      .select('id, user_id, role, approval_status, created_at, profile:profiles(full_name, email, username)')
      .eq('organization_id', orgId),
    supabase
      .from('work_sessions')
      .select('id, user_id, status, started_at')
      .eq('organization_id', orgId)
      .in('status', ['active', 'paused']),
    supabase
      .from('daily_reports')
      .select('id, file_name, file_url, created_at')
      .eq('organization_id', orgId)
      .eq('report_date', todayDateStr)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const allMembers = (membersResult.data as unknown as MemberWithProfile[]) ?? []
  const activeSessions = (sessionsResult.data as WorkSession[]) ?? []

  // Only fetch events for active/paused sessions to bound memory usage
  const activeSessionIds = activeSessions.map((s) => s.id)
  const eventsResult = activeSessionIds.length > 0
    ? await supabase
        .from('activity_events')
        .select('id, user_id, session_id, event_type, window_title, app_name, recorded_at, payload')
        .eq('organization_id', orgId)
        .gte('recorded_at', twelveHoursAgo)
        .in('session_id', activeSessionIds)
        .order('recorded_at', { ascending: false })
        .limit(100)
    : { data: [] }

  // Pending members awaiting manager approval
  const pendingMembers: PendingMember[] = allMembers
    .filter((m) => m.approval_status === 'pending')
    .map((m) => ({
      id: m.id,
      userId: m.user_id,
      fullName: m.profile?.full_name ?? m.profile?.email?.split('@')[0] ?? 'Unknown',
      username: m.profile?.username ?? m.profile?.email?.split('@')[0] ?? 'unknown',
      email: m.profile?.email ?? '',
      createdAt: m.created_at ?? new Date().toISOString(),
    }))

  // Only approved members appear in live telemetry status list
  const approvedMembers = allMembers.filter((m) => m.approval_status !== 'pending' && m.approval_status !== 'rejected')

  // Extract raw activity events with payload fallback for schema resilience
  const rawEvents: ManagerActivityEvent[] = (eventsResult.data ?? []).map((e: {
    id: string
    user_id: string
    session_id: string
    event_type: string
    window_title: string | null
    app_name: string | null
    recorded_at: string
    payload: Record<string, unknown> | null
  }) => {
    const payload = typeof e.payload === 'object' && e.payload !== null ? e.payload : {}
    const appName = e.app_name || (payload.app_name as string) || 'Web Browser'
    const windowTitle = e.window_title || (payload.window_title as string) || null
    return {
      id: e.id,
      userId: e.user_id,
      sessionId: e.session_id,
      eventType: e.event_type,
      windowTitle,
      appName,
      recordedAt: e.recorded_at,
    }
  })

  // Build session map
  const sessionByUser = new Map<string, WorkSession>()
  for (const s of activeSessions) {
    sessionByUser.set(s.user_id, s)
  }

  // Latest event per user
  const latestEventByUser = new Map<string, ManagerActivityEvent>()
  for (const e of rawEvents) {
    if (!latestEventByUser.has(e.userId)) {
      latestEventByUser.set(e.userId, e)
    }
  }

  // Build employee status list
  const employeeStatuses: EmployeeStatus[] = approvedMembers.map((m) => {
    const session = sessionByUser.get(m.user_id)
    const latestEvent = latestEventByUser.get(m.user_id)
    const status = session
      ? session.status === 'paused'
        ? 'paused'
        : 'active'
      : 'offline'

    return {
      userId: m.user_id,
      name: m.profile?.full_name ?? m.profile?.email?.split('@')[0] ?? 'Unknown',
      email: m.profile?.email ?? '',
      role: m.role,
      status,
      sessionId: session?.id ?? null,
      startedAt: session?.started_at ?? null,
      lastWindow: latestEvent?.windowTitle ?? null,
      lastApp: latestEvent?.appName ?? null,
    }
  })

  const isManager = ['owner', 'admin', 'manager'].includes(membership.role)
  const todayReport = todayReportResult?.data
    ? {
        id: todayReportResult.data.id,
        fileName: todayReportResult.data.file_name,
        fileUrl: todayReportResult.data.file_url,
        createdAt: todayReportResult.data.created_at,
      }
    : null

  return (
    <div className="space-y-6">
      {isManager && (
        <>
          <DailyReportUploader organizationId={orgId} todayReport={todayReport} />
          <PendingApprovals pendingMembers={pendingMembers} />
        </>
      )}
      <TeamDashboardClient
        organizationName={orgName}
        organizationId={orgId}
        employeeStatuses={employeeStatuses}
        rawEvents={rawEvents}
        currentUserRole={membership.role}
      />
    </div>
  )
}

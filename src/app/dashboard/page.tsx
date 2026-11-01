import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  TeamDashboardClient,
  type EmployeeStatus,
  type ManagerActivityEvent,
} from './dashboard-client'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

interface MemberWithProfile {
  user_id: string
  role: string
  profile: { full_name: string | null; email: string } | null
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
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role, organization_id, organization:organizations(id, name)')
    .eq('user_id', user.id)
    .maybeSingle()

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

  const [membersResult, sessionsResult, eventsResult] = await Promise.all([
    supabase
      .from('organization_members')
      .select('user_id, role, profile:profiles(full_name, email)')
      .eq('organization_id', orgId),
    supabase
      .from('work_sessions')
      .select('id, user_id, status, started_at')
      .eq('organization_id', orgId)
      .in('status', ['active', 'paused']),
    supabase
      .from('activity_events')
      .select('id, user_id, session_id, event_type, window_title, app_name, recorded_at, payload')
      .eq('organization_id', orgId)
      .gte('recorded_at', twelveHoursAgo)
      .order('recorded_at', { ascending: false }),
  ])

  const members = (membersResult.data as unknown as MemberWithProfile[]) ?? []
  const activeSessions = (sessionsResult.data as WorkSession[]) ?? []

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
  const employeeStatuses: EmployeeStatus[] = members.map((m) => {
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

  return (
    <TeamDashboardClient
      organizationName={orgName}
      organizationId={orgId}
      employeeStatuses={employeeStatuses}
      rawEvents={rawEvents}
      currentUserRole={membership.role}
    />
  )
}

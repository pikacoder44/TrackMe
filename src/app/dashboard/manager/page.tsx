import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ManagerDashboardClient, type ManagerActivityEvent } from './manager-client'

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

export interface EmployeeStatus {
  userId: string
  name: string
  email: string
  status: 'active' | 'paused' | 'offline'
  sessionId: string | null
  startedAt: string | null
  lastWindow: string | null
  lastApp: string | null
}

export interface ActivitySummary {
  userId: string
  name: string
  email: string
  totalActiveSeconds: number
  totalBreakSeconds: number
  idleCount: number
  activeCount: number
  topApps: { app: string; count: number }[]
}

export default async function ManagerPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // RBAC: only owner/admin/manager may access this page
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role, organization_id, organization:organizations(id, name)')
    .eq('user_id', user.id)
    .maybeSingle()

  const allowedRoles = ['owner', 'admin', 'manager']
  if (!membership || !allowedRoles.includes(membership.role)) {
    redirect('/dashboard')
  }

  const orgId = membership.organization_id
  const orgName =
    (membership.organization as unknown as { id: string; name: string } | null)?.name ??
    'Organization'

  // Fetch team data concurrently for the last 8 hours
  // eslint-disable-next-line react-hooks/purity
  const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()
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
      .gte('recorded_at', eightHoursAgo)
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
  for (const s of activeSessions) sessionByUser.set(s.user_id, s)

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
      status,
      sessionId: session?.id ?? null,
      startedAt: session?.started_at ?? null,
      lastWindow: latestEvent?.windowTitle ?? null,
      lastApp: latestEvent?.appName ?? null,
    }
  })

  // Build activity summary per user
  const summaryMap = new Map<string, ActivitySummary>()
  for (const m of members) {
    summaryMap.set(m.user_id, {
      userId: m.user_id,
      name: m.profile?.full_name ?? m.profile?.email?.split('@')[0] ?? 'Unknown',
      email: m.profile?.email ?? '',
      totalActiveSeconds: 0,
      totalBreakSeconds: 0,
      idleCount: 0,
      activeCount: 0,
      topApps: [],
    })
  }

  const appCountByUser = new Map<string, Map<string, number>>()

  for (const e of rawEvents) {
    const summary = summaryMap.get(e.userId)
    if (!summary) continue

    if (e.eventType === 'active_tick') {
      summary.activeCount++
      summary.totalActiveSeconds += 15 // each tick represents 15s
    } else if (e.eventType === 'idle_tick') {
      summary.idleCount++
    } else if (e.eventType === 'break_start') {
      summary.totalBreakSeconds += 0
    }

    if (e.appName) {
      if (!appCountByUser.has(e.userId)) appCountByUser.set(e.userId, new Map())
      const apps = appCountByUser.get(e.userId)!
      apps.set(e.appName, (apps.get(e.appName) ?? 0) + 1)
    }
  }

  for (const [userId, apps] of appCountByUser) {
    const summary = summaryMap.get(userId)
    if (!summary) continue
    summary.topApps = Array.from(apps.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([app, count]) => ({ app, count }))
  }

  const activitySummaries = Array.from(summaryMap.values())

  return (
    <ManagerDashboardClient
      organizationName={orgName}
      employeeStatuses={employeeStatuses}
      activitySummaries={activitySummaries}
      rawEvents={rawEvents}
      currentUserRole={membership.role}
    />
  )
}

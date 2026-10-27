import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ManagerDashboardClient } from './manager-client'

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

interface ActivityEvent {
  user_id: string
  session_id: string
  event_type: string
  window_title: string | null
  app_name: string | null
  recorded_at: string
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
    .select('role, organization_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const allowedRoles = ['owner', 'admin', 'manager']
  if (!membership || !allowedRoles.includes(membership.role)) {
    redirect('/dashboard')
  }

  const orgId = membership.organization_id

  // Fetch team data concurrently
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
      .select('user_id, session_id, event_type, window_title, app_name, recorded_at')
      .eq('organization_id', orgId)
      .gte('recorded_at', new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString())
      .order('recorded_at', { ascending: false }),
  ])

  const members = (membersResult.data as unknown as MemberWithProfile[]) ?? []
  const activeSessions = (sessionsResult.data as WorkSession[]) ?? []
  const recentEvents = (eventsResult.data as ActivityEvent[]) ?? []

  // Build session map
  const sessionByUser = new Map<string, WorkSession>()
  for (const s of activeSessions) sessionByUser.set(s.user_id, s)

  // Latest event per user
  const latestEventByUser = new Map<string, ActivityEvent>()
  for (const e of recentEvents) {
    if (!latestEventByUser.has(e.user_id)) latestEventByUser.set(e.user_id, e)
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
      lastWindow: latestEvent?.window_title ?? null,
      lastApp: latestEvent?.app_name ?? null,
    }
  })

  // Build activity summary per user (today)
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

  for (const e of recentEvents) {
    const summary = summaryMap.get(e.user_id)
    if (!summary) continue

    if (e.event_type === 'active_tick') {
      summary.activeCount++
      summary.totalActiveSeconds += 10 // each tick represents 10s
    } else if (e.event_type === 'idle_tick') {
      summary.idleCount++
    } else if (e.event_type === 'break_start') {
      summary.totalBreakSeconds += 0 // computed from paired events; simplified here
    }

    if (e.app_name) {
      if (!appCountByUser.has(e.user_id)) appCountByUser.set(e.user_id, new Map())
      const apps = appCountByUser.get(e.user_id)!
      apps.set(e.app_name, (apps.get(e.app_name) ?? 0) + 1)
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
      employeeStatuses={employeeStatuses}
      activitySummaries={activitySummaries}
      currentUserRole={membership.role}
    />
  )
}

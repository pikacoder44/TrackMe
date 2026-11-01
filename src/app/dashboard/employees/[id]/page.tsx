import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { EmployeeDetailClient } from './employee-detail-client'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import type { EmployeeStatus, ManagerActivityEvent } from '@/app/dashboard/dashboard-client'

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

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: employeeId } = await params
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
    redirect('/dashboard')
  }

  const orgId = membership.organization_id
  const orgName =
    (membership.organization as unknown as { id: string; name: string } | null)?.name ??
    'Organization'

  // Fetch the target employee from the same organization
  const { data: targetMemberData } = await supabase
    .from('organization_members')
    .select('user_id, role, profile:profiles(full_name, email)')
    .eq('organization_id', orgId)
    .eq('user_id', employeeId)
    .maybeSingle()

  const targetMember = targetMemberData as unknown as MemberWithProfile | null

  if (!targetMember) {
    return (
      <div className="max-w-4xl mx-auto py-12 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Employee Not Found</CardTitle>
            <CardDescription>
              The requested employee could not be found in this organization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to Team Overview
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Fetch active session and recent telemetry events (last 12 hours)
  // eslint-disable-next-line react-hooks/purity
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()

  const [sessionResult, eventsResult] = await Promise.all([
    supabase
      .from('work_sessions')
      .select('id, user_id, status, started_at')
      .eq('organization_id', orgId)
      .eq('user_id', employeeId)
      .in('status', ['active', 'paused'])
      .maybeSingle(),
    supabase
      .from('activity_events')
      .select('id, user_id, session_id, event_type, window_title, app_name, recorded_at, payload')
      .eq('organization_id', orgId)
      .eq('user_id', employeeId)
      .gte('recorded_at', twelveHoursAgo)
      .order('recorded_at', { ascending: false }),
  ])

  const activeSession = sessionResult.data as WorkSession | null

  // Extract raw activity events with fallback for schema resilience
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

  const latestEvent = rawEvents[0] || null
  const status = activeSession
    ? activeSession.status === 'paused'
      ? 'paused'
      : 'active'
    : 'offline'

  const employee: EmployeeStatus = {
    userId: targetMember.user_id,
    name: targetMember.profile?.full_name ?? targetMember.profile?.email?.split('@')[0] ?? 'Unknown',
    email: targetMember.profile?.email ?? '',
    role: targetMember.role,
    status,
    sessionId: activeSession?.id ?? null,
    startedAt: activeSession?.started_at ?? null,
    lastWindow: latestEvent?.windowTitle ?? null,
    lastApp: latestEvent?.appName ?? null,
  }

  return (
    <EmployeeDetailClient
      employee={employee}
      rawEvents={rawEvents}
      organizationId={orgId}
      organizationName={orgName}
    />
  )
}

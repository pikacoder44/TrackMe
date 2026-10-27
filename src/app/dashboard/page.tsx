import { createClient } from '@/lib/supabase/server'
import { TimeTracker } from '@/components/dashboard/time-tracker'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // 1. Fetch user's membership and active session concurrently
  const [membershipsResult, activeSessionResult, recentSessionsResult] = await Promise.all([
    supabase
      .from('organization_members')
      .select('organization_id, role, organization:organizations(id, name)')
      .eq('user_id', user.id),
    supabase
      .from('work_sessions')
      .select('id, status, started_at, project_id, notes, organization_id')
      .eq('user_id', user.id)
      .in('status', ['active', 'paused'])
      .maybeSingle(),
    supabase
      .from('work_sessions')
      .select('id, started_at, ended_at, status, notes, project:projects(name)')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(5),
  ])

  const memberships = membershipsResult.data
  const activeSession = activeSessionResult.data
  const recentSessions = recentSessionsResult.data
  const currentOrg = memberships?.[0]?.organization_id

  // 2. Fetch organization projects if org exists
  const { data: projects } = currentOrg
    ? await supabase
        .from('projects')
        .select('id, name')
        .eq('organization_id', currentOrg)
        .eq('is_active', true)
    : { data: [] }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard Overview</h2>
        <p className="text-sm text-muted-foreground">
          Track work time, manage active sessions, and review recent productivity.
        </p>
      </div>

      {currentOrg ? (
        <TimeTracker
          organizationId={currentOrg}
          activeSession={activeSession}
          projects={projects || []}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No Active Organization</CardTitle>
            <CardDescription>
              You must be a member of an organization to record work sessions.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Recent Sessions Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Work Sessions</CardTitle>
          <CardDescription>Last 5 sessions recorded for your account</CardDescription>
        </CardHeader>
        <CardContent>
          {!recentSessions || recentSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No work sessions logged yet.</p>
          ) : (
            <div className="divide-y">
              {recentSessions.map((s) => {
                const project = Array.isArray(s.project) ? s.project[0] : s.project
                return (
                  <div key={s.id} className="py-3 flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{s.notes || 'No description'}</p>
                      <p className="text-xs text-muted-foreground">
                        {project?.name || 'General Project'} •{' '}
                        {new Date(s.started_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${
                        s.status === 'completed'
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-emerald-500/10 text-emerald-600'
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

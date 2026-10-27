import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { ApprovalActionButtons } from '@/components/dashboard/approval-action-buttons'

function formatSeconds(seconds: number | null) {
  if (!seconds || seconds <= 0) return '0m'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export default async function ApprovalsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // Fetch user's membership in the active organization
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)

  const membership = memberships?.[0]
  const orgId = membership?.organization_id
  const isManager = membership && ['owner', 'admin', 'manager'].includes(membership.role)

  if (!isManager) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Timesheet Approvals</h2>
          <p className="text-sm text-muted-foreground">Manage organization time approvals.</p>
        </div>
        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive text-base">Access Restricted</CardTitle>
            <CardDescription>
              You do not have manager permissions. Only organization owners, admins, and managers can approve or reject timesheets.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  // Query all pending time entries for this organization
  const { data: pendingEntries } = await supabase
    .from('time_entries')
    .select(`
      id,
      description,
      duration_seconds,
      started_at,
      ended_at,
      approval_status,
      project:projects(name),
      user:profiles(full_name, email)
    `)
    .eq('organization_id', orgId!)
    .eq('approval_status', 'pending')
    .order('started_at', { ascending: false })

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Timesheet Approvals</h2>
        <p className="text-sm text-muted-foreground">
          Review, approve, or reject pending team member timesheets.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending Submissions</CardTitle>
          <CardDescription>
            {pendingEntries?.length || 0} timesheet {pendingEntries?.length === 1 ? 'entry' : 'entries'} awaiting manager review
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!pendingEntries || pendingEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              All timesheet entries are up to date. No pending approvals.
            </p>
          ) : (
            <div className="divide-y">
              {pendingEntries.map((entry) => {
                const project = Array.isArray(entry.project) ? entry.project[0] : entry.project
                const member = Array.isArray(entry.user) ? entry.user[0] : entry.user
                return (
                  <div
                    key={entry.id}
                    className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-sm"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {member?.full_name || member?.email || 'Unknown User'}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          {project?.name || 'General'}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {entry.description || 'No description provided'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(entry.started_at).toLocaleString()} • Duration: {formatSeconds(entry.duration_seconds)}
                      </p>
                    </div>

                    <ApprovalActionButtons entryId={entry.id} organizationId={orgId!} />
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

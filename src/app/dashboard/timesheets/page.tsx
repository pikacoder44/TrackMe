import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { ManualTimeDialog } from '@/components/dashboard/manual-time-dialog'
import { ExportCsvButton, CSVEntry } from '@/components/dashboard/export-csv-button'

function formatSeconds(seconds: number | null) {
  if (!seconds || seconds <= 0) return '0m'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export default async function TimesheetsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // Fetch organization membership
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)

  const currentOrg = memberships?.[0]?.organization_id

  // Fetch projects for modal dropdown
  const { data: projects } = currentOrg
    ? await supabase
        .from('projects')
        .select('id, name')
        .eq('organization_id', currentOrg)
        .eq('is_active', true)
    : { data: [] }

  // Fetch user's time entries
  const { data: timeEntries } = await supabase
    .from('time_entries')
    .select(
      'id, started_at, ended_at, duration_seconds, entry_type, approval_status, description, project:projects(name)'
    )
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })

  // Prepare CSV entries
  const csvExportEntries: CSVEntry[] = (timeEntries || []).map((e) => {
    const proj = Array.isArray(e.project) ? e.project[0] : e.project
    return {
      id: e.id,
      description: e.description,
      project_name: proj?.name || 'General',
      duration_seconds: e.duration_seconds,
      started_at: e.started_at,
      ended_at: e.ended_at,
      approval_status: e.approval_status,
    }
  })

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Timesheets</h2>
          <p className="text-sm text-muted-foreground">
            Review logged hours, entry types, and approval statuses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton entries={csvExportEntries} filename="my-timesheets.csv" />
          {currentOrg && (
            <ManualTimeDialog organizationId={currentOrg} projects={projects || []} />
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Time Log History</CardTitle>
          <CardDescription>All tracked and manual time entries</CardDescription>
        </CardHeader>
        <CardContent>
          {!timeEntries || timeEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No time entries recorded yet. Start tracking or log time manually above.
            </p>
          ) : (
            <div className="divide-y">
              {timeEntries.map((entry) => {
                const project = Array.isArray(entry.project) ? entry.project[0] : entry.project
                return (
                  <div
                    key={entry.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
                  >
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground">
                        {entry.description || 'No description'}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {project?.name || 'General Project'}
                        </span>
                        <span>•</span>
                        <span>{new Date(entry.started_at).toLocaleString()}</span>
                        <span>•</span>
                        <span className="capitalize">{entry.entry_type}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono font-medium text-sm">
                        {formatSeconds(entry.duration_seconds)}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${
                          entry.approval_status === 'approved'
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : entry.approval_status === 'rejected'
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-amber-500/10 text-amber-600'
                        }`}
                      >
                        {entry.approval_status}
                      </span>
                    </div>
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

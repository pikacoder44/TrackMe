import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { ProjectChart, ProjectMetric } from '@/components/dashboard/analytics/project-chart'
import { WeeklyChart, DailyMetric } from '@/components/dashboard/analytics/weekly-chart'
import { ExportCsvButton, CSVEntry } from '@/components/dashboard/export-csv-button'

export default async function AnalyticsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // Fetch active org
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)

  const orgId = memberships?.[0]?.organization_id
  if (!orgId) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <h2 className="text-2xl font-bold tracking-tight">Analytics</h2>
        <Card>
          <CardHeader>
            <CardTitle>No Active Organization</CardTitle>
            <CardDescription>Join or create an organization to view analytics.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  // 1. Fetch organization time entries with project info
  const { data: timeEntries } = await supabase
    .from('time_entries')
    .select(`
      id,
      started_at,
      ended_at,
      duration_seconds,
      approval_status,
      description,
      user_id,
      project:projects(name)
    `)
    .eq('organization_id', orgId)

  // 2. Fetch pending approvals count
  const { count: pendingCount } = await supabase
    .from('time_entries')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('approval_status', 'pending')

  // 3. Fetch active members count
  const { count: memberCount } = await supabase
    .from('organization_members')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)

  // Calculate Aggregates
  const entries = timeEntries || []
  const totalSeconds = entries.reduce((acc, curr) => acc + (curr.duration_seconds || 0), 0)
  const totalHours = (totalSeconds / 3600).toFixed(1)

  // Project breakdown
  const projectMap: Record<string, number> = {}
  entries.forEach((e) => {
    const proj = Array.isArray(e.project) ? e.project[0] : e.project
    const name = proj?.name || 'General'
    projectMap[name] = (projectMap[name] || 0) + (e.duration_seconds || 0)
  })

  const projectChartData: ProjectMetric[] = Object.entries(projectMap).map(([name, sec]) => ({
    name,
    hours: Number((sec / 3600).toFixed(1)),
  }))

  // Weekly daily breakdown (last 7 days)
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dailyMap: Record<string, number> = {}
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = `${daysOfWeek[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`
    dailyMap[key] = 0
  }

  entries.forEach((e) => {
    const d = new Date(e.started_at)
    const key = `${daysOfWeek[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`
    if (dailyMap[key] !== undefined) {
      dailyMap[key] += (e.duration_seconds || 0)
    }
  })

  const weeklyChartData: DailyMetric[] = Object.entries(dailyMap).map(([day, sec]) => ({
    day,
    hours: Number((sec / 3600).toFixed(1)),
  }))

  // Prepare CSV entries
  const csvExportEntries: CSVEntry[] = entries.map((e) => {
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
          <h2 className="text-2xl font-bold tracking-tight">Organization Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Productivity breakdown, project time allocations, and team trends.
          </p>
        </div>
        <ExportCsvButton
          entries={csvExportEntries}
          filename="trackme-analytics.csv"
          label="Export Report (CSV)"
        />
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider">
              Total Hours Logged
            </CardDescription>
            <CardTitle className="text-2xl font-bold">{totalHours}h</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{entries.length} total entries</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider">
              Active Team Members
            </CardDescription>
            <CardTitle className="text-2xl font-bold">{memberCount || 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Across all projects</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider">
              Pending Approvals
            </CardDescription>
            <CardTitle className="text-2xl font-bold">{pendingCount || 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Requires manager review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider">
              Idle Ratio
            </CardDescription>
            <CardTitle className="text-2xl font-bold">2.4%</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Estimated pause overhead</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hours per Project</CardTitle>
            <CardDescription>Cumulative logged work distributed by project</CardDescription>
          </CardHeader>
          <CardContent>
            <ProjectChart data={projectChartData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Weekly Activity Trend</CardTitle>
            <CardDescription>Daily total hours tracked during the last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <WeeklyChart data={weeklyChartData} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

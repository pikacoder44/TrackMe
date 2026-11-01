'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { EmployeeStatus, ActivitySummary } from './page'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { aggregateEventsToAppUsage, formatDurationHHMMSS, type AggregatedAppUsage } from '@/lib/telemetry'
import { Users, Clock, TrendingUp, Filter, Monitor, BarChart3, ListFilter } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'

export interface ManagerActivityEvent {
  id: string
  userId: string
  sessionId: string
  eventType: string
  windowTitle: string | null
  appName: string | null
  recordedAt: string
}

interface Props {
  organizationName: string
  employeeStatuses: EmployeeStatus[]
  activitySummaries: ActivitySummary[]
  rawEvents: ManagerActivityEvent[]
  currentUserRole: string
}

const APP_ICONS: Record<string, string> = {
  'Visual Studio Code': '💙',
  'VS Code': '💙',
  Discord: '🎮',
  ChatGPT: '🤖',
  Claude: '🔮',
  'Google Chrome': '🌐',
  Chrome: '🌐',
  Firefox: '🦊',
  Slack: '💬',
  Figma: '🎨',
  Notion: '📝',
  Terminal: '⬛',
  Spotify: '🎵',
  YouTube: '📺',
  GitHub: '🐙',
  'GitHub Desktop': '🐙',
  Gmail: '📧',
  'Google Meet': '📹',
  Zoom: '📹',
  Linear: '📐',
  Jira: '🔷',
  Reddit: '🤖',
  'X / Twitter': '🐦',
  Twitter: '🐦',
  Default: '🖥️',
}

function getAppIcon(app: string) {
  return APP_ICONS[app] ?? APP_ICONS.Default
}

const STATUS_CONFIG = {
  active: { label: 'Working', bg: '#EDF3EC', text: '#346538', dot: '#22c55e' },
  paused: { label: 'On Break', bg: '#FBF3DB', text: '#956400', dot: '#f59e0b' },
  offline: { label: 'Offline', bg: '#F3F4F6', text: '#6B7280', dot: '#D1D5DB' },
}

const PRODUCTIVITY_STYLES: Record<
  AggregatedAppUsage['productivity'],
  { label: string; bg: string; text: string; bar: string }
> = {
  Productive: { label: 'Productive', bg: 'bg-emerald-500/15', text: 'text-emerald-600', bar: '#10b981' },
  Neutral: { label: 'Neutral', bg: 'bg-violet-500/15', text: 'text-violet-600', bar: '#8b5cf6' },
  'Non-productive': { label: 'Non-productive', bg: 'bg-rose-500/15', text: 'text-rose-600', bar: '#f43f5e' },
  Unset: { label: 'Unset', bg: 'bg-muted', text: 'text-muted-foreground', bar: '#94a3b8' },
}

function SessionTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const startMs = new Date(startedAt).getTime()
    const updateElapsed = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startMs) / 1000)))
    }

    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  return <span>{formatDurationHHMMSS(elapsed)}</span>
}

export function ManagerDashboardClient({
  organizationName,
  employeeStatuses,
  activitySummaries,
  rawEvents,
  currentUserRole,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'live' | 'usage' | 'activity'>('live')
  const [usageSubTab, setUsageSubTab] = useState<'table' | 'chart'>('table')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [productivityFilter, setProductivityFilter] = useState<AggregatedAppUsage['productivity'] | 'All'>('All')

  // Supabase Realtime: auto-refresh when activity or sessions change
  useEffect(() => {
    const supabase = createClient()

    const activityChannel = supabase
      .channel('manager:activity_events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_events' }, () =>
        router.refresh()
      )
      .subscribe()

    const sessionChannel = supabase
      .channel('manager:work_sessions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_sessions' }, () =>
        router.refresh()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(activityChannel)
      supabase.removeChannel(sessionChannel)
    }
  }, [router])

  void currentUserRole // checked in parent

  // Filter raw events based on selected employee
  const filteredRawEvents = useMemo(() => {
    if (!selectedUserId) return rawEvents
    return rawEvents.filter((e) => e.userId === selectedUserId)
  }, [rawEvents, selectedUserId])

  // Aggregate app usage for the selected scope
  const { entries: appUsageEntries, activeSeconds: totalActiveSec, idleSeconds: totalIdleSec } = useMemo(() => {
    const eventsForAgg = filteredRawEvents.map((e) => ({
      app_name: e.appName,
      event_type: e.eventType,
    }))
    return aggregateEventsToAppUsage(eventsForAgg)
  }, [filteredRawEvents])

  // Team Overview Metrics (computed across all team members)
  const teamMetrics = useMemo(() => {
    const activeCount = employeeStatuses.filter((e) => e.status === 'active').length
    const breakCount = employeeStatuses.filter((e) => e.status === 'paused').length
    const offlineCount = employeeStatuses.filter((e) => e.status === 'offline').length

    // Total hours tracked today across team (seconds / 3600)
    const teamTotalSec = rawEvents.reduce((acc, e) => (e.eventType === 'active_tick' ? acc + 15 : acc), 0)
    const totalHours = (teamTotalSec / 3600).toFixed(1)

    // Average productivity score across all events
    const allAgg = aggregateEventsToAppUsage(
      rawEvents.map((e) => ({ app_name: e.appName, event_type: e.eventType }))
    )
    const productiveSec = allAgg.entries
      .filter((e) => e.productivity === 'Productive')
      .reduce((s, e) => s + e.seconds, 0)
    const totalSec = allAgg.entries.reduce((s, e) => s + e.seconds, 0)
    const productivityScore = totalSec > 0 ? Math.round((productiveSec / totalSec) * 100) : 0

    return {
      activeCount,
      breakCount,
      offlineCount,
      totalHours,
      productivityScore,
      totalEmployees: employeeStatuses.length,
    }
  }, [employeeStatuses, rawEvents])

  // Filtered employees for display
  const displayedEmployees = useMemo(() => {
    if (!selectedUserId) return employeeStatuses
    return employeeStatuses.filter((e) => e.userId === selectedUserId)
  }, [employeeStatuses, selectedUserId])

  // Filtered App Usage for the table
  const displayedAppUsage = useMemo(() => {
    if (productivityFilter === 'All') return appUsageEntries
    return appUsageEntries.filter((e) => e.productivity === productivityFilter)
  }, [appUsageEntries, productivityFilter])

  // Chart Data for top apps
  const chartData = useMemo(() => {
    return appUsageEntries
      .slice(0, 8)
      .map((e) => ({
        name: e.app.length > 14 ? e.app.slice(0, 14) + '…' : e.app,
        minutes: Math.max(1, Math.round(e.seconds / 60)),
        productivity: e.productivity,
      }))
  }, [appUsageEntries])

  const selectedEmployeeName = employeeStatuses.find((e) => e.userId === selectedUserId)?.name

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* 1. Supervisory Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-primary/10 text-primary">
              Supervisory Hub
            </span>
            <span className="text-xs text-muted-foreground font-medium">· {organizationName}</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight mt-1">Manager Overview</h2>
          <p className="text-sm text-muted-foreground">
            Live team telemetry, presence monitoring, and website activity analytics.
          </p>
        </div>

        {/* Employee Selector Dropdown */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="relative">
            <select
              id="employee-filter-select"
              value={selectedUserId ?? ''}
              onChange={(e) => setSelectedUserId(e.target.value ? e.target.value : null)}
              className="bg-card border rounded-lg px-3 py-2 text-sm font-medium pr-8 focus:outline-none focus:ring-2 focus:ring-primary shadow-sm cursor-pointer"
            >
              <option value="">All Team Members ({employeeStatuses.length})</option>
              {employeeStatuses.map((emp) => (
                <option key={emp.userId} value={emp.userId}>
                  {emp.name} ({emp.status === 'active' ? 'Working' : emp.status === 'paused' ? 'On Break' : 'Offline'})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 2. Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Active Employees */}
        <div className="bg-card border rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
          <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-lg shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Active Team
            </p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-bold font-mono tracking-tight text-foreground">
                {teamMetrics.activeCount}
              </span>
              <span className="text-xs text-muted-foreground font-medium">
                / {teamMetrics.totalEmployees} online
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {teamMetrics.breakCount} on break · {teamMetrics.offlineCount} offline
            </p>
          </div>
        </div>

        {/* Total Hours Tracked Today */}
        <div className="bg-card border rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
          <div className="p-3 bg-blue-500/10 text-blue-600 rounded-lg shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Hours Tracked Today
            </p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-bold font-mono tracking-tight text-foreground">
                {teamMetrics.totalHours}
              </span>
              <span className="text-xs text-muted-foreground font-medium">hrs</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Cumulative team active working time
            </p>
          </div>
        </div>

        {/* Average Team Productivity */}
        <div className="bg-card border rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
          <div className="p-3 bg-violet-500/10 text-violet-600 rounded-lg shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Team Productivity
            </p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-bold font-mono tracking-tight text-violet-600">
                {teamMetrics.productivityScore}%
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Ratio of productive applications
            </p>
          </div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="flex gap-2 border-b">
        {[
          { key: 'live', label: 'Live Presence' },
          { key: 'usage', label: 'App & Website Usage' },
          { key: 'activity', label: 'Activity Breakdown' },
        ].map((t) => (
          <button
            key={t.key}
            id={`manager-tab-${t.key}`}
            onClick={() => setTab(t.key as typeof tab)}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Live Presence Grid */}
      {tab === 'live' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {displayedEmployees.length} {displayedEmployees.length === 1 ? 'employee' : 'employees'}
              {selectedEmployeeName ? ` (filtered to ${selectedEmployeeName})` : ''}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedEmployees.map((emp) => {
              const cfg = STATUS_CONFIG[emp.status]
              return (
                <div
                  key={emp.userId}
                  className="bg-card border rounded-xl p-4 space-y-3 hover:border-primary/40 transition-colors shadow-sm"
                >
                  {/* Name + Status Pill */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{emp.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{emp.email}</p>
                    </div>
                    <span
                      className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full"
                      style={{ background: cfg.bg, color: cfg.text }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: cfg.dot }}
                      />
                      {cfg.label}
                    </span>
                  </div>

                  {/* Live Session Duration */}
                  {emp.startedAt && (
                    <div className="flex items-center justify-between text-xs pt-1 border-t">
                      <span className="text-muted-foreground">Session Elapsed</span>
                      <span className="font-mono font-semibold text-foreground">
                        <SessionTimer startedAt={emp.startedAt} />
                      </span>
                    </div>
                  )}

                  {/* Current Active Window / App */}
                  {emp.lastWindow && emp.status === 'active' && (
                    <div
                      className="text-xs text-muted-foreground bg-muted/40 border border-muted rounded-md px-2.5 py-2 truncate"
                      title={emp.lastWindow}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm shrink-0" aria-hidden>
                          {getAppIcon(emp.lastApp || 'Default')}
                        </span>
                        <div className="min-w-0 truncate">
                          {emp.lastApp && (
                            <span className="font-semibold text-foreground mr-1">{emp.lastApp}</span>
                          )}
                          <span className="text-muted-foreground truncate">{emp.lastWindow}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {emp.status === 'paused' && (
                    <div className="text-xs text-amber-600 bg-amber-500/10 rounded-md px-2.5 py-1.5">
                      On break · Telemetry paused
                    </div>
                  )}

                  {emp.status === 'offline' && (
                    <div className="text-xs text-muted-foreground bg-muted/30 rounded-md px-2.5 py-1.5">
                      No active session
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Enhanced App & Website Usage Table */}
      {tab === 'usage' && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base">Team App &amp; Website Usage</CardTitle>
                <CardDescription>
                  {selectedEmployeeName
                    ? `Activity usage for ${selectedEmployeeName}`
                    : 'Aggregated activity usage across all team members'}
                </CardDescription>
              </div>

              {/* Table / Chart Toggle */}
              <div className="flex gap-1 p-0.5 bg-muted rounded-lg text-sm self-start sm:self-auto">
                <button
                  id="usage-toggle-table"
                  onClick={() => setUsageSubTab('table')}
                  className={`px-3 py-1 rounded-md font-medium text-xs flex items-center gap-1.5 transition-colors ${
                    usageSubTab === 'table' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  <ListFilter className="w-3.5 h-3.5" />
                  Table
                </button>
                <button
                  id="usage-toggle-chart"
                  onClick={() => setUsageSubTab('chart')}
                  className={`px-3 py-1 rounded-md font-medium text-xs flex items-center gap-1.5 transition-colors ${
                    usageSubTab === 'chart' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  Chart
                </button>
              </div>
            </div>

            {/* Quick Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
              <div className="bg-muted/40 rounded-lg p-3">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                  Total Tracked
                </p>
                <p className="text-lg font-bold font-mono mt-0.5">
                  {formatDurationHHMMSS(totalActiveSec + totalIdleSec)}
                </p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                  Active Working
                </p>
                <p className="text-lg font-bold font-mono text-emerald-600 mt-0.5">
                  {formatDurationHHMMSS(totalActiveSec)}
                </p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                  Idle / Away
                </p>
                <p className="text-lg font-bold font-mono text-amber-600 mt-0.5">
                  {formatDurationHHMMSS(totalIdleSec)}
                </p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                  Unique Apps
                </p>
                <p className="text-lg font-bold font-mono mt-0.5">{appUsageEntries.length}</p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 pt-0">
            {/* Productivity Category Filter Pills */}
            <div className="flex flex-wrap gap-1.5">
              {(['All', 'Productive', 'Neutral', 'Non-productive'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setProductivityFilter(filter)}
                  className={`text-xs px-3 py-1 rounded-full font-medium border transition-colors ${
                    productivityFilter === filter
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border text-muted-foreground hover:border-foreground/40'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* Sub-tab 1: Table */}
            {usageSubTab === 'table' && (
              <>
                {displayedAppUsage.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                    <Monitor className="w-8 h-8 opacity-30" />
                    <p className="text-sm">
                      No activity recorded yet for this selection. Clock in via the TrackMe extension to start tracking.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto -mx-2">
                    <table className="w-full text-sm min-w-[560px]">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground pb-2 px-2">
                            App / Website
                          </th>
                          <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground pb-2 px-2">
                            Category
                          </th>
                          <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground pb-2 px-2">
                            Productivity
                          </th>
                          <th className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground pb-2 px-2">
                            Activity Ratio
                          </th>
                          <th className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground pb-2 px-2">
                            Duration (HH:MM:SS)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {displayedAppUsage.map((entry) => {
                          const ps = PRODUCTIVITY_STYLES[entry.productivity]
                          return (
                            <tr key={entry.app} className="hover:bg-muted/30 transition-colors">
                              {/* App / Website Name with Icon */}
                              <td className="py-2.5 px-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-base leading-none shrink-0" aria-hidden>
                                    {getAppIcon(entry.app)}
                                  </span>
                                  <span className="font-semibold truncate max-w-[160px] text-foreground">
                                    {entry.app}
                                  </span>
                                </div>
                              </td>

                              {/* Category */}
                              <td className="py-2.5 px-2 text-muted-foreground text-xs">
                                {entry.category}
                              </td>

                              {/* Productivity Badge */}
                              <td className="py-2.5 px-2">
                                <span
                                  className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${ps.bg} ${ps.text}`}
                                >
                                  {ps.label}
                                </span>
                              </td>

                              {/* Activity % with Visual Progress Bar */}
                              <td className="py-2.5 px-2 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-20 bg-muted rounded-full h-1.5 hidden sm:block overflow-hidden">
                                    <div
                                      className="rounded-full h-1.5 transition-all"
                                      style={{
                                        width: `${entry.activityPct}%`,
                                        backgroundColor: ps.bar,
                                      }}
                                    />
                                  </div>
                                  <span className="font-mono text-xs font-medium">
                                    {entry.activityPct}%
                                  </span>
                                </div>
                              </td>

                              {/* Duration formatted in clear HH:MM:SS */}
                              <td className="py-2.5 px-2 text-right font-mono font-semibold text-foreground">
                                {formatDurationHHMMSS(entry.seconds)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* Sub-tab 2: Chart */}
            {usageSubTab === 'chart' && (
              <div className="h-64 pt-2">
                {chartData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                    <Monitor className="w-8 h-8 opacity-30" />
                    <p className="text-sm">No activity recorded yet to chart.</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 16 }}>
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        unit="m"
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={90}
                      />
                      <Tooltip
                        formatter={(v) => [`${v ?? 0}m`, 'Time Spent']}
                        contentStyle={{
                          fontSize: 12,
                          borderRadius: 8,
                          border: '1px solid hsl(var(--border))',
                        }}
                      />
                      <Bar dataKey="minutes" radius={[0, 4, 4, 0]}>
                        {chartData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={PRODUCTIVITY_STYLES[entry.productivity as AggregatedAppUsage['productivity']].bar}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Activity Breakdown per Employee */}
      {tab === 'activity' && (
        <div className="space-y-4">
          {(selectedUserId
            ? activitySummaries.filter((s) => s.userId === selectedUserId)
            : activitySummaries
          ).map((s) => (
            <Card key={s.userId}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{s.name}</CardTitle>
                    <CardDescription className="text-xs">{s.email}</CardDescription>
                  </div>
                  <div className="flex gap-4 text-right">
                    <div>
                      <p className="text-xs text-muted-foreground">Active</p>
                      <p className="font-mono font-semibold text-sm text-emerald-600">
                        {formatDurationHHMMSS(s.totalActiveSeconds)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Idle ticks</p>
                      <p className="font-mono font-semibold text-sm text-amber-600">{s.idleCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Active ticks</p>
                      <p className="font-mono font-semibold text-sm">{s.activeCount}</p>
                    </div>
                  </div>
                </div>
              </CardHeader>

              {s.topApps.length > 0 && (
                <CardContent className="pt-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Top Applications
                  </p>
                  <div className="space-y-2">
                    {s.topApps.map(({ app, count }) => {
                      const max = s.topApps[0].count
                      const pct = Math.round((count / max) * 100)
                      return (
                        <div key={app} className="flex items-center gap-2">
                          <span className="text-sm shrink-0" aria-hidden>
                            {getAppIcon(app)}
                          </span>
                          <div className="w-28 text-xs text-muted-foreground truncate shrink-0">{app}</div>
                          <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-primary rounded-full h-1.5 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="text-xs font-mono text-muted-foreground w-12 text-right">
                            {count} ticks
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              )}

              {s.topApps.length === 0 && (
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground">No activity recorded in the last 8 hours.</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

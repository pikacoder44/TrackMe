'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { EmployeeStatus, ActivitySummary } from './page'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

interface Props {
  employeeStatuses: EmployeeStatus[]
  activitySummaries: ActivitySummary[]
  currentUserRole: string
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function SessionTimer({ startedAt }: { startedAt: string }) {
  const startMs = new Date(startedAt).getTime()
  const nowMs = Date.now()
  const elapsed = Math.floor((nowMs - startMs) / 1000)
  return <span>{formatDuration(elapsed)}</span>
}

const STATUS_CONFIG = {
  active: { label: 'Working', bg: '#EDF3EC', text: '#346538', dot: '#22c55e' },
  paused: { label: 'On Break', bg: '#FBF3DB', text: '#956400', dot: '#f59e0b' },
  offline: { label: 'Offline', bg: '#F3F4F6', text: '#6B7280', dot: '#D1D5DB' },
}

export function ManagerDashboardClient({ employeeStatuses, activitySummaries, currentUserRole }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'live' | 'activity'>('live')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  // Supabase Realtime: refresh when activity or sessions change for this org
  useEffect(() => {
    const supabase = createClient()

    // Derive org from the first employee's session (all share the same org)
    // We can't filter by org_id here without passing it as prop — subscribe to table-level changes
    const activityChannel = supabase
      .channel('manager:activity_events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_events' }, () =>
        router.refresh()
      )
      .subscribe()

    const sessionChannel = supabase
      .channel('manager:work_sessions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_sessions' },
        () => router.refresh()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(activityChannel)
      supabase.removeChannel(sessionChannel)
    }
  }, [router])

  void currentUserRole // used by parent for RBAC, not needed here

  const selectedSummary = activitySummaries.find((s) => s.userId === selectedUserId)

  const activeCount = employeeStatuses.filter((e) => e.status === 'active').length
  const breakCount = employeeStatuses.filter((e) => e.status === 'paused').length
  const offlineCount = employeeStatuses.filter((e) => e.status === 'offline').length

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Team Monitor</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Live activity and session overview for your organization.
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Active', value: activeCount, color: '#22c55e' },
          { label: 'On Break', value: breakCount, color: '#f59e0b' },
          { label: 'Offline', value: offlineCount, color: '#D1D5DB' },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-card border rounded-lg p-4 flex items-center gap-3"
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: item.color }}
            />
            <div>
              <div className="text-2xl font-bold font-mono tracking-tight">{item.value}</div>
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{item.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['live', 'activity'] as const).map((t) => (
          <button
            key={t}
            id={`tab-${t}`}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'live' ? 'Live Status' : 'Activity Breakdown'}
          </button>
        ))}
      </div>

      {/* Live Status Grid */}
      {tab === 'live' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {employeeStatuses.map((emp) => {
            const cfg = STATUS_CONFIG[emp.status]
            return (
              <div
                key={emp.userId}
                className="bg-card border rounded-xl p-4 space-y-3 hover:border-foreground/20 transition-colors cursor-pointer"
                onClick={() => {
                  setSelectedUserId(emp.userId)
                  setTab('activity')
                }}
              >
                {/* Name + status */}
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

                {/* Session duration */}
                {emp.startedAt && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Session</span>
                    <span className="font-mono font-semibold">
                      <SessionTimer startedAt={emp.startedAt} />
                    </span>
                  </div>
                )}

                {/* Last window */}
                {emp.lastWindow && emp.status === 'active' && (
                  <div
                    className="text-xs text-muted-foreground bg-muted/50 rounded-md px-2.5 py-1.5 truncate"
                    title={emp.lastWindow}
                  >
                    {emp.lastApp && <span className="font-medium text-foreground">{emp.lastApp} · </span>}
                    {emp.lastWindow}
                  </div>
                )}

                {emp.status === 'offline' && (
                  <div className="text-xs text-muted-foreground">No active session</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Activity Breakdown */}
      {tab === 'activity' && (
        <div className="space-y-4">
          {/* Employee filter */}
          <div className="flex flex-wrap gap-2">
            <button
              id="filter-all"
              onClick={() => setSelectedUserId(null)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${
                selectedUserId === null
                  ? 'bg-foreground text-background border-foreground'
                  : 'border-border text-muted-foreground hover:border-foreground/40'
              }`}
            >
              All
            </button>
            {activitySummaries.map((s) => (
              <button
                key={s.userId}
                id={`filter-${s.userId}`}
                onClick={() => setSelectedUserId(s.userId)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${
                  selectedUserId === s.userId
                    ? 'bg-foreground text-background border-foreground'
                    : 'border-border text-muted-foreground hover:border-foreground/40'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>

          {/* Summary cards */}
          {(selectedUserId ? [selectedSummary!].filter(Boolean) : activitySummaries).map((s) => (
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
                        {formatDuration(s.totalActiveSeconds)}
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
                          <div className="w-28 text-xs text-muted-foreground truncate shrink-0">{app}</div>
                          <div className="flex-1 bg-muted rounded-full h-1.5">
                            <div
                              className="bg-foreground rounded-full h-1.5 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="text-xs font-mono text-muted-foreground w-8 text-right">{count}</div>
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

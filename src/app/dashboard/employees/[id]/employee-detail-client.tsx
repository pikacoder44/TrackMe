'use client'

import { useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  aggregateEventsToAppUsage,
  formatDurationHHMMSS,
} from '@/lib/telemetry'
import {
  getAppIcon,
  STATUS_CONFIG,
  PRODUCTIVITY_STYLES,
  SessionTimer,
  type ManagerActivityEvent,
  type EmployeeStatus,
} from '@/app/dashboard/dashboard-client'
import {
  ArrowLeft,
  Clock,
  TrendingUp,
  Activity,
  Layers,
  Sparkles,
  Coffee,
  Monitor,
  CheckCircle,
} from 'lucide-react'

interface EmployeeDetailClientProps {
  employee: EmployeeStatus
  rawEvents: ManagerActivityEvent[]
  organizationId: string
  organizationName: string
}

export function EmployeeDetailClient({
  employee,
  rawEvents,
  organizationId,
  organizationName,
}: EmployeeDetailClientProps) {
  const router = useRouter()

  // Realtime subscription: refresh when activity events or work sessions change for this organization
  useEffect(() => {
    const supabase = createClient()

    const activityChannel = supabase
      .channel(`employee:activity_events:${employee.userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_events',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => router.refresh()
      )
      .subscribe()

    const sessionChannel = supabase
      .channel(`employee:work_sessions:${employee.userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'work_sessions',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => router.refresh()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(activityChannel)
      supabase.removeChannel(sessionChannel)
    }
  }, [employee.userId, organizationId, router])

  // Filter events specifically for this employee
  const employeeEvents = useMemo(() => {
    return rawEvents.filter((e) => e.userId === employee.userId)
  }, [rawEvents, employee.userId])

  // Aggregate app & website usage
  const appUsage = useMemo(() => {
    return aggregateEventsToAppUsage(
      employeeEvents.map((e) => ({
        app_name: e.appName,
        event_type: e.eventType,
      }))
    )
  }, [employeeEvents])

  // Productivity score calculation
  const productivityScore = useMemo(() => {
    const totalSec = appUsage.entries.reduce((s, e) => s + e.seconds, 0)
    const productiveSec = appUsage.entries
      .filter((e) => e.productivity === 'Productive')
      .reduce((s, e) => s + e.seconds, 0)
    return totalSec > 0 ? Math.round((productiveSec / totalSec) * 100) : 0
  }, [appUsage])

  const statusConfig = STATUS_CONFIG[employee.status]

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* 1. Navigation & Breadcrumb Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border bg-card hover:bg-muted text-foreground transition-colors shadow-2xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Team Overview
          </Link>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <nav className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span>{organizationName}</span>
            <span>/</span>
            <span>Employees</span>
            <span>/</span>
            <span className="font-semibold text-foreground">{employee.name}</span>
          </nav>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground self-start sm:self-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-medium text-[11px] uppercase tracking-wider">
            Live Realtime Telemetry
          </span>
        </div>
      </div>

      {/* 2. Employee Profile & Live Status Banner */}
      <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Left: Avatar, Name, Email, Role, Status */}
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-xl uppercase shadow-inner shrink-0">
              {employee.name.slice(0, 2)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {employee.name}
                </h1>
                <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                  {employee.role}
                </span>
                {/* Live Status Badge */}
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full shadow-2xs"
                  style={{ background: statusConfig.bg, color: statusConfig.text }}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${employee.status === 'active' ? 'animate-pulse' : ''}`}
                    style={{ background: statusConfig.dot }}
                  />
                  {statusConfig.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{employee.email}</p>
            </div>
          </div>

          {/* Right: Elapsed Session Timer & Active Session Details */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {employee.startedAt && employee.status !== 'offline' ? (
              <div className="bg-muted/40 border rounded-xl p-3.5 flex items-center gap-3 min-w-[200px]">
                <div className="p-2 rounded-lg bg-background border text-primary shrink-0 shadow-2xs">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                    Session Duration
                  </p>
                  <p className="text-lg font-bold font-mono text-foreground">
                    <SessionTimer startedAt={employee.startedAt} />
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-muted/20 border border-dashed rounded-xl p-3.5 flex items-center gap-3 text-muted-foreground min-w-[200px]">
                <Monitor className="w-5 h-5 opacity-40 shrink-0" />
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-wider">Session Status</p>
                  <p className="text-xs font-medium">Currently Offline</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Current Active App / Focused Window Banner */}
        <div className="border-t pt-4">
          <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
            <Activity className="w-3.5 h-3.5 text-primary" />
            Current Active Context
          </p>
          {employee.status === 'active' && employee.lastWindow ? (
            <div className="bg-muted/30 border rounded-xl p-3.5 flex items-center gap-3.5">
              <span className="text-2xl leading-none shrink-0" aria-hidden>
                {getAppIcon(employee.lastApp || 'Default')}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">
                    {employee.lastApp || 'Web Browser'}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600">
                    Focused Tab
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {employee.lastWindow}
                </p>
              </div>
            </div>
          ) : employee.status === 'paused' ? (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 flex items-center gap-3 text-amber-800">
              <Coffee className="w-5 h-5 text-amber-600 shrink-0" />
              <div className="text-xs">
                <p className="font-bold">Session Paused</p>
                <p className="text-muted-foreground mt-0.5">Employee is currently taking a break. Telemetry ticks are paused.</p>
              </div>
            </div>
          ) : (
            <div className="bg-muted/20 border border-dashed rounded-xl p-3.5 flex items-center gap-3 text-muted-foreground">
              <Monitor className="w-5 h-5 opacity-40 shrink-0" />
              <div className="text-xs">
                <p className="font-bold text-foreground">No Active Window</p>
                <p className="text-muted-foreground mt-0.5">Employee has not clocked in or active telemetry is currently offline.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Overview Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Working Time */}
        <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-bold tracking-wider text-muted-foreground">
              Total Working Time
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-emerald-600">
              {formatDurationHHMMSS(appUsage.activeSeconds)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Active telemetry ticks streamed in last 12 hours
            </p>
          </div>
        </div>

        {/* Total Idle Time */}
        <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-bold tracking-wider text-muted-foreground">
              Total Idle Time
            </span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600">
              <Coffee className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-amber-600">
              {formatDurationHHMMSS(appUsage.idleSeconds)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              System idle or inactivity detected while clocked in
            </p>
          </div>
        </div>

        {/* Overall Productivity Score */}
        <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-bold tracking-wider text-muted-foreground">
              Productivity Score
            </span>
            <div className="p-2 rounded-lg bg-violet-500/10 text-violet-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold font-mono text-violet-600">
                {productivityScore}%
              </p>
              <span className="text-xs text-muted-foreground">rated productive</span>
            </div>
            {/* Visual Mini Progress Bar */}
            <div className="w-full bg-muted rounded-full h-1.5 mt-2.5 overflow-hidden">
              <div
                className="bg-violet-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${productivityScore}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4. Full-Width App & Website Usage Table */}
      <div className="bg-card border rounded-2xl shadow-sm overflow-hidden space-y-4 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-4">
          <div>
            <h3 className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              App &amp; Website Usage Breakdown
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cumulative application activity, productive vs. non-productive categorization, and engagement ratios.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-muted text-muted-foreground self-start sm:self-auto">
            {appUsage.entries.length} Applications Recorded
          </span>
        </div>

        {appUsage.entries.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Monitor className="w-8 h-8 opacity-30 mx-auto mb-2" />
            <p className="text-sm font-semibold">No application activity recorded yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Active telemetry will stream into this table as the employee works with the TrackMe browser extension.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="text-left font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">
                    Domain / App Name
                  </th>
                  <th className="text-left font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">
                    Category
                  </th>
                  <th className="text-left font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">
                    Productivity Tag
                  </th>
                  <th className="text-right font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">
                    Activity Level %
                  </th>
                  <th className="text-right font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">
                    Inactive %
                  </th>
                  <th className="text-right font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">
                    Total Duration (HH:MM:SS)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {appUsage.entries.map((entry) => {
                  const pStyle = PRODUCTIVITY_STYLES[entry.productivity]

                  return (
                    <tr key={entry.app} className="hover:bg-muted/20 transition-colors">
                      {/* Domain / App Name */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <span className="text-lg leading-none shrink-0" aria-hidden>
                            {getAppIcon(entry.app)}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground text-sm truncate max-w-[220px]">
                              {entry.app}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4 text-muted-foreground font-medium">
                        {entry.category}
                      </td>

                      {/* Productivity Tag */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${pStyle.bg} ${pStyle.text}`}
                        >
                          {pStyle.label}
                        </span>
                      </td>

                      {/* Activity Level % */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 bg-muted rounded-full h-1.5 hidden sm:block overflow-hidden">
                            <div
                              className="rounded-full h-1.5 transition-all"
                              style={{
                                width: `${entry.activityPct}%`,
                                backgroundColor: pStyle.bar,
                              }}
                            />
                          </div>
                          <span className="font-mono font-bold text-foreground">
                            {entry.activityPct}%
                          </span>
                        </div>
                      </td>

                      {/* Inactive % */}
                      <td className="py-3.5 px-4 text-right font-mono text-muted-foreground">
                        {entry.inactivePct}%
                      </td>

                      {/* Total Duration HH:MM:SS */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-foreground text-sm">
                        {formatDurationHHMMSS(entry.seconds)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Live Chronological Activity Stream */}
      <div className="bg-card border rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h3 className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Live Chronological Activity Stream
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Real-time feed of active tab and window changes synchronized directly from browser telemetry.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-full font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Connected
          </div>
        </div>

        {employeeEvents.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Sparkles className="w-8 h-8 opacity-30 mx-auto mb-2" />
            <p className="text-sm font-semibold">No activity ticks received yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Events will show up here chronologically as the employee navigates or interacts with their browser.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/60 max-h-96 overflow-y-auto">
            {employeeEvents.slice(0, 30).map((event) => {
              const eventDate = new Date(event.recordedAt)
              const formattedTime = eventDate.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })

              const isActive = event.eventType === 'active_tick'
              const isBreak = event.eventType.includes('break')

              return (
                <div
                  key={event.id}
                  className="py-3 px-2 flex items-start justify-between gap-4 hover:bg-muted/20 transition-colors rounded-lg"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="text-lg leading-none shrink-0 pt-0.5" aria-hidden>
                      {getAppIcon(event.appName || 'Default')}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-foreground truncate">
                          {event.appName || 'Web Browser'}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          • {formattedTime}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5 max-w-xl">
                        {event.windowTitle || 'Active Browser Tab'}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`shrink-0 text-[10px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                      isActive
                        ? 'bg-emerald-500/10 text-emerald-600'
                        : isBreak
                        ? 'bg-amber-500/10 text-amber-600'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isActive ? (
                      <>
                        <CheckCircle className="w-3 h-3" />
                        Active
                      </>
                    ) : isBreak ? (
                      <>
                        <Coffee className="w-3 h-3" />
                        Break
                      </>
                    ) : (
                      'Idle'
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

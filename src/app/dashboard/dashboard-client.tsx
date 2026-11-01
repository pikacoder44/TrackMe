'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  aggregateEventsToAppUsage,
  formatDurationHHMMSS,
} from '@/lib/telemetry'
import {
  Users,
  Clock,
  TrendingUp,
  Search,
  Monitor,
  ExternalLink,
  Coffee,
  Sparkles,
} from 'lucide-react'

export interface ManagerActivityEvent {
  id: string
  userId: string
  sessionId: string | null
  eventType: string
  windowTitle: string | null
  appName: string | null
  recordedAt: string
}

export interface EmployeeStatus {
  userId: string
  name: string
  email: string
  role: string
  status: 'active' | 'paused' | 'offline'
  sessionId: string | null
  startedAt: string | null
  lastWindow: string | null
  lastApp: string | null
}

interface TeamDashboardClientProps {
  organizationName: string
  organizationId: string
  employeeStatuses: EmployeeStatus[]
  rawEvents: ManagerActivityEvent[]
  currentUserRole: string
}

export const APP_ICONS: Record<string, string> = {
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

export function getAppIcon(app: string) {
  return APP_ICONS[app] ?? APP_ICONS.Default
}

export const STATUS_CONFIG = {
  active: { label: 'Working', bg: '#EDF3EC', text: '#346538', dot: '#22c55e' },
  paused: { label: 'On Break', bg: '#FBF3DB', text: '#956400', dot: '#f59e0b' },
  offline: { label: 'Offline', bg: '#F3F4F6', text: '#6B7280', dot: '#D1D5DB' },
}

export const PRODUCTIVITY_STYLES: Record<
  'Productive' | 'Neutral' | 'Non-productive' | 'Unset',
  { label: string; bg: string; text: string; bar: string }
> = {
  Productive: { label: 'Productive', bg: 'bg-emerald-500/15', text: 'text-emerald-600', bar: '#10b981' },
  Neutral: { label: 'Neutral', bg: 'bg-violet-500/15', text: 'text-violet-600', bar: '#8b5cf6' },
  'Non-productive': { label: 'Non-productive', bg: 'bg-rose-500/15', text: 'text-rose-600', bar: '#f43f5e' },
  Unset: { label: 'Unset', bg: 'bg-muted', text: 'text-muted-foreground', bar: '#94a3b8' },
}

export function SessionTimer({ startedAt }: { startedAt: string }) {
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

export function TeamDashboardClient({
  organizationName,
  organizationId,
  employeeStatuses,
  rawEvents,
  currentUserRole,
}: TeamDashboardClientProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'offline'>('all')

  // Supabase Realtime: auto-refresh when events or sessions update
  useEffect(() => {
    const supabase = createClient()

    const activityChannel = supabase
      .channel('dashboard:activity_events')
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
      .channel('dashboard:work_sessions')
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
  }, [organizationId, router])

  void currentUserRole // for RBAC context

  // Team Overview Metrics
  const teamMetrics = useMemo(() => {
    const activeCount = employeeStatuses.filter((e) => e.status === 'active').length
    const breakCount = employeeStatuses.filter((e) => e.status === 'paused').length
    const offlineCount = employeeStatuses.filter((e) => e.status === 'offline').length

    // Cumulative team active working seconds (15s per active tick)
    const teamTotalSec = rawEvents.reduce((acc, e) => (e.eventType === 'active_tick' ? acc + 15 : acc), 0)
    const totalHours = (teamTotalSec / 3600).toFixed(1)

    // Average team productivity
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

  // Filtered employees for the grid
  const filteredEmployees = useMemo(() => {
    return employeeStatuses.filter((emp) => {
      const matchesSearch =
        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (emp.lastApp && emp.lastApp.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchesStatus =
        statusFilter === 'all' || emp.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [employeeStatuses, searchQuery, statusFilter])

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* 1. Organization Supervisory Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Supervisory Hub
            </span>
            <span className="text-xs text-muted-foreground font-medium">· {organizationName}</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight mt-1.5">Team Monitor</h2>
          <p className="text-sm text-muted-foreground">
            Live telemetry stream, attendance status, and real-time app usage across all team members.
          </p>
        </div>

        {/* Global Overview Metrics Strip */}
        <div className="flex items-center gap-3">
          <div className="bg-card border rounded-lg px-3.5 py-2 flex items-center gap-2.5 shadow-sm">
            <Users className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Active</p>
              <p className="text-sm font-bold font-mono">
                {teamMetrics.activeCount} <span className="text-xs font-normal text-muted-foreground">/ {teamMetrics.totalEmployees}</span>
              </p>
            </div>
          </div>

          <div className="bg-card border rounded-lg px-3.5 py-2 flex items-center gap-2.5 shadow-sm">
            <Clock className="w-4 h-4 text-blue-600 shrink-0" />
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Today</p>
              <p className="text-sm font-bold font-mono">
                {teamMetrics.totalHours} <span className="text-xs font-normal text-muted-foreground">hrs</span>
              </p>
            </div>
          </div>

          <div className="bg-card border rounded-lg px-3.5 py-2 flex items-center gap-2.5 shadow-sm">
            <TrendingUp className="w-4 h-4 text-violet-600 shrink-0" />
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Productivity</p>
              <p className="text-sm font-bold font-mono text-violet-600">
                {teamMetrics.productivityScore}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Search & Status Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Status Filter Buttons */}
        <div className="flex gap-1.5 p-1 bg-muted/60 rounded-lg text-xs font-medium self-start">
          {[
            { key: 'all', label: `All (${employeeStatuses.length})` },
            { key: 'active', label: `Working (${teamMetrics.activeCount})` },
            { key: 'paused', label: `On Break (${teamMetrics.breakCount})` },
            { key: 'offline', label: `Offline (${teamMetrics.offlineCount})` },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setStatusFilter(item.key as typeof statusFilter)}
              className={`px-3 py-1.5 rounded-md transition-all ${
                statusFilter === item.key
                  ? 'bg-background text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search employee or app..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-card border rounded-lg pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
          />
        </div>
      </div>

      {/* 3. Team Member Overview Cards Grid */}
      {filteredEmployees.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border rounded-2xl bg-card">
          <Monitor className="w-10 h-10 opacity-30 mb-2" />
          <p className="font-semibold text-sm">No team members match the filter.</p>
          <p className="text-xs text-muted-foreground mt-1">Try clearing your search query or status filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEmployees.map((emp) => {
            const cfg = STATUS_CONFIG[emp.status]

            return (
              <div
                key={emp.userId}
                id={`employee-card-${emp.userId}`}
                onClick={() => router.push(`/dashboard/employees/${emp.userId}`)}
                className="group bg-card border rounded-xl p-4.5 space-y-3.5 transition-all duration-150 cursor-pointer shadow-sm relative overflow-hidden hover:border-primary/60 hover:shadow-md"
              >
                {/* Employee Header: Name, Email, Role, Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                        {emp.name}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {emp.role}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{emp.email}</p>
                  </div>

                  {/* Status Pill */}
                  <span
                    className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-2xs"
                    style={{ background: cfg.bg, color: cfg.text }}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${emp.status === 'active' ? 'animate-pulse' : ''}`}
                      style={{ background: cfg.dot }}
                    />
                    {cfg.label}
                  </span>
                </div>

                {/* Session Duration if clocked in */}
                {emp.startedAt && emp.status !== 'offline' && (
                  <div className="flex items-center justify-between text-xs pt-1 border-t">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Session Elapsed
                    </span>
                    <span className="font-mono font-bold text-foreground">
                      <SessionTimer startedAt={emp.startedAt} />
                    </span>
                  </div>
                )}

                {/* Current Active App / Website */}
                <div className="pt-0.5">
                  {emp.status === 'active' && emp.lastWindow ? (
                    <div
                      className="text-xs bg-muted/40 border border-muted/80 rounded-lg p-2.5 truncate"
                      title={emp.lastWindow}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base leading-none shrink-0" aria-hidden>
                          {getAppIcon(emp.lastApp || 'Default')}
                        </span>
                        <div className="min-w-0 truncate">
                          <p className="font-semibold text-foreground text-xs truncate">
                            {emp.lastApp || 'Web Browser'}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {emp.lastWindow}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : emp.status === 'paused' ? (
                    <div className="text-xs text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 flex items-center gap-2">
                      <Coffee className="w-4 h-4 shrink-0 text-amber-600" />
                      <span className="truncate">On break · Telemetry streaming paused</span>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground bg-muted/20 border border-dashed rounded-lg p-2 flex items-center gap-2">
                      <Monitor className="w-3.5 h-3.5 opacity-40 shrink-0" />
                      <span className="truncate">Offline · No active session streaming</span>
                    </div>
                  )}
                </div>

                {/* Card footer CTA */}
                <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground group-hover:text-primary font-medium transition-colors">
                  <span>View detailed activity dashboard</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

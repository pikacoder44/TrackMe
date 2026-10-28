'use client'

import { useState, useEffect, useTransition, useOptimistic, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { clockIn, pauseSession, resumeSession, clockOut } from '@/app/dashboard/actions'
import { createClient } from '@/lib/supabase/client'
import type { AppUsageEntry } from '@/components/dashboard/app-usage-table'

// Simulated app context for web telemetry ticks
const SIM_APPS: { app: string; category: string; productivity: AppUsageEntry['productivity'] }[] = [
  { app: 'Visual Studio Code', category: 'Development', productivity: 'Productive' },
  { app: 'Google Chrome', category: 'Browsing', productivity: 'Neutral' },
  { app: 'Claude', category: 'Artificial Intelligence', productivity: 'Productive' },
  { app: 'ChatGPT', category: 'Artificial Intelligence', productivity: 'Productive' },
  { app: 'Discord', category: 'Communication', productivity: 'Neutral' },
  { app: 'Slack', category: 'Communication', productivity: 'Productive' },
  { app: 'Spotify', category: 'Entertainment', productivity: 'Non-productive' },
  { app: 'GitHub', category: 'Development', productivity: 'Productive' },
  { app: 'Notion', category: 'Time Management', productivity: 'Productive' },
  { app: 'YouTube', category: 'Entertainment', productivity: 'Non-productive' },
]

interface Project {
  id: string
  name: string
}

interface ActiveSession {
  id: string
  status: 'active' | 'paused' | 'completed'
  started_at: string
  project_id: string | null
  notes: string | null
  organization_id: string
}

interface TimeTrackerProps {
  organizationId: string
  activeSession: ActiveSession | null
  projects: Project[]
  onUsageUpdate?: (entries: AppUsageEntry[], activeSeconds: number, idleSeconds: number) => void
}

export function TimeTracker({
  organizationId,
  activeSession,
  projects,
  onUsageUpdate,
}: TimeTrackerProps) {
  const router = useRouter()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // In-memory usage accumulator for the current session
  const usageRef = useRef<Map<string, { entry: AppUsageEntry; seconds: number }>>(new Map())
  const activeSecondsRef = useRef(0)
  const idleSecondsRef = useRef(0)

  const [currentSession, setOptimisticSession] = useOptimistic(
    activeSession,
    (_current, update: ActiveSession | null) => update
  )

  // Supabase Realtime: refresh when own work_session changes
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('public:work_sessions:employee')
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
      supabase.removeChannel(channel)
    }
  }, [organizationId, router])

  // Timer
  useEffect(() => {
    if (!currentSession) {
      setTimeout(() => setElapsedSeconds(0), 0)
      return
    }
    const startTime = new Date(currentSession.started_at).getTime()
    const update = () =>
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startTime) / 1000)))
    const timer = setTimeout(update, 0)
    if (currentSession.status === 'active') {
      const interval = setInterval(update, 1000)
      return () => {
        clearTimeout(timer)
        clearInterval(interval)
      }
    }
    return () => clearTimeout(timer)
  }, [currentSession])

  // Pick a random simulated app for a tick
  const pickSimApp = () => SIM_APPS[Math.floor(Math.random() * SIM_APPS.length)]

  // Emit usage update to parent
  const emitUsage = useCallback(
    (appEntry: (typeof SIM_APPS)[0], isActive: boolean) => {
      const key = appEntry.app
      if (!usageRef.current.has(key)) {
        usageRef.current.set(key, {
          entry: {
            app: appEntry.app,
            category: appEntry.category,
            productivity: appEntry.productivity,
            activityPct: 0,
            inactivePct: 0,
            seconds: 0,
          },
          seconds: 0,
        })
      }
      const item = usageRef.current.get(key)!
      item.seconds += 10
      if (isActive) activeSecondsRef.current += 10
      else idleSecondsRef.current += 10

      // Recompute pcts
      const entries = Array.from(usageRef.current.values()).map(({ entry, seconds }) => {
        const total = seconds
        const active = Math.round(((entry.activityPct / 100) * total + (isActive && key === entry.app ? 10 : 0)) / total * 100)
        return { ...entry, seconds, activityPct: Math.min(100, active), inactivePct: Math.max(0, 100 - active) }
      })
      onUsageUpdate?.(entries, activeSecondsRef.current, idleSecondsRef.current)
    },
    [onUsageUpdate]
  )

  // Background telemetry emitter — fires every 10s while session is active
  useEffect(() => {
    if (!currentSession || currentSession.status !== 'active') return

    const supabase = createClient()

    const emit = async () => {
      const simApp = pickSimApp()
      const isActive = Math.random() > 0.2 // 80% active
      const key = `${currentSession.id}-${Date.now()}`

      emitUsage(simApp, isActive)

      try {
        await fetch('/api/v1/events/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: currentSession.id,
            organization_id: organizationId,
            events: [
              {
                idempotency_key: key,
                timestamp: new Date().toISOString(),
                is_active: isActive,
                event_type: isActive ? 'active_tick' : 'idle_tick',
                app_name: simApp.app,
                window_title: `${simApp.app} — TrackMe Web`,
              },
            ],
          }),
        })
      } catch {
        // shortcut: silent fail — telemetry is best-effort, data loss is acceptable here
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      void supabase // keep reference so eslint doesn't complain about unused import
    }

    const interval = setInterval(emit, 10_000)
    return () => clearInterval(interval)
  }, [currentSession, organizationId, emitUsage])

  function formatTime(s: number) {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':')
  }

  function handleClockIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const fd = new FormData(event.currentTarget)
    fd.append('organizationId', organizationId)
    const projectId = (fd.get('projectId') as string) || null
    const notes = (fd.get('notes') as string) || null
    const tempSession: ActiveSession = {
      id: 'temp-session',
      status: 'active',
      started_at: new Date().toISOString(),
      project_id: projectId,
      notes,
      organization_id: organizationId,
    }
    setElapsedSeconds(0)
    usageRef.current.clear()
    activeSecondsRef.current = 0
    idleSecondsRef.current = 0
    startTransition(async () => {
      setOptimisticSession(tempSession)
      const res = await clockIn(fd)
      if (res?.error) setError(res.error)
    })
  }

  function handlePause() {
    if (!currentSession) return
    setError(null)
    const prev = currentSession
    startTransition(async () => {
      setOptimisticSession({ ...prev, status: 'paused' })
      const res = await pauseSession(prev.id)
      if (res?.error) setError(res.error)
    })
  }

  function handleResume() {
    if (!currentSession) return
    setError(null)
    const prev = currentSession
    startTransition(async () => {
      setOptimisticSession({ ...prev, status: 'active' })
      const res = await resumeSession(prev.id)
      if (res?.error) setError(res.error)
    })
  }

  function handleClockOut() {
    if (!currentSession) return
    setError(null)
    setElapsedSeconds(0)
    const prev = currentSession
    startTransition(async () => {
      setOptimisticSession(null)
      const res = await clockOut(prev.id)
      if (res?.error) setError(res.error)
    })
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Work Session Tracker</CardTitle>
            <CardDescription>Track time and log sessions directly into your organization</CardDescription>
          </div>
          {currentSession && (
            <span
              className={`text-xs uppercase font-semibold px-2.5 py-1 rounded-full ${
                currentSession.status === 'active'
                  ? 'bg-emerald-500/10 text-emerald-600'
                  : 'bg-amber-500/10 text-amber-600'
              }`}
            >
              {currentSession.status}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="text-sm font-medium text-destructive bg-destructive/10 p-2.5 rounded-md">
            {error}
          </div>
        )}

        <div className="flex flex-col items-center justify-center p-6 bg-muted/40 rounded-xl border border-dashed">
          <span className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">
            Elapsed Time
          </span>
          <span className="font-mono text-4xl sm:text-5xl font-bold tracking-tight">
            {formatTime(elapsedSeconds)}
          </span>
        </div>

        {currentSession ? (
          <div className="flex items-center gap-3">
            {currentSession.status === 'active' ? (
              <Button variant="outline" className="flex-1" onClick={handlePause} disabled={isPending}>
                Pause Session
              </Button>
            ) : (
              <Button variant="outline" className="flex-1" onClick={handleResume} disabled={isPending}>
                Resume Session
              </Button>
            )}
            <Button variant="destructive" className="flex-1" onClick={handleClockOut} disabled={isPending}>
              Clock Out
            </Button>
          </div>
        ) : (
          <form onSubmit={handleClockIn} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="projectId" className="text-sm font-medium">
                  Project
                </label>
                <select
                  id="projectId"
                  name="projectId"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">No Project (General)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="notes" className="text-sm font-medium">
                  Session Notes
                </label>
                <Input id="notes" name="notes" placeholder="What are you working on?" />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Starting...' : 'Clock In'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

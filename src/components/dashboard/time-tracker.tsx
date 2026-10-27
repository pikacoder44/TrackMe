'use client'

import { useState, useEffect, useTransition, useOptimistic } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { clockIn, pauseSession, resumeSession, clockOut } from '@/app/dashboard/actions'

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
}

export function TimeTracker({
  organizationId,
  activeSession,
  projects,
}: TimeTrackerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // React 19 optimistic session state bound to the activeSession prop
  const [currentSession, setOptimisticSession] = useOptimistic(
    activeSession,
    (_current, update: ActiveSession | null) => update
  )

  // Timer calculation based on currentSession
  useEffect(() => {
    if (!currentSession) {
      const timer = setTimeout(() => setElapsedSeconds(0), 0)
      return () => clearTimeout(timer)
    }

    const startTime = new Date(currentSession.started_at).getTime()
    const update = () => {
      const now = new Date().getTime()
      setElapsedSeconds(Math.max(0, Math.floor((now - startTime) / 1000)))
    }

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

  function formatTime(totalSeconds: number) {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return [hours, minutes, seconds]
      .map((val) => String(val).padStart(2, '0'))
      .join(':')
  }

  function handleClockIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const formElement = event.currentTarget
    const formData = new FormData(formElement)
    formData.append('organizationId', organizationId)

    const projectId = (formData.get('projectId') as string) || null
    const notes = (formData.get('notes') as string) || null

    // Optimistically create active session state immediately
    const tempSession: ActiveSession = {
      id: 'temp-session',
      status: 'active',
      started_at: new Date().toISOString(),
      project_id: projectId,
      notes,
      organization_id: organizationId,
    }
    setElapsedSeconds(0)

    startTransition(async () => {
      setOptimisticSession(tempSession)
      const res = await clockIn(formData)
      if (res?.error) {
        setError(res.error)
      }
    })
  }

  function handlePause() {
    if (!currentSession) return
    setError(null)
    const prev = currentSession

    startTransition(async () => {
      setOptimisticSession({ ...prev, status: 'paused' })
      const res = await pauseSession(prev.id)
      if (res?.error) {
        setError(res.error)
      }
    })
  }

  function handleResume() {
    if (!currentSession) return
    setError(null)
    const prev = currentSession

    startTransition(async () => {
      setOptimisticSession({ ...prev, status: 'active' })
      const res = await resumeSession(prev.id)
      if (res?.error) {
        setError(res.error)
      }
    })
  }

  function handleClockOut() {
    if (!currentSession) return
    setError(null)
    const prev = currentSession
    setElapsedSeconds(0)

    startTransition(async () => {
      setOptimisticSession(null)
      const res = await clockOut(prev.id)
      if (res?.error) {
        setError(res.error)
      }
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

        {/* Digital Timer Display */}
        <div className="flex flex-col items-center justify-center p-6 bg-muted/40 rounded-xl border border-dashed">
          <span className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">
            Elapsed Time
          </span>
          <span className="font-mono text-4xl sm:text-5xl font-bold tracking-tight">
            {formatTime(elapsedSeconds)}
          </span>
        </div>

        {/* Action Controls */}
        {currentSession ? (
          <div className="flex items-center gap-3">
            {currentSession.status === 'active' ? (
              <Button
                variant="outline"
                className="flex-1"
                onClick={handlePause}
                disabled={isPending}
              >
                Pause Session
              </Button>
            ) : (
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleResume}
                disabled={isPending}
              >
                Resume Session
              </Button>
            )}
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleClockOut}
              disabled={isPending}
            >
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

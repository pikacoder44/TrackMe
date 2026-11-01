'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { TimeTracker } from '@/components/dashboard/time-tracker'
import { AppUsageTable } from '@/components/dashboard/app-usage-table'
import { createClient } from '@/lib/supabase/client'
import { aggregateEventsToAppUsage } from '@/lib/telemetry'

export interface ActivityEventItem {
  id: string
  session_id?: string
  event_type: string
  window_title: string | null
  app_name: string | null
  recorded_at: string
}

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

interface EmployeeDashboardClientProps {
  organizationId: string
  activeSession: ActiveSession | null
  projects: Project[]
  initialEvents?: ActivityEventItem[]
}

export function EmployeeDashboardClient({
  organizationId,
  activeSession,
  projects,
  initialEvents = [],
}: EmployeeDashboardClientProps) {
  const router = useRouter()

  // Supabase Realtime: refresh dashboard when new telemetry events arrive from extension
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('employee:activity_events')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_events',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          router.refresh()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [organizationId, router])

  const { entries, activeSeconds, idleSeconds } = aggregateEventsToAppUsage(initialEvents)
  const totalTracked = activeSeconds + idleSeconds

  return (
    <div className="space-y-6">
      <TimeTracker
        organizationId={organizationId}
        activeSession={activeSession}
        projects={projects}
      />
      <AppUsageTable
        entries={entries}
        totalTrackedSeconds={totalTracked}
        activeSeconds={activeSeconds}
        idleSeconds={idleSeconds}
      />
    </div>
  )
}

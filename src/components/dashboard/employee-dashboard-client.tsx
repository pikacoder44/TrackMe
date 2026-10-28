'use client'

import { useState } from 'react'
import { TimeTracker } from '@/components/dashboard/time-tracker'
import { AppUsageTable, type AppUsageEntry } from '@/components/dashboard/app-usage-table'

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
}

export function EmployeeDashboardClient({
  organizationId,
  activeSession,
  projects,
}: EmployeeDashboardClientProps) {
  const [usageEntries, setUsageEntries] = useState<AppUsageEntry[]>([])
  const [activeSeconds, setActiveSeconds] = useState(0)
  const [idleSeconds, setIdleSeconds] = useState(0)

  const totalTracked = activeSeconds + idleSeconds

  function handleUsageUpdate(entries: AppUsageEntry[], active: number, idle: number) {
    setUsageEntries(entries)
    setActiveSeconds(active)
    setIdleSeconds(idle)
  }

  return (
    <div className="space-y-6">
      <TimeTracker
        organizationId={organizationId}
        activeSession={activeSession}
        projects={projects}
        onUsageUpdate={handleUsageUpdate}
      />
      <AppUsageTable
        entries={usageEntries}
        totalTrackedSeconds={totalTracked}
        activeSeconds={activeSeconds}
        idleSeconds={idleSeconds}
      />
    </div>
  )
}

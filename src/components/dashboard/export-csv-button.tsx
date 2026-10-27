'use client'

import { Button } from '@/components/ui/button'

export interface CSVEntry {
  id: string
  description: string | null
  project_name: string
  duration_seconds: number | null
  started_at: string
  ended_at: string | null
  approval_status: string
  user_name?: string
}

interface ExportCsvButtonProps {
  entries: CSVEntry[]
  filename?: string
  label?: string
}

export function ExportCsvButton({
  entries,
  filename = 'trackme-timesheets.csv',
  label = 'Export CSV',
}: ExportCsvButtonProps) {
  function handleExport() {
    if (!entries || entries.length === 0) return

    const headers = [
      'ID',
      'Description',
      'Project',
      'User',
      'Duration (Hours)',
      'Duration (Minutes)',
      'Started At',
      'Ended At',
      'Status',
    ]

    const rows = entries.map((e) => {
      const durSec = e.duration_seconds || 0
      const hours = (durSec / 3600).toFixed(2)
      const minutes = Math.round(durSec / 60)

      return [
        `"${e.id}"`,
        `"${(e.description || '').replace(/"/g, '""')}"`,
        `"${(e.project_name || 'General').replace(/"/g, '""')}"`,
        `"${(e.user_name || '').replace(/"/g, '""')}"`,
        hours,
        minutes,
        `"${new Date(e.started_at).toISOString()}"`,
        e.ended_at ? `"${new Date(e.ended_at).toISOString()}"` : '""',
        `"${e.approval_status}"`,
      ].join(',')
    })

    const csvContent = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={!entries || entries.length === 0}
    >
      {label}
    </Button>
  )
}

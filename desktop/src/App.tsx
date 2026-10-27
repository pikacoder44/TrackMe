import { useState, useEffect, useCallback, useRef } from 'react'
import {
  enqueueEvent,
  getQueuedEvents,
  clearAllQueuedEvents,
} from './lib/queue'
import { syncEvents } from './lib/sync'
import {
  saveSession,
  loadSession,
  clearSession,
  clockInApi,
  logBreakApi,
  clockOutApi,
} from './lib/session'
import { useActivityMonitor } from './lib/useActivityMonitor'
import './index.css'

type AttendanceStatus = 'clocked-out' | 'clocked-in' | 'on-break'

const SERVER_URL = 'http://localhost:3000'

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

export default function App() {
  const [status, setStatus] = useState<AttendanceStatus>('clocked-out')
  const [sessionId, setSessionId] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [clockInTime, setClockInTime] = useState<Date | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [queueCount, setQueueCount] = useState(0)
  const [syncStatus, setSyncStatus] = useState('Idle')
  const [isSyncing, setIsSyncing] = useState(false)
  const [isIdle, setIsIdle] = useState(false)
  const [lastWindow, setLastWindow] = useState('—')
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const clockInTimeRef = useRef<Date | null>(null)

  // Restore persisted session on mount
  useEffect(() => {
    const saved = loadSession()
    if (saved) {
      setSessionId(saved.sessionId)
      setOrganizationId(saved.organizationId)
      // Mark as clocked in; we don't know start time across sessions
      setStatus('clocked-in')
      setSyncStatus('Session restored')
    }
    refreshQueueCount()
  }, [])

  // Timer
  useEffect(() => {
    if (status !== 'clocked-in') return
    if (!clockInTime) return
    clockInTimeRef.current = clockInTime
    const interval = setInterval(() => {
      const now = Date.now()
      setElapsedSeconds(Math.floor((now - clockInTimeRef.current!.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [status, clockInTime])

  // Auto-sync every 30 seconds
  useEffect(() => {
    if (!sessionId || !organizationId) return
    const interval = setInterval(async () => {
      if (getQueuedEvents().length === 0) return
      setSyncStatus('Auto-syncing…')
      const res = await syncEvents({ serverUrl: SERVER_URL, sessionId, organizationId, authToken: '' })
      setSyncStatus(res.success ? `Synced at ${new Date().toLocaleTimeString()}` : 'Sync failed')
      refreshQueueCount()
    }, 30_000)
    return () => clearInterval(interval)
  }, [sessionId, organizationId])

  const refreshQueueCount = useCallback(() => {
    setQueueCount(getQueuedEvents().length)
  }, [])

  const handleTick = useCallback(() => {
    refreshQueueCount()
  }, [refreshQueueCount])

  const handleIdleChange = useCallback((idle: boolean) => {
    setIsIdle(idle)
  }, [])

  const handleWindowChange = useCallback((title: string) => {
    setLastWindow(title)
  }, [])

  // Activity monitor — only active while clocked in and not on break
  useActivityMonitor({
    enabled: status === 'clocked-in',
    onTick: handleTick,
    onIdleChange: handleIdleChange,
    onWindowChange: handleWindowChange,
  })

  async function handleClockIn() {
    setIsLoading(true)
    setStatusMessage('')
    const res = await clockInApi(SERVER_URL)
    setIsLoading(false)
    if (res.error) {
      setStatusMessage(res.error)
      return
    }
    const now = new Date()
    setSessionId(res.sessionId)
    setOrganizationId(res.organizationId)
    saveSession({ sessionId: res.sessionId, organizationId: res.organizationId })
    setClockInTime(now)
    setElapsedSeconds(0)
    setStatus('clocked-in')
    setSyncStatus('Session started')
    // Emit attendance event
    enqueueEvent(true, 'active_tick', { window_title: 'Clock In', app_name: 'TrackMe Desktop' })
    refreshQueueCount()
  }

  async function handleStartBreak() {
    setIsLoading(true)
    const res = await logBreakApi(SERVER_URL, sessionId, organizationId, 'break_start')
    setIsLoading(false)
    if (res.error) { setStatusMessage(res.error); return }
    enqueueEvent(false, 'break_start')
    setStatus('on-break')
    refreshQueueCount()
  }

  async function handleEndBreak() {
    setIsLoading(true)
    const res = await logBreakApi(SERVER_URL, sessionId, organizationId, 'break_end')
    setIsLoading(false)
    if (res.error) { setStatusMessage(res.error); return }
    enqueueEvent(true, 'break_end')
    setStatus('clocked-in')
    refreshQueueCount()
  }

  async function handleClockOut() {
    setIsLoading(true)
    setStatusMessage('')

    // Flush queue first, then clock out
    if (getQueuedEvents().length > 0 && sessionId && organizationId) {
      await syncEvents({ serverUrl: SERVER_URL, sessionId, organizationId, authToken: '' })
    }

    const res = await clockOutApi(SERVER_URL, sessionId)
    setIsLoading(false)
    if (res.error) { setStatusMessage(res.error); return }

    clearSession()
    clearAllQueuedEvents()
    setStatus('clocked-out')
    setSessionId('')
    setOrganizationId('')
    setClockInTime(null)
    setElapsedSeconds(0)
    setQueueCount(0)
    setSyncStatus('Idle')
    setIsIdle(false)
  }

  async function handleManualSync() {
    if (!sessionId || !organizationId) { setStatusMessage('No active session'); return }
    setIsSyncing(true)
    setSyncStatus('Syncing…')
    const res = await syncEvents({ serverUrl: SERVER_URL, sessionId, organizationId, authToken: '' })
    setSyncStatus(res.message || (res.success ? 'Synced' : 'Failed'))
    setIsSyncing(false)
    refreshQueueCount()
  }

  const statusColor = {
    'clocked-out': '#9ca3af',
    'clocked-in': '#22c55e',
    'on-break': '#f59e0b',
  }[status]

  const statusLabel = {
    'clocked-out': 'Off Duty',
    'clocked-in': isIdle ? 'Idle' : 'Working',
    'on-break': 'On Break',
  }[status]

  return (
    <div className="agent-shell">
      {/* Header */}
      <header className="agent-header">
        <div className="brand">
          <div className="brand-mark">T</div>
          <span className="brand-name">TrackMe</span>
        </div>
        <div className="status-pill" style={{ background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}40` }}>
          <span className="status-dot" style={{ background: statusColor }} />
          {statusLabel}
        </div>
      </header>

      {/* Timer */}
      <div className="timer-block">
        <div className="timer-label">Session Duration</div>
        <div className="timer-display">{formatDuration(elapsedSeconds)}</div>
        {lastWindow !== '—' && status === 'clocked-in' && !isIdle && (
          <div className="timer-window" title={lastWindow}>{lastWindow}</div>
        )}
      </div>

      {/* Status cards */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Queued</div>
          <div className="stat-value">{queueCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Sync</div>
          <div className="stat-value-sm">{syncStatus}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Activity</div>
          <div className="stat-value-sm">{isIdle ? 'Idle 5m+' : status === 'on-break' ? 'Paused' : status === 'clocked-in' ? 'Live' : '—'}</div>
        </div>
      </div>

      {/* Action area */}
      <div className="actions">
        {status === 'clocked-out' && (
          <button id="btn-clock-in" className="btn-primary" onClick={handleClockIn} disabled={isLoading}>
            {isLoading ? 'Connecting…' : 'Clock In'}
          </button>
        )}

        {status === 'clocked-in' && (
          <>
            <button id="btn-start-break" className="btn-secondary" onClick={handleStartBreak} disabled={isLoading}>
              Start Break
            </button>
            <button id="btn-clock-out" className="btn-destructive" onClick={handleClockOut} disabled={isLoading}>
              {isLoading ? 'Clocking out…' : 'Clock Out'}
            </button>
          </>
        )}

        {status === 'on-break' && (
          <>
            <button id="btn-end-break" className="btn-primary" onClick={handleEndBreak} disabled={isLoading}>
              End Break
            </button>
            <button id="btn-clock-out-break" className="btn-destructive" onClick={handleClockOut} disabled={isLoading}>
              Clock Out
            </button>
          </>
        )}
      </div>

      {/* Manual sync */}
      {status !== 'clocked-out' && (
        <div className="sync-row">
          <button
            id="btn-sync"
            className="btn-ghost"
            onClick={handleManualSync}
            disabled={isSyncing || queueCount === 0}
          >
            {isSyncing ? 'Syncing…' : `Sync Now (${queueCount})`}
          </button>
        </div>
      )}

      {/* Error / status message */}
      {statusMessage && (
        <div className="error-banner">{statusMessage}</div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { enqueueEvent, getQueuedEvents, clearAllQueuedEvents } from './lib/queue'
import { syncEvents, type SyncConfig } from './lib/sync'
import './App.css'

export default function App() {
  const [config, setConfig] = useState<SyncConfig>({
    serverUrl: 'http://localhost:3000',
    sessionId: '',
    organizationId: '',
    authToken: '',
  })
  const [queueCount, setQueueCount] = useState(0)
  const [isTracking, setIsTracking] = useState(false)
  const [lastActivity, setLastActivity] = useState<string>('None')
  const [syncStatus, setSyncStatus] = useState<string>('Idle')
  const [isSyncing, setIsSyncing] = useState(false)

  // Update queued count display
  const refreshQueueCount = () => {
    setQueueCount(getQueuedEvents().length)
  }

  useEffect(() => {
    refreshQueueCount()
  }, [])

  // Automated 30-second sync loop
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      if (getQueuedEvents().length > 0 && config.sessionId && config.organizationId) {
        setSyncStatus('Auto-syncing...')
        const res = await syncEvents(config)
        setSyncStatus(res.message || (res.success ? 'Synced' : 'Failed'))
        refreshQueueCount()
      }
    }, 30000)

    return () => clearInterval(syncInterval)
  }, [config])

  // Periodic activity tick generator when tracking is active
  useEffect(() => {
    if (!isTracking) return
    const tickInterval = setInterval(() => {
      enqueueEvent(true, { source: 'auto_tick', app: 'Desktop Agent' })
      setLastActivity(`Active Tick at ${new Date().toLocaleTimeString()}`)
      refreshQueueCount()
    }, 10000)

    return () => clearInterval(tickInterval)
  }, [isTracking])

  const handleSimulateTick = (isActive: boolean) => {
    enqueueEvent(isActive, { source: 'manual_simulation' })
    setLastActivity(`${isActive ? 'Active' : 'Idle'} at ${new Date().toLocaleTimeString()}`)
    refreshQueueCount()
  }

  const handleManualSync = async () => {
    setIsSyncing(true)
    setSyncStatus('Syncing...')
    const res = await syncEvents(config)
    setSyncStatus(res.message || (res.success ? `Synced ${res.count} events` : 'Failed'))
    setIsSyncing(false)
    refreshQueueCount()
  }

  const handleClearQueue = () => {
    clearAllQueuedEvents()
    refreshQueueCount()
    setSyncStatus('Queue cleared')
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '2rem auto', padding: '1.5rem', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>TrackMe Desktop Agent</h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>Local Offline Activity Sync Engine</p>
        </div>
        <span style={{
          padding: '4px 10px',
          borderRadius: '999px',
          fontSize: '0.75rem',
          fontWeight: 600,
          background: isTracking ? '#dcfce7' : '#f3f4f6',
          color: isTracking ? '#15803d' : '#6b7280'
        }}>
          {isTracking ? 'TRACKING ACTIVE' : 'STOPPED'}
        </span>
      </header>

      {/* Configuration Form */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Server URL</label>
          <input
            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box' }}
            value={config.serverUrl}
            onChange={(e) => setConfig({ ...config, serverUrl: e.target.value })}
          />
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Session ID</label>
          <input
            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box' }}
            placeholder="Work Session UUID"
            value={config.sessionId}
            onChange={(e) => setConfig({ ...config, sessionId: e.target.value })}
          />
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Organization ID</label>
          <input
            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box' }}
            placeholder="Organization UUID"
            value={config.organizationId}
            onChange={(e) => setConfig({ ...config, organizationId: e.target.value })}
          />
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Auth Token (Optional)</label>
          <input
            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box' }}
            placeholder="Bearer token if external"
            type="password"
            value={config.authToken}
            onChange={(e) => setConfig({ ...config, authToken: e.target.value })}
          />
        </div>
      </section>

      {/* Queue & Status Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div style={{ background: '#f9fafb', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Queued Events</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px' }}>{queueCount}</div>
        </div>
        <div style={{ background: '#f9fafb', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Last Activity</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 500, marginTop: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {lastActivity}
          </div>
        </div>
        <div style={{ background: '#f9fafb', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Sync Status</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 500, marginTop: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {syncStatus}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <button
          onClick={() => setIsTracking(!isTracking)}
          style={{
            padding: '10px',
            background: isTracking ? '#dc2626' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {isTracking ? 'Stop Tracking Engine' : 'Start Tracking Engine'}
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <button
            onClick={() => handleSimulateTick(true)}
            style={{ padding: '8px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}
          >
            + Active Tick
          </button>
          <button
            onClick={() => handleSimulateTick(false)}
            style={{ padding: '8px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}
          >
            + Idle Tick
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem' }}>
          <button
            onClick={handleManualSync}
            disabled={isSyncing || queueCount === 0}
            style={{
              padding: '8px',
              background: '#0f172a',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: isSyncing || queueCount === 0 ? 'not-allowed' : 'pointer',
              opacity: isSyncing || queueCount === 0 ? 0.6 : 1,
            }}
          >
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
          <button
            onClick={handleClearQueue}
            style={{ padding: '8px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}
          >
            Clear Queue
          </button>
        </div>
      </div>
    </div>
  )
}

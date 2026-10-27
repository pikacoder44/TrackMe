import { getQueuedEvents, clearSyncedEvents, type ActivityTick } from './queue'

export interface SyncConfig {
  serverUrl: string
  sessionId: string
  organizationId: string
  authToken: string
}

export interface SyncResult {
  success: boolean
  count: number
  message?: string
}

export async function syncEvents(config: SyncConfig): Promise<SyncResult> {
  const events: ActivityTick[] = getQueuedEvents()
  if (events.length === 0) {
    return { success: true, count: 0, message: 'Queue is empty' }
  }

  if (!config.sessionId || !config.organizationId) {
    return { success: false, count: 0, message: 'Missing session or organization ID' }
  }

  const endpoint = `${config.serverUrl.replace(/\/$/, '')}/api/v1/events/sync`

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: config.authToken ? `Bearer ${config.authToken}` : '',
      },
      body: JSON.stringify({
        session_id: config.sessionId,
        organization_id: config.organizationId,
        events,
      }),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      return {
        success: false,
        count: 0,
        message: errData.error || `Server responded with ${res.status}`,
      }
    }

    const data = await res.json()
    // Remove successfully processed events from buffer
    const syncedKeys = events.map((e) => e.idempotency_key)
    clearSyncedEvents(syncedKeys)

    return {
      success: true,
      count: data.synced ?? events.length,
      message: 'Sync completed successfully',
    }
  } catch (error) {
    return {
      success: false,
      count: 0,
      message: error instanceof Error ? error.message : 'Network error during sync',
    }
  }
}

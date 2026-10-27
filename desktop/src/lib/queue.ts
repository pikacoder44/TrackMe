export type EventType = 'active_tick' | 'idle_tick' | 'window_change' | 'break_start' | 'break_end'

export interface ActivityTick {
  idempotency_key: string
  timestamp: string
  is_active: boolean
  event_type: EventType
  window_title?: string
  app_name?: string
  payload?: Record<string, unknown>
}

const QUEUE_STORAGE_KEY = 'trackme_offline_event_queue'

export function getQueuedEvents(): ActivityTick[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function enqueueEvent(
  isActive: boolean,
  eventType: EventType = 'active_tick',
  extra?: { window_title?: string; app_name?: string; payload?: Record<string, unknown> }
): ActivityTick {
  const newTick: ActivityTick = {
    idempotency_key: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    is_active: isActive,
    event_type: eventType,
    window_title: extra?.window_title,
    app_name: extra?.app_name,
    payload: extra?.payload,
  }

  if (typeof window !== 'undefined') {
    const current = getQueuedEvents()
    current.push(newTick)
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(current))
  }

  return newTick
}

export function clearSyncedEvents(keysToRemove: string[]): void {
  if (typeof window === 'undefined') return
  const current = getQueuedEvents()
  const keySet = new Set(keysToRemove)
  const remaining = current.filter((tick) => !keySet.has(tick.idempotency_key))
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(remaining))
}

export function clearAllQueuedEvents(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(QUEUE_STORAGE_KEY)
  }
}

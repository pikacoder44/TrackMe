/**
 * Core business logic helpers for time accounting, session transitions, and idempotency deduplication.
 */

export interface SessionState {
  status: 'active' | 'paused' | 'completed'
  startedAt: string
  endedAt?: string
  lastTransitionAt: string
}

export type SessionTransitionAction = 'pause' | 'resume' | 'complete'

/**
 * Calculates duration in seconds between two UTC ISO timestamps.
 */
export function calculateDurationInSeconds(startTimestamp: string, endTimestamp: string): number {
  const start = new Date(startTimestamp).getTime()
  const end = new Date(endTimestamp).getTime()

  if (isNaN(start) || isNaN(end)) {
    throw new Error('Invalid timestamp provided')
  }

  if (end < start) {
    throw new Error('End timestamp cannot precede start timestamp')
  }

  return Math.floor((end - start) / 1000)
}

/**
 * Transitions a session state strictly adhering to finite state machine rules:
 * active -> paused -> active -> completed
 */
export function transitionSessionState(
  current: SessionState,
  action: SessionTransitionAction,
  nowIso: string = new Date().toISOString()
): SessionState {
  if (current.status === 'completed') {
    throw new Error('Cannot transition a completed session')
  }

  switch (action) {
    case 'pause':
      if (current.status !== 'active') {
        throw new Error(`Cannot pause a session from status: ${current.status}`)
      }
      return {
        ...current,
        status: 'paused',
        lastTransitionAt: nowIso,
      }
    case 'resume':
      if (current.status !== 'paused') {
        throw new Error(`Cannot resume a session from status: ${current.status}`)
      }
      return {
        ...current,
        status: 'active',
        lastTransitionAt: nowIso,
      }
    case 'complete':
      return {
        ...current,
        status: 'completed',
        endedAt: nowIso,
        lastTransitionAt: nowIso,
      }
    default:
      throw new Error(`Unsupported action: ${action}`)
  }
}

export interface ActivityEvent {
  idempotency_key: string
  timestamp: string
  is_active: boolean
  payload?: Record<string, unknown>
}

/**
 * Deduplicates an array of incoming activity events using their idempotency_key.
 * Returns only the first instance of each idempotency key in preserving order.
 */
export function deduplicateEvents(events: ActivityEvent[]): ActivityEvent[] {
  const seen = new Set<string>()
  const deduplicated: ActivityEvent[] = []

  for (const event of events) {
    if (!event.idempotency_key) {
      continue
    }
    if (!seen.has(event.idempotency_key)) {
      seen.add(event.idempotency_key)
      deduplicated.push(event)
    }
  }

  return deduplicated
}

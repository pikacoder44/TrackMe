import { describe, it, expect } from 'vitest'
import {
  calculateDurationInSeconds,
  transitionSessionState,
  deduplicateEvents,
  SessionState,
  ActivityEvent,
} from '@/lib/time-accounting'

describe('Time Accounting & Session Lifecycle', () => {
  describe('Duration calculations from UTC timestamps', () => {
    it('accurately computes duration in seconds between valid timestamps', () => {
      const start = '2026-10-27T10:00:00.000Z'
      const end = '2026-10-27T10:45:30.000Z'
      const duration = calculateDurationInSeconds(start, end)
      expect(duration).toBe(2730) // 45m * 60 + 30s
    })

    it('returns 0 for identical start and end timestamps', () => {
      const now = '2026-10-27T12:00:00.000Z'
      expect(calculateDurationInSeconds(now, now)).toBe(0)
    })

    it('throws error when end timestamp precedes start timestamp', () => {
      const start = '2026-10-27T11:00:00.000Z'
      const end = '2026-10-27T10:00:00.000Z'
      expect(() => calculateDurationInSeconds(start, end)).toThrow(
        'End timestamp cannot precede start timestamp'
      )
    })

    it('throws error for malformed timestamps', () => {
      expect(() => calculateDurationInSeconds('invalid-date', '2026-10-27T10:00:00.000Z')).toThrow(
        'Invalid timestamp provided'
      )
    })
  })

  describe('Session state transitions (active -> paused -> completed)', () => {
    it('transitions active -> paused -> active -> completed', () => {
      const initial: SessionState = {
        status: 'active',
        startedAt: '2026-10-27T10:00:00.000Z',
        lastTransitionAt: '2026-10-27T10:00:00.000Z',
      }

      // 1. Pause
      const paused = transitionSessionState(initial, 'pause', '2026-10-27T10:15:00.000Z')
      expect(paused.status).toBe('paused')
      expect(paused.lastTransitionAt).toBe('2026-10-27T10:15:00.000Z')

      // 2. Resume
      const resumed = transitionSessionState(paused, 'resume', '2026-10-27T10:20:00.000Z')
      expect(resumed.status).toBe('active')
      expect(resumed.lastTransitionAt).toBe('2026-10-27T10:20:00.000Z')

      // 3. Complete
      const completed = transitionSessionState(resumed, 'complete', '2026-10-27T11:00:00.000Z')
      expect(completed.status).toBe('completed')
      expect(completed.endedAt).toBe('2026-10-27T11:00:00.000Z')
    })

    it('prevents invalid transitions like pausing an already paused session', () => {
      const pausedState: SessionState = {
        status: 'paused',
        startedAt: '2026-10-27T10:00:00.000Z',
        lastTransitionAt: '2026-10-27T10:10:00.000Z',
      }

      expect(() => transitionSessionState(pausedState, 'pause')).toThrow(
        'Cannot pause a session from status: paused'
      )
    })

    it('prevents transitioning completed sessions', () => {
      const completedState: SessionState = {
        status: 'completed',
        startedAt: '2026-10-27T10:00:00.000Z',
        endedAt: '2026-10-27T11:00:00.000Z',
        lastTransitionAt: '2026-10-27T11:00:00.000Z',
      }

      expect(() => transitionSessionState(completedState, 'resume')).toThrow(
        'Cannot transition a completed session'
      )
    })
  })

  describe('Event batch deduplication matching idempotency key logic', () => {
    it('deduplicates duplicate events by idempotency key preserving first occurrence', () => {
      const rawEvents: ActivityEvent[] = [
        {
          idempotency_key: 'key-1',
          timestamp: '2026-10-27T10:00:00.000Z',
          is_active: true,
          payload: { app: 'VS Code' },
        },
        {
          idempotency_key: 'key-2',
          timestamp: '2026-10-27T10:00:30.000Z',
          is_active: true,
          payload: { app: 'Slack' },
        },
        {
          idempotency_key: 'key-1', // Duplicate
          timestamp: '2026-10-27T10:00:00.000Z',
          is_active: true,
          payload: { app: 'VS Code Retry' },
        },
        {
          idempotency_key: 'key-3',
          timestamp: '2026-10-27T10:01:00.000Z',
          is_active: false,
          payload: { app: 'Idle' },
        },
        {
          idempotency_key: 'key-2', // Duplicate
          timestamp: '2026-10-27T10:00:30.000Z',
          is_active: true,
        },
      ]

      const result = deduplicateEvents(rawEvents)

      expect(result).toHaveLength(3)
      expect(result.map((e) => e.idempotency_key)).toEqual(['key-1', 'key-2', 'key-3'])
      expect(result[0].payload).toEqual({ app: 'VS Code' })
    })

    it('returns empty array when input is empty', () => {
      expect(deduplicateEvents([])).toEqual([])
    })
  })
})

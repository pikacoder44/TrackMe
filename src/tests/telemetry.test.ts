import { describe, it, expect } from 'vitest'
import {
  extractDomain,
  deriveAppName,
  categorizeIdleState,
  prepareSyncBatch,
  getAppProductivity,
  aggregateEventsToAppUsage,
  formatDurationHHMMSS,
} from '@/lib/telemetry'

describe('Telemetry & Extension Processing Logic', () => {
  describe('extractDomain', () => {
    it('extracts hostname from http and https URLs', () => {
      expect(extractDomain('https://github.com/pikacoder44/TrackMe')).toBe('github.com')
      expect(extractDomain('http://localhost:3000/dashboard')).toBe('localhost')
      expect(extractDomain('https://sub.domain.co.uk/path?param=1')).toBe('sub.domain.co.uk')
    })

    it('returns empty string for invalid or missing URLs', () => {
      expect(extractDomain('')).toBe('')
      expect(extractDomain(undefined)).toBe('')
      expect(extractDomain('not a url')).toBe('')
    })

    it('handles chrome and about protocols gracefully', () => {
      expect(extractDomain('chrome://extensions')).toBe('chrome')
      expect(extractDomain('about:blank')).toBe('about')
    })
  })

  describe('deriveAppName', () => {
    it('correctly maps known SaaS and developer platforms', () => {
      expect(deriveAppName('https://github.com/trending')).toBe('GitHub')
      expect(deriveAppName('https://docs.google.com/document/d/123')).toBe('Google Docs')
      expect(deriveAppName('https://app.slack.com/client/T123')).toBe('Slack')
      expect(deriveAppName('https://linear.app/team/issue')).toBe('Linear')
      expect(deriveAppName('https://www.figma.com/file/xyz')).toBe('Figma')
      expect(deriveAppName('http://localhost:3000')).toBe('Localhost / Dev Server')
    })

    it('capitalizes root domain for unknown web services', () => {
      expect(deriveAppName('https://example.com/blog')).toBe('Example')
      expect(deriveAppName('https://dashboard.stripe.com/payments')).toBe('Stripe')
    })

    it('falls back to window title or default browser if domain is not present', () => {
      expect(deriveAppName('', 'My Project - Visual Studio Code')).toBe('My Project - Visual Studi...')
      expect(deriveAppName('', '')).toBe('Web Browser')
    })
  })

  describe('categorizeIdleState', () => {
    it('categorizes active as active_tick', () => {
      const res = categorizeIdleState('active')
      expect(res.isActive).toBe(true)
      expect(res.eventType).toBe('active_tick')
    })

    it('categorizes idle and locked as idle_tick', () => {
      const idleRes = categorizeIdleState('idle')
      expect(idleRes.isActive).toBe(false)
      expect(idleRes.eventType).toBe('idle_tick')

      const lockedRes = categorizeIdleState('locked')
      expect(lockedRes.isActive).toBe(false)
      expect(lockedRes.eventType).toBe('idle_tick')
    })
  })

  describe('prepareSyncBatch', () => {
    it('partitions queue into batch and remaining properly', () => {
      const items = Array.from({ length: 65 }, (_, i) => ({ id: i }))
      const { batch, remaining } = prepareSyncBatch(items, 50)

      expect(batch).toHaveLength(50)
      expect(remaining).toHaveLength(15)
      expect(batch[0].id).toBe(0)
      expect(remaining[0].id).toBe(50)
    })

    it('handles queues smaller than batchSize', () => {
      const items = [{ id: 1 }, { id: 2 }]
      const { batch, remaining } = prepareSyncBatch(items, 50)

      expect(batch).toHaveLength(2)
      expect(remaining).toHaveLength(0)
    })
  })

  describe('getAppProductivity & aggregateEventsToAppUsage', () => {
    it('classifies apps into appropriate productivity tiers', () => {
      const { category, productivity } = getAppProductivity('GitHub')
      expect(category).toBe('Development')
      expect(productivity).toBe('Productive')

      const ai = getAppProductivity('ChatGPT')
      expect(ai.category).toBe('Artificial Intelligence')
      expect(ai.productivity).toBe('Productive')

      const entertainment = getAppProductivity('YouTube')
      expect(entertainment.category).toBe('Entertainment')
      expect(entertainment.productivity).toBe('Non-productive')
    })

    it('aggregates real activity events into app usage entries', () => {
      const rawEvents = [
        { app_name: 'GitHub', event_type: 'active_tick' },
        { app_name: 'GitHub', event_type: 'active_tick' },
        { app_name: 'GitHub', event_type: 'idle_tick' },
        { app_name: 'YouTube', event_type: 'active_tick' },
      ]

      const { entries, activeSeconds, idleSeconds } = aggregateEventsToAppUsage(rawEvents, 15)

      expect(activeSeconds).toBe(45) // 3 active ticks * 15s
      expect(idleSeconds).toBe(15) // 1 idle tick * 15s
      expect(entries).toHaveLength(2)

      const github = entries.find((e) => e.app === 'GitHub')!
      expect(github.seconds).toBe(45)
      expect(github.activityPct).toBe(67)
      expect(github.inactivePct).toBe(33)
      expect(github.productivity).toBe('Productive')

      const youtube = entries.find((e) => e.app === 'YouTube')!
      expect(youtube.seconds).toBe(15)
      expect(youtube.activityPct).toBe(50) // Capped at 50% for 1 tick short visits
      expect(youtube.inactivePct).toBe(50)
    })

    it('returns empty array when events list is empty', () => {
      const { entries, activeSeconds, idleSeconds } = aggregateEventsToAppUsage([])
      expect(entries).toEqual([])
      expect(activeSeconds).toBe(0)
      expect(idleSeconds).toBe(0)
    })

    it('formats duration in HH:MM:SS cleanly', () => {
      expect(formatDurationHHMMSS(15)).toBe('00:00:15')
      expect(formatDurationHHMMSS(65)).toBe('00:01:05')
      expect(formatDurationHHMMSS(3665)).toBe('01:01:05')
      expect(formatDurationHHMMSS(0)).toBe('00:00:00')
    })
  })
})

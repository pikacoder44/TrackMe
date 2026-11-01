/**
 * Telemetry and Domain classification logic shared between Extension and Supervisory Hub.
 */

export interface TelemetryTick {
  idempotency_key: string
  timestamp: string
  is_active: boolean
  event_type: 'active_tick' | 'idle_tick' | 'break_start' | 'break_end'
  window_title?: string
  app_name?: string
  payload?: Record<string, unknown>
}

const DOMAIN_MAP: Record<string, string> = {
  'github.com': 'GitHub',
  'gitlab.com': 'GitLab',
  'bitbucket.org': 'Bitbucket',
  'stackoverflow.com': 'Stack Overflow',
  'docs.google.com': 'Google Docs',
  'sheets.google.com': 'Google Sheets',
  'slides.google.com': 'Google Slides',
  'drive.google.com': 'Google Drive',
  'mail.google.com': 'Gmail',
  'calendar.google.com': 'Google Calendar',
  'google.com': 'Google Search',
  'notion.so': 'Notion',
  'linear.app': 'Linear',
  'slack.com': 'Slack',
  'figma.com': 'Figma',
  'jira.atlassian.com': 'Jira',
  'atlassian.net': 'Atlassian',
  'trello.com': 'Trello',
  'youtube.com': 'YouTube',
  'linkedin.com': 'LinkedIn',
  'twitter.com': 'X / Twitter',
  'x.com': 'X / Twitter',
  'reddit.com': 'Reddit',
  'localhost': 'Localhost / Dev Server',
  '127.0.0.1': 'Localhost / Dev Server',
}

/**
 * Extracts normalized hostname or domain from URL string.
 */
export function extractDomain(url?: string): string {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.hostname.toLowerCase()
    }
    return parsed.protocol.replace(':', '')
  } catch {
    return ''
  }
}

/**
 * Derives human-friendly application name from URL and window title.
 */
export function deriveAppName(url?: string, title?: string): string {
  const domain = extractDomain(url)

  for (const [key, name] of Object.entries(DOMAIN_MAP)) {
    if (domain === key || domain.endsWith('.' + key)) {
      return name
    }
  }

  if (domain && domain !== 'http' && domain !== 'https') {
    const parts = domain.split('.')
    if (parts.length >= 2) {
      const mainPart = parts[parts.length - 2]
      return mainPart.charAt(0).toUpperCase() + mainPart.slice(1)
    }
    return domain.charAt(0).toUpperCase() + domain.slice(1)
  }

  if (title) {
    const cleanTitle = title.trim()
    if (cleanTitle.length > 25) {
      return cleanTitle.slice(0, 25) + '...'
    }
    return cleanTitle
  }

  return 'Web Browser'
}

/**
 * Categorizes an idle state into event_type and boolean active flag.
 */
export function categorizeIdleState(state: 'active' | 'idle' | 'locked'): {
  isActive: boolean
  eventType: 'active_tick' | 'idle_tick'
} {
  const isActive = state === 'active'
  return {
    isActive,
    eventType: isActive ? 'active_tick' : 'idle_tick',
  }
}

/**
 * Batch slices a queue up to batchSize items.
 */
export function prepareSyncBatch<T>(queue: T[], batchSize = 50): {
  batch: T[]
  remaining: T[]
} {
  return {
    batch: queue.slice(0, batchSize),
    remaining: queue.slice(batchSize),
  }
}

export type ProductivityRating = 'Productive' | 'Neutral' | 'Non-productive' | 'Unset'

export interface AggregatedAppUsage {
  app: string
  category: string
  productivity: ProductivityRating
  activityPct: number
  inactivePct: number
  seconds: number
}

/**
 * Classifies an application name into category and productivity status.
 */
export function getAppProductivity(appName: string): {
  category: string
  productivity: ProductivityRating
} {
  const name = appName.toLowerCase()
  if (
    name.includes('code') ||
    name.includes('github') ||
    name.includes('gitlab') ||
    name.includes('terminal') ||
    name.includes('stack overflow') ||
    name.includes('localhost') ||
    name.includes('linear') ||
    name.includes('jira') ||
    name.includes('bitbucket')
  ) {
    return { category: 'Development', productivity: 'Productive' }
  }
  if (name.includes('claude') || name.includes('chatgpt') || name.includes('openai')) {
    return { category: 'Artificial Intelligence', productivity: 'Productive' }
  }
  if (name.includes('slack') || name.includes('gmail') || name.includes('meet') || name.includes('zoom')) {
    return { category: 'Communication', productivity: 'Productive' }
  }
  if (name.includes('discord')) {
    return { category: 'Communication', productivity: 'Neutral' }
  }
  if (name.includes('notion') || name.includes('figma') || name.includes('docs') || name.includes('sheets')) {
    return { category: 'Productivity', productivity: 'Productive' }
  }
  if (name.includes('youtube') || name.includes('spotify') || name.includes('reddit') || name.includes('twitter') || name.includes('x / twitter')) {
    return { category: 'Entertainment', productivity: 'Non-productive' }
  }
  if (name.includes('chrome') || name.includes('firefox') || name.includes('browser')) {
    return { category: 'Browsing', productivity: 'Neutral' }
  }
  return { category: 'General', productivity: 'Neutral' }
}

/**
 * Formats duration in seconds into clean HH:MM:SS format
 * (e.g. 15s -> "00:00:15", 90s -> "00:01:30", 3720s -> "01:02:00")
 */
export function formatDurationHHMMSS(seconds: number): string {
  const safeSec = Math.max(0, Math.floor(seconds))
  const h = Math.floor(safeSec / 3600)
  const m = Math.floor((safeSec % 3600) / 60)
  const s = safeSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

/**
 * Aggregates raw activity events into structured app usage entries.
 * Calculates activity percentage from the ratio of active vs idle ticks:
 * - total_ticks = active_ticks + idle_ticks
 * - activity_pct = total_ticks > 0 ? Math.round((active_ticks / total_ticks) * 100) : 0
 * - inactive_pct = 100 - activity_pct
 * When total time spent on a site is extremely small (<= 1 tick / 15 seconds),
 * short visits are represented accurately (capped at 50%) rather than a misleading solid 100% bar.
 */
export function aggregateEventsToAppUsage(
  events: { app_name: string | null; event_type: string }[],
  tickSeconds = 15
): {
  entries: AggregatedAppUsage[]
  activeSeconds: number
  idleSeconds: number
} {
  const appMap = new Map<string, { activeTicks: number; idleTicks: number }>()
  let activeSeconds = 0
  let idleSeconds = 0

  for (const e of events) {
    const app = e.app_name || 'Web Browser'
    if (!appMap.has(app)) {
      appMap.set(app, { activeTicks: 0, idleTicks: 0 })
    }
    const stat = appMap.get(app)!
    if (e.event_type === 'active_tick') {
      stat.activeTicks++
      activeSeconds += tickSeconds
    } else if (e.event_type === 'idle_tick') {
      stat.idleTicks++
      idleSeconds += tickSeconds
    }
  }

  const entries: AggregatedAppUsage[] = Array.from(appMap.entries()).map(([app, stat]) => {
    const totalTicks = stat.activeTicks + stat.idleTicks
    const seconds = totalTicks * tickSeconds

    let activityPct = totalTicks > 0 ? Math.round((stat.activeTicks / totalTicks) * 100) : 0

    // When total time spent on a site is extremely small (e.g. <= 1 tick / 15 seconds),
    // cap short visits at 50% so they do not render as a misleading solid 100% bar
    if (totalTicks <= 1 && activityPct > 50) {
      activityPct = 50
    }

    const inactivePct = Math.max(0, 100 - activityPct)
    const { category, productivity } = getAppProductivity(app)

    return {
      app,
      category,
      productivity,
      activityPct,
      inactivePct,
      seconds,
    }
  })

  entries.sort((a, b) => b.seconds - a.seconds)

  return { entries, activeSeconds, idleSeconds }
}

export interface SessionInfo {
  sessionId: string
  organizationId: string
}

const SESSION_KEY = 'trackme_active_session'

export function saveSession(info: SessionInfo): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(info))
}

export function loadSession(): SessionInfo | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}

/** Clock in: creates a work session and returns its id + org id */
export async function clockInApi(serverUrl: string): Promise<SessionInfo & { error?: string }> {
  try {
    const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/v1/sessions/clock-in`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { sessionId: '', organizationId: '', error: err.error || `Error ${res.status}` }
    }
    return await res.json()
  } catch (e) {
    return { sessionId: '', organizationId: '', error: e instanceof Error ? e.message : 'Network error' }
  }
}

/** Log a break_start or break_end event */
export async function logBreakApi(
  serverUrl: string,
  sessionId: string,
  organizationId: string,
  type: 'break_start' | 'break_end'
): Promise<{ error?: string }> {
  try {
    const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/v1/sessions/break`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, organization_id: organizationId, type }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { error: err.error || `Error ${res.status}` }
    }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' }
  }
}

/** Clock out: ends the work session */
export async function clockOutApi(
  serverUrl: string,
  sessionId: string
): Promise<{ error?: string }> {
  try {
    const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/v1/sessions/clock-out`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { error: err.error || `Error ${res.status}` }
    }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' }
  }
}

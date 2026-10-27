import { useEffect, useRef, useCallback } from 'react'
import { enqueueEvent } from './queue'

const IDLE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes
const TICK_INTERVAL_MS = 10_000          // emit a tick every 10 s
const WINDOW_POLL_MS = 5_000             // poll active window every 5 s (simulated in browser)

export type MonitorState = 'active' | 'break' | 'idle' | 'off'

interface UseActivityMonitorOptions {
  enabled: boolean
  onIdleChange?: (isIdle: boolean) => void
  onWindowChange?: (title: string, app: string) => void
  onTick?: () => void
}

/**
 * Monitors keyboard/mouse activity, emits active_tick / idle_tick events,
 * and simulates window-title polling.
 *
 * shortcut: window polling is simulated via document.title in the browser
 * context. Real active-window detection requires the Tauri Rust side
 * (`tauri::command` → active-win) and should be wired in when building the
 * native binary.
 */
export function useActivityMonitor({
  enabled,
  onIdleChange,
  onWindowChange,
  onTick,
}: UseActivityMonitorOptions) {
  const lastActivityRef = useRef<number>(Date.now())
  const isIdleRef = useRef<boolean>(false)
  const prevWindowRef = useRef<string>('')

  // Reset idle timer on any user input
  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
    if (isIdleRef.current) {
      isIdleRef.current = false
      onIdleChange?.(false)
    }
  }, [onIdleChange])

  useEffect(() => {
    if (!enabled) return

    const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, resetActivity, { passive: true }))

    // Idle checker: runs every second
    const idleChecker = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current > IDLE_THRESHOLD_MS
      if (idle && !isIdleRef.current) {
        isIdleRef.current = true
        onIdleChange?.(true)
      }
    }, 1000)

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetActivity))
      clearInterval(idleChecker)
    }
  }, [enabled, resetActivity, onIdleChange])

  // Activity tick emitter
  useEffect(() => {
    if (!enabled) return

    const tickInterval = setInterval(() => {
      const isIdle = Date.now() - lastActivityRef.current > IDLE_THRESHOLD_MS
      enqueueEvent(!isIdle, isIdle ? 'idle_tick' : 'active_tick', {
        window_title: document.title || 'Unknown',
        app_name: 'TrackMe Desktop',
      })
      onTick?.()
    }, TICK_INTERVAL_MS)

    return () => clearInterval(tickInterval)
  }, [enabled, onTick])

  // Simulated window-title change detection
  useEffect(() => {
    if (!enabled) return

    const pollInterval = setInterval(() => {
      const currentTitle = document.title || 'Unknown'
      if (currentTitle !== prevWindowRef.current) {
        prevWindowRef.current = currentTitle
        enqueueEvent(true, 'window_change', {
          window_title: currentTitle,
          app_name: 'TrackMe Desktop',
        })
        onWindowChange?.(currentTitle, 'TrackMe Desktop')
      }
    }, WINDOW_POLL_MS)

    return () => clearInterval(pollInterval)
  }, [enabled, onWindowChange])
}

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface IngestionEvent {
  idempotency_key?: string
  timestamp?: string
  is_active?: boolean
  event_type?: string
  window_title?: string | null
  app_name?: string | null
  payload?: Record<string, unknown>
}

interface IngestionPayload {
  session_id?: string | null
  organization_id?: string | null
  events?: IngestionEvent[]
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUuid(val: unknown): val is string {
  return typeof val === 'string' && UUID_REGEX.test(val.trim())
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Safe JSON parsing
    let body: IngestionPayload
    try {
      body = (await request.json()) as IngestionPayload
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body. Please provide a valid JSON payload.' },
        { status: 400 }
      )
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body: expected JSON object.' },
        { status: 400 }
      )
    }

    const { session_id, organization_id, events } = body

    if (!Array.isArray(events)) {
      return NextResponse.json(
        { error: 'Invalid payload: "events" must be an array.' },
        { status: 400 }
      )
    }

    if (events.length === 0) {
      return NextResponse.json({ message: 'No events to sync', count: 0 })
    }

    // Resolve and validate organization_id
    let orgId = organization_id
    if (!orgId || !isValidUuid(orgId)) {
      // Fallback: look up user's primary organization membership
      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      orgId = membership?.organization_id
    }

    if (!orgId || !isValidUuid(orgId)) {
      return NextResponse.json(
        { error: 'Missing or invalid organization_id: must be a valid organization UUID.' },
        { status: 400 }
      )
    }

    // Validate session_id format (must be valid UUID or null to avoid Postgres syntax error)
    const safeSessionId = isValidUuid(session_id) ? session_id : null

    // Transform events with robust fallbacks
    const records = events.map((event) => {
      const idempotencyKey = isValidUuid(event.idempotency_key)
        ? event.idempotency_key
        : crypto.randomUUID()

      const isActive = typeof event.is_active === 'boolean' ? event.is_active : true
      const eventType = event.event_type || (isActive ? 'active_tick' : 'idle_tick')

      const windowTitle =
        typeof event.window_title === 'string' && event.window_title.trim().length > 0
          ? event.window_title.trim()
          : 'Active Window'

      const appName =
        typeof event.app_name === 'string' && event.app_name.trim().length > 0
          ? event.app_name.trim()
          : 'Web Browser'

      // Safe ISO timestamp
      let recordedAt = new Date().toISOString()
      if (event.timestamp) {
        const parsed = new Date(event.timestamp)
        if (!isNaN(parsed.getTime())) {
          recordedAt = parsed.toISOString()
        }
      }

      return {
        organization_id: orgId,
        session_id: safeSessionId,
        user_id: user.id,
        idempotency_key: idempotencyKey,
        event_type: eventType,
        window_title: windowTitle,
        app_name: appName,
        payload:
          event.payload && typeof event.payload === 'object'
            ? event.payload
            : { is_active: isActive },
        recorded_at: recordedAt,
      }
    })

    // Insert / Upsert with detailed try/catch and error inspection
    try {
      let { data, error } = await supabase
        .from('activity_events')
        .upsert(records, { onConflict: 'idempotency_key', ignoreDuplicates: true })
        .select('id')

      // Handle foreign key error if session_id is stale / not found
      if (error && error.code === '23503' && safeSessionId) {
        console.warn(
          '[SYNC_WARN] Foreign key constraint on session_id failed; retrying with session_id: null'
        )
        const fallbackRecords = records.map((r) => ({ ...r, session_id: null }))
        const retryResult = await supabase
          .from('activity_events')
          .upsert(fallbackRecords, { onConflict: 'idempotency_key', ignoreDuplicates: true })
          .select('id')
        data = retryResult.data
        error = retryResult.error
      }

      // Handle schema column missing error (e.g. PGRST204 if app_name/window_title column pending in schema cache)
      if (error && (error.code === 'PGRST204' || error.message?.includes('column'))) {
        console.warn(
          '[SYNC_WARN] Column missing in schema cache; retrying with app_name & window_title stored inside payload'
        )
        const payloadOnlyRecords = records.map((r) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { app_name, window_title, ...rest } = r
          return {
            ...rest,
            payload: {
              ...(typeof r.payload === 'object' && r.payload !== null ? r.payload : {}),
              app_name: r.app_name,
              window_title: r.window_title,
            },
          }
        })
        const retryPayloadRes = await supabase
          .from('activity_events')
          .insert(payloadOnlyRecords)
          .select('id')
        data = retryPayloadRes.data
        error = retryPayloadRes.error
      }

      // Handle partial index conflict target error if PostgREST requires plain insert
      if (error && (error.code === '42P10' || error.message?.includes('ON CONFLICT'))) {
        console.warn('[SYNC_WARN] Upsert conflict target error, attempting plain insert')
        const insertResult = await supabase
          .from('activity_events')
          .insert(records)
          .select('id')
        data = insertResult.data
        error = insertResult.error
      }

      if (error) {
        console.error('[SYNC_ERROR]', error)
        return NextResponse.json(
          {
            error: error.message || 'Database error during event sync',
            code: error.code,
            details: error.details,
            hint: error.hint,
          },
          { status: 500 }
        )
      }

      return NextResponse.json({
        status: 'success',
        received: events.length,
        synced: data?.length ?? events.length,
      })
    } catch (insertErr: unknown) {
      console.error('[SYNC_ERROR] Exception during Supabase insert:', insertErr)
      const message = insertErr instanceof Error ? insertErr.message : 'Database execution error'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  } catch (err: unknown) {
    console.error('[SYNC_ERROR] Unhandled exception in /api/v1/events/sync:', err)
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

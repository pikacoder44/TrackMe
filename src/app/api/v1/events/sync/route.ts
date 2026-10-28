import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface IngestionEvent {
  idempotency_key: string
  timestamp: string
  is_active: boolean
  event_type?: string
  window_title?: string
  app_name?: string
  payload?: Record<string, unknown>
}

interface IngestionPayload {
  session_id: string
  organization_id: string
  events: IngestionEvent[]
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

    const body = (await request.json()) as IngestionPayload
    const { session_id, organization_id, events } = body

    if (!session_id || !organization_id || !Array.isArray(events)) {
      return NextResponse.json(
        { error: 'Invalid payload: session_id, organization_id, and events array required' },
        { status: 400 }
      )
    }

    if (events.length === 0) {
      return NextResponse.json({ message: 'No events to sync', count: 0 })
    }

    const records = events.map((event) => ({
      organization_id,
      session_id,
      user_id: user.id,
      idempotency_key: event.idempotency_key,
      event_type: event.event_type ?? (event.is_active ? 'active_tick' : 'idle_tick'),
      window_title: event.window_title ?? null,
      app_name: event.app_name ?? null,
      payload: event.payload ?? { is_active: event.is_active },
      recorded_at: event.timestamp || new Date().toISOString(),
    }))

    const { data, error } = await supabase
      .from('activity_events')
      .upsert(records, { onConflict: 'idempotency_key', ignoreDuplicates: true })
      .select('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      status: 'success',
      received: events.length,
      synced: data?.length ?? events.length,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

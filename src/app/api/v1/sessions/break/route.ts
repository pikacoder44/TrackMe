import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}

/** POST /api/v1/sessions/break
 * Body: { session_id, organization_id, type: 'break_start' | 'break_end' }
 * Updates session status and inserts a break activity event.
 */
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

    const { session_id, organization_id, type } = await request.json()

    if (!session_id || !organization_id || !['break_start', 'break_end'].includes(type)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const newStatus = type === 'break_start' ? 'paused' : 'active'

    const [sessionUpdate, eventInsert] = await Promise.all([
      supabase
        .from('work_sessions')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', session_id)
        .eq('user_id', user.id),
      supabase.from('activity_events').insert({
        organization_id,
        session_id,
        user_id: user.id,
        event_type: type,
        timestamp: new Date().toISOString(),
      }),
    ])

    if (sessionUpdate.error) return NextResponse.json({ error: sessionUpdate.error.message }, { status: 500 })
    if (eventInsert.error) return NextResponse.json({ error: eventInsert.error.message }, { status: 500 })

    return NextResponse.json({ status: 'ok' })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}

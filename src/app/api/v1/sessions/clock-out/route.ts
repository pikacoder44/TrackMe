import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}

/** POST /api/v1/sessions/clock-out
 * Body: { session_id }
 * Ends the session and creates a time_entry record.
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

    const { session_id } = await request.json()
    if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 })

    const now = new Date()
    const nowIso = now.toISOString()

    const { data: session, error: fetchError } = await supabase
      .from('work_sessions')
      .select('id, organization_id, project_id, started_at, notes')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !session) {
      return NextResponse.json({ error: fetchError?.message || 'Session not found' }, { status: 404 })
    }

    const durationSeconds = Math.max(
      0,
      Math.floor((now.getTime() - new Date(session.started_at).getTime()) / 1000)
    )

    const [sessionUpdate, timeEntry] = await Promise.all([
      supabase
        .from('work_sessions')
        .update({ status: 'completed', ended_at: nowIso, updated_at: nowIso })
        .eq('id', session_id)
        .eq('user_id', user.id),
      supabase.from('time_entries').insert({
        organization_id: session.organization_id,
        session_id: session.id,
        user_id: user.id,
        project_id: session.project_id,
        entry_type: 'automatic',
        approval_status: 'pending',
        started_at: session.started_at,
        ended_at: nowIso,
        duration_seconds: durationSeconds,
        description: session.notes,
      }),
    ])

    if (sessionUpdate.error) return NextResponse.json({ error: sessionUpdate.error.message }, { status: 500 })
    if (timeEntry.error) return NextResponse.json({ error: timeEntry.error.message }, { status: 500 })

    return NextResponse.json({ status: 'ok', duration_seconds: durationSeconds })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}

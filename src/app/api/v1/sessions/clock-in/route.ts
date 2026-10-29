import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}

/** POST /api/v1/sessions/clock-in
 * Creates a new active work session for the authenticated user.
 * Returns { sessionId, organizationId }
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch first org membership
    const { data: membership, error: memberError } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (memberError || !membership) {
      return NextResponse.json({ error: 'No organization membership found' }, { status: 403 })
    }

    const organizationId = membership.organization_id

    // Upsert: complete any stale open sessions first (idempotent)
    await supabase
      .from('work_sessions')
      .update({ status: 'completed', ended_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .in('status', ['active', 'paused'])

    const { data: session, error: insertError } = await supabase
      .from('work_sessions')
      .insert({
        organization_id: organizationId,
        user_id: user.id,
        status: 'active',
        started_at: new Date().toISOString(),
      })
      .select('id, organization_id')
      .single()

    if (insertError || !session) {
      return NextResponse.json({ error: insertError?.message || 'Failed to create session' }, { status: 500 })
    }

    return NextResponse.json({ sessionId: session.id, organizationId: session.organization_id })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}

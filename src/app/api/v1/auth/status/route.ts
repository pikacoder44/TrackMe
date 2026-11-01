import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}

/**
 * GET /api/v1/auth/status
 * Extension endpoint to check current employee authentication and approval status.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ authenticated: false }, { status: 200 })
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role, approval_status')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    const approvalStatus = membership?.approval_status || 'approved'

    return NextResponse.json({
      authenticated: true,
      userId: user.id,
      email: user.email,
      organizationId: membership?.organization_id || null,
      role: membership?.role || 'employee',
      approvalStatus,
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}

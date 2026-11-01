import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveUserSystemRole } from '@/lib/auth-rbac'

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

    const [roleData, profileResult, memberResult] = await Promise.all([
      resolveUserSystemRole(supabase, user),
      supabase
        .from('profiles')
        .select('full_name, email, username')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('organization_members')
        .select('organization_id, role, approval_status, organization:organizations(name)')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle(),
    ])

    const profile = profileResult.data
    const member = memberResult.data
    const orgName = (member?.organization as unknown as { name?: string })?.name || null

    return NextResponse.json({
      authenticated: true,
      userId: user.id,
      email: user.email,
      fullName: profile?.full_name || user.email?.split('@')[0],
      username: profile?.username || null,
      organizationId: roleData.organizationId || member?.organization_id || null,
      organizationName: orgName,
      role: roleData.role,
      approvalStatus: roleData.approvalStatus,
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}

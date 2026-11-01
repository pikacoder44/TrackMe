import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveUserSystemRole } from '@/lib/auth-rbac'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}

/**
 * POST /api/v1/auth/login
 * Supabase token authentication endpoint for extension and external clients.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const usernameOrEmail = (body.usernameOrEmail || body.email || body.username || '').trim()
    const password = (body.password || '').trim()

    if (!usernameOrEmail || !password) {
      return NextResponse.json(
        { error: 'Username/Email and password are required.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    let targetEmail = usernameOrEmail

    // Resolve username to email if needed
    if (!usernameOrEmail.includes('@')) {
      const { data: resolvedEmail, error: rpcErr } = await supabase.rpc(
        'get_email_by_username',
        { p_username: usernameOrEmail }
      )

      if (!rpcErr && resolvedEmail) {
        targetEmail = resolvedEmail
      } else {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .ilike('username', usernameOrEmail)
          .maybeSingle()

        if (profile?.email) {
          targetEmail = profile.email
        } else {
          return NextResponse.json(
            { error: 'Invalid username or password.' },
            { status: 401 }
          )
        }
      }
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: targetEmail,
      password,
    })

    if (authError || !authData.user || !authData.session) {
      return NextResponse.json(
        { error: authError?.message || 'Invalid username or password.' },
        { status: 401 }
      )
    }

    const user = authData.user
    const session = authData.session

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
      success: true,
      token: session.access_token,
      expiresAt: session.expires_at,
      user: {
        id: user.id,
        email: user.email,
        fullName: profile?.full_name || user.email?.split('@')[0],
        username: profile?.username || null,
        organizationId: roleData.organizationId || member?.organization_id || null,
        organizationName: orgName,
        role: roleData.role,
        approvalStatus: roleData.approvalStatus,
      },
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}

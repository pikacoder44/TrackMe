'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveUserSystemRole } from '@/lib/auth-rbac'

export async function login(formData: FormData) {
  const usernameOrEmail = (
    (formData.get('username') as string) ||
    (formData.get('email') as string) ||
    ''
  ).trim()
  const password = ((formData.get('password') as string) || '').trim()

  if (!usernameOrEmail || !password) {
    return { error: 'Username/Email and password are required' }
  }

  let targetEmail = usernameOrEmail
  const supabase = await createClient()

  try {
    // If not an email format, resolve username to email via RPC or profile lookup
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
          return { error: 'Invalid username or password' }
        }
      }
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: targetEmail,
      password,
    })

    if (authError || !authData.user) {
      console.error('SUPABASE AUTH ERROR:', authError)
      return { error: authError?.message || 'Invalid username or password' }
    }

    // Retroactive recovery for pre-approved managers whose organization membership was not transferred
    const adminClient = createAdminClient()
    if (adminClient) {
      const { data: currentMember } = await adminClient
        .from('organization_members')
        .select('id, organization_id')
        .eq('user_id', authData.user.id)
        .maybeSingle()

      if (!currentMember) {
        // Check if there is an unassociated organization membership matching this user's username or email
        const userEmail = authData.user.email
        const userMetadata = authData.user.user_metadata || {}
        const usernameVal = userMetadata.username || (userEmail ? userEmail.split('@')[0] : '')

        const { data: legacyProfile } = await adminClient
          .from('profiles')
          .select('id')
          .or(`email.ilike.${userEmail},username.ilike.${usernameVal}`)
          .neq('id', authData.user.id)
          .maybeSingle()

        if (legacyProfile) {
          const { data: legacyMember } = await adminClient
            .from('organization_members')
            .select('organization_id, role, approval_status')
            .eq('user_id', legacyProfile.id)
            .maybeSingle()

          if (legacyMember) {
            await adminClient.from('organization_members').upsert(
              {
                organization_id: legacyMember.organization_id,
                user_id: authData.user.id,
                role: legacyMember.role || 'manager',
                approval_status: legacyMember.approval_status || 'approved',
              },
              { onConflict: 'organization_id,user_id' }
            )
          }
        }
      }
    }

    // Role-based routing
    const { role } = await resolveUserSystemRole(supabase, authData.user)

    if (role === 'super_admin') {
      redirect('/admin/dashboard')
    } else if (role === 'manager' || role === 'employee') {
      redirect('/dashboard')
    } else {
      redirect('/install')
    }
  } catch (err: unknown) {
    // Re-throw redirect so Next.js navigates properly
    if (
      err &&
      typeof err === 'object' &&
      'digest' in err &&
      typeof (err as { digest: string }).digest === 'string' &&
      (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw err
    }
    console.error('SUPABASE AUTH ERROR:', err)
    return {
      error: err instanceof Error ? err.message : 'Unexpected authentication error',
    }
  }
}

export async function register(formData: FormData) {
  const firstName = ((formData.get('firstName') as string) || '').trim()
  const lastName = ((formData.get('lastName') as string) || '').trim()
  const email = ((formData.get('email') as string) || '').trim()
  const username = ((formData.get('username') as string) || '').trim().toLowerCase()
  const password = ((formData.get('password') as string) || '').trim()
  const teamCode = ((formData.get('teamCode') as string) || '').trim().toUpperCase()

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters' }
  }

  const fullName = `${firstName} ${lastName}`.trim() || email.split('@')[0]
  const cleanUsername = username || email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '')

  const supabase = await createClient()

  try {
    // 1. Detect if this user matches a pre-approved Manager profile slot
    // Use admin client if available to bypass RLS during anonymous registration lookup
    const adminSupabase = createAdminClient() || supabase
    let managerQuery = adminSupabase
      .from('profiles')
      .select('*')
      .eq('role', 'manager')

    if (cleanUsername) {
      managerQuery = managerQuery.or(`email.ilike.${email},username.ilike.${cleanUsername}`)
    } else {
      managerQuery = managerQuery.ilike('email', email)
    }

    const { data: preapprovedSlots, error: preapprovedError } = await managerQuery
    if (preapprovedError) {
      console.error('[REGISTER CHECK ERROR]', preapprovedError)
    }
    console.log('[REGISTER CHECK]', { email, username: cleanUsername, slotFound: preapprovedSlots?.length })

    const preApprovedManager = preapprovedSlots && preapprovedSlots.length > 0 ? preapprovedSlots[0] : null

    if (preApprovedManager) {
      let newUserId: string

      // Create user auth account with the manager's chosen password
      // Use admin client if available to bypass rate limits and auto-confirm email
      if (adminSupabase?.auth?.admin) {
        const { data: adminUserData, error: adminUserError } =
          await adminSupabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
              full_name: fullName || preApprovedManager.full_name,
              username: cleanUsername || preApprovedManager.username,
              role: 'manager',
              approval_status: 'approved',
            },
          })

        if (adminUserError || !adminUserData.user) {
          return {
            error:
              adminUserError?.message ||
              'Failed to create manager authentication account.',
          }
        }

        newUserId = adminUserData.user.id
      } else {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName || preApprovedManager.full_name,
              username: cleanUsername || preApprovedManager.username,
              role: 'manager',
              approval_status: 'approved',
            },
          },
        })

        if (signUpError || !signUpData.user) {
          return { error: signUpError?.message || 'Failed to create manager authentication account.' }
        }

        newUserId = signUpData.user.id
      }

      // Fetch any existing organization membership for the pre-approved slot
      const { data: slotMemberships } = await adminSupabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', preApprovedManager.id)
        .order('created_at', { ascending: false })
        .limit(1)

      const slotOrgId =
        slotMemberships?.[0]?.organization_id ||
        (preApprovedManager as { organization_id?: string })?.organization_id ||
        null

      // Claim the pre-approved profile slot
      const { error: claimErr } = await adminSupabase.rpc('claim_preapproved_manager', {
        p_preapproved_id: preApprovedManager.id,
        p_new_user_id: newUserId,
        p_email: email,
        p_full_name: fullName || preApprovedManager.full_name,
        p_username: cleanUsername || preApprovedManager.username,
      })

      // Fallback in case RPC is not yet applied
      if (claimErr) {
        await adminSupabase.from('profiles').upsert(
          {
            id: newUserId,
            email,
            full_name: fullName || preApprovedManager.full_name,
            username: cleanUsername || preApprovedManager.username,
            role: 'manager',
            approval_status: 'approved',
            is_pending_signup: false,
          },
          { onConflict: 'id' }
        )

        if (preApprovedManager.id !== newUserId) {
          await adminSupabase
            .from('organization_members')
            .update({ user_id: newUserId })
            .eq('user_id', preApprovedManager.id)

          await adminSupabase
            .from('manager_notifications')
            .update({ manager_id: newUserId })
            .eq('manager_id', preApprovedManager.id)

          await adminSupabase
            .from('daily_reports')
            .update({ manager_id: newUserId })
            .eq('manager_id', preApprovedManager.id)

          await adminSupabase
            .from('profiles')
            .delete()
            .eq('id', preApprovedManager.id)
        }
      }

      // Ensure organization_members record exists for new manager without creating duplicates
      if (slotOrgId) {
        // Remove any stale or duplicate placeholder rows for this user in other orgs or conflicting slots
        await adminSupabase
          .from('organization_members')
          .delete()
          .eq('user_id', newUserId)
          .neq('organization_id', slotOrgId)

        await adminSupabase.from('organization_members').upsert(
          {
            organization_id: slotOrgId,
            user_id: newUserId,
            role: 'manager',
            approval_status: 'approved',
          },
          { onConflict: 'organization_id,user_id' }
        )

        // Sync manager_id on organizations / teams if column exists
        try {
          await adminSupabase
            .from('organizations')
            .update({ manager_id: newUserId } as unknown as Record<string, unknown>)
            .eq('id', slotOrgId)
        } catch {
          // Ignore if manager_id column does not exist on organizations
        }

        try {
          await adminSupabase
            .from('teams')
            .update({ manager_id: newUserId } as unknown as Record<string, unknown>)
            .eq('id', slotOrgId)
        } catch {
          // Ignore if teams table or manager_id column does not exist
        }
      }

      // Automatically sign in the manager now that account is confirmed
      await supabase.auth.signInWithPassword({
        email,
        password,
      })

      redirect('/dashboard')
    }

    // 2. Joining with Team Code (Employee onboarding)
    if (!teamCode) {
      return { error: 'Please enter a Secret Team Code to join your team.' }
    }

    let orgId: string | null = null
    let requireApproval = true

    // Verify team code
    const { data: orgData } = await supabase
      .from('organizations')
      .select('id, name, require_approval')
      .ilike('team_code', teamCode)
      .maybeSingle()

    if (orgData?.id) {
      orgId = orgData.id
      requireApproval = orgData.require_approval ?? true
    } else {
      const { data: verifiedOrg, error: verifyErr } = await supabase.rpc(
        'verify_team_code',
        { p_team_code: teamCode }
      )
      if (!verifyErr && Array.isArray(verifiedOrg) && verifiedOrg.length > 0) {
        orgId = verifiedOrg[0].organization_id
      }
    }

    if (!orgId) {
      return { error: 'Invalid Team Secret Code. Please verify with your manager.' }
    }

    const initialStatus = requireApproval ? 'pending' : 'approved'

    // Create user
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          username: cleanUsername,
          approval_status: initialStatus,
          role: 'employee',
        },
      },
    })

    if (signUpError || !signUpData.user) {
      return { error: signUpError?.message || 'Failed to register account' }
    }

    const userId = signUpData.user.id

    // Link user to organization
    const { error: joinRpcError } = await supabase.rpc('join_org_by_team_code', {
      p_user_id: userId,
      p_team_code: teamCode,
    })

    if (joinRpcError) {
      await supabase.from('organization_members').upsert(
        {
          organization_id: orgId,
          user_id: userId,
          role: 'employee',
          approval_status: initialStatus,
        },
        { onConflict: 'organization_id,user_id' }
      )
      await supabase
        .from('profiles')
        .update({ username: cleanUsername, approval_status: initialStatus })
        .eq('id', userId)
    }

    redirect(initialStatus === 'approved' ? '/install?status=approved' : '/install?registered=true')
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'digest' in err &&
      typeof (err as { digest: string }).digest === 'string' &&
      (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw err
    }
    console.error('REGISTRATION ERROR:', err)
    return {
      error: err instanceof Error ? err.message : 'Unexpected registration error',
    }
  }
}

export async function signup(formData: FormData) {
  return register(formData)
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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

    // Role-based routing
    const { role } = await resolveUserSystemRole(supabase, authData.user)

    if (role === 'super_admin') {
      redirect('/admin/dashboard')
    } else if (role === 'manager') {
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
    const { data: preApprovedManager } = await supabase
      .from('profiles')
      .select('id, email, username, full_name, role, approval_status')
      .ilike('email', email)
      .eq('role', 'manager')
      .eq('approval_status', 'approved')
      .maybeSingle()

    if (preApprovedManager) {
      // Create user auth account with the manager's chosen password
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

      const newUserId = signUpData.user.id

      // Claim the pre-approved profile slot
      const { error: claimErr } = await supabase.rpc('claim_preapproved_manager', {
        p_preapproved_id: preApprovedManager.id,
        p_new_user_id: newUserId,
        p_email: email,
        p_full_name: fullName || preApprovedManager.full_name,
        p_username: cleanUsername || preApprovedManager.username,
      })

      // Fallback in case RPC is not yet applied
      if (claimErr) {
        await supabase.from('profiles').upsert(
          {
            id: newUserId,
            email,
            full_name: fullName || preApprovedManager.full_name,
            username: cleanUsername || preApprovedManager.username,
            role: 'manager',
            approval_status: 'approved',
          },
          { onConflict: 'id' }
        )

        if (preApprovedManager.id !== newUserId) {
          await supabase
            .from('organization_members')
            .update({ user_id: newUserId })
            .eq('user_id', preApprovedManager.id)

          await supabase
            .from('manager_notifications')
            .update({ manager_id: newUserId })
            .eq('manager_id', preApprovedManager.id)

          await supabase
            .from('daily_reports')
            .update({ manager_id: newUserId })
            .eq('manager_id', preApprovedManager.id)

          await supabase
            .from('profiles')
            .delete()
            .eq('id', preApprovedManager.id)
        }
      }

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

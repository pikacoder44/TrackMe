'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const usernameOrEmail = (formData.get('username') as string || formData.get('email') as string || '').trim()
  const password = (formData.get('password') as string || '').trim()

  if (!usernameOrEmail || !password) {
    return { error: 'Username/Email and password are required' }
  }

  let targetEmail = usernameOrEmail
  const supabase = await createClient()

  try {
    // If not an email format, resolve username to email via RPC or profile lookup
    if (!usernameOrEmail.includes('@')) {
      const { data: resolvedEmail, error: rpcErr } = await supabase
        .rpc('get_email_by_username', { p_username: usernameOrEmail })

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

    // Check membership role for redirection
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role, approval_status')
      .eq('user_id', authData.user.id)
      .limit(1)
      .maybeSingle()

    const role = membership?.role
    const isManagerRole = role && ['owner', 'admin', 'manager'].includes(role)

    if (isManagerRole) {
      redirect('/dashboard')
    } else {
      redirect('/install')
    }
  } catch (err: unknown) {
    // Re-throw redirect so Next.js navigates properly
    if (err && typeof err === 'object' && 'digest' in err && typeof (err as { digest: string }).digest === 'string' && (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')) {
      throw err
    }
    console.error('SUPABASE AUTH ERROR:', err)
    return {
      error: err instanceof Error ? err.message : 'Unexpected authentication error',
    }
  }
}

export async function register(formData: FormData) {
  const firstName = (formData.get('firstName') as string || '').trim()
  const lastName = (formData.get('lastName') as string || '').trim()
  const email = (formData.get('email') as string || '').trim()
  const username = (formData.get('username') as string || '').trim().toLowerCase()
  const password = (formData.get('password') as string || '').trim()
  const teamCode = (formData.get('teamCode') as string || '').trim().toUpperCase()

  if (!firstName || !lastName || !email || !username || !password || !teamCode) {
    return { error: 'All fields are required' }
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters' }
  }

  const supabase = await createClient()

  try {
    // 1. Validate Secret Team Code
    let orgId: string | null = null
    const { data: verifiedOrg, error: verifyErr } = await supabase
      .rpc('verify_team_code', { p_team_code: teamCode })

    if (!verifyErr && Array.isArray(verifiedOrg) && verifiedOrg.length > 0) {
      orgId = verifiedOrg[0].organization_id
    } else {
      // Fallback direct query if RPC not yet created
      const { data: org } = await supabase
        .from('organizations')
        .select('id, name')
        .ilike('team_code', teamCode)
        .maybeSingle()

      if (org?.id) {
        orgId = org.id
      }
    }

    if (!orgId) {
      return { error: 'Invalid Team Secret Code. Please verify with your manager.' }
    }

    // 2. Create user with approval_status: 'pending' in metadata
    const fullName = `${firstName} ${lastName}`.trim()
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          username,
          approval_status: 'pending',
        },
      },
    })

    if (signUpError || !signUpData.user) {
      return { error: signUpError?.message || 'Failed to register account' }
    }

    const userId = signUpData.user.id

    // 3. Link user to organization with approval_status: 'pending' and role: 'employee'
    const { error: joinRpcError } = await supabase
      .rpc('join_org_by_team_code', {
        p_user_id: userId,
        p_team_code: teamCode,
      })

    if (joinRpcError) {
      // Direct insertion fallback
      await supabase
        .from('organization_members')
        .upsert(
          {
            organization_id: orgId,
            user_id: userId,
            role: 'employee',
            approval_status: 'pending',
          },
          { onConflict: 'organization_id,user_id' }
        )
      await supabase
        .from('profiles')
        .update({ username, approval_status: 'pending' })
        .eq('id', userId)
    }

    redirect('/install?registered=true')
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'digest' in err && typeof (err as { digest: string }).digest === 'string' && (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')) {
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
